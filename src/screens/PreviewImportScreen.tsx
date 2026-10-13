/**
 * PreviewImportScreen — «Проверь слова» (plan/ai_import.md, AI 7).
 * Перед добавлением: галочки, фильтры (уже в наборе / без перевода / проверить), правка по нажатию,
 * «+ Фото» — дописать страницы в этот же список. Примеры для «Слова в контексте» — пачками по 25
 * с прогрессом; ошибка пачки не мешает добавлению. В конце — честный итог.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, CheckCircle } from 'lucide-react-native';
import { Text } from '@/components/common';
import { selectSetStats, useCardsStore, useSetsStore, useThemeColors } from '@/store';
import { TOP_LANGUAGES, alpha, borderRadius, iconSize, screenPadding, spacing } from '@/constants';
import {
  Badge,
  Button,
  Chip,
  Dialog,
  ProgressBar,
  ScreenHeader,
  Switch,
  TextField,
  toast,
  useScreenBottomInset,
} from '@/components/ui';
import type { RootStackParamList, RootStackScreenProps } from '@/types/navigation';
import type { CreateCardInput } from '@/types';
import { describeError } from '@/utils/userErrors';
import { pluralize } from '@/utils';
import { apiService } from '@/services/ApiService';
import { ensureAiConsent } from '@/services/aiConsent';
import { clearImportDraft, getImportDraft, saveImportDraft } from '@/services/importDraft';

type Props = RootStackScreenProps<'PreviewImport'>;
type ImportCard = RootStackParamList['PreviewImport']['cards'][number];

// ─── Save Modal ───────────────────────────────────────────────────────────────

function SaveModal({
  visible,
  defaultTitle,
  defaultLanguageFrom,
  defaultLanguageTo,
  saving,
  colors,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  defaultTitle: string;
  defaultLanguageFrom?: string;
  defaultLanguageTo?: string;
  saving: boolean;
  colors: ReturnType<typeof useThemeColors>;
  onConfirm: (title: string, languageFrom: string, languageTo: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  // Языки выбирает пользователь — без выбора набор не создаётся
  const [languageFrom, setLanguageFrom] = useState<string | null>(defaultLanguageFrom ?? null);
  const [languageTo, setLanguageTo] = useState<string | null>(defaultLanguageTo ?? null);
  const [showValidation, setShowValidation] = useState(false);

  // Sync defaultTitle when modal opens. Клавиатуру не открываем сами — только по нажатию на поле
  React.useEffect(() => {
    if (visible) {
      setTitle(defaultTitle);
      setShowValidation(false);
    }
  }, [visible, defaultTitle]);

  const languagesSelected = !!languageFrom && !!languageTo;
  const handleConfirm = () => {
    setShowValidation(true);
    if (!languageFrom || !languageTo) return;
    onConfirm(title, languageFrom, languageTo);
  };

  const renderLanguageRow = (
    label: string,
    selected: string | null,
    onSelect: (code: string) => void,
  ) => (
    <View style={styles.langBlock}>
      <Text variant="label" style={{ color: showValidation && !selected ? colors.errorText : colors.textSecondary }}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.langChips}>
          {TOP_LANGUAGES.map((lang) => {
            const active = selected === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => onSelect(lang.code)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.langChip,
                  {
                    backgroundColor: active ? colors.primaryFill : colors.surfaceMuted,
                    borderColor: active ? colors.primaryFill : showValidation && !selected ? colors.error : colors.surfaceMuted,
                  },
                ]}
              >
                <Text variant="label" style={{ color: active ? colors.onPrimary : colors.textPrimary }}>
                  {lang.flag} {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      // Форма с вводом — по фону не закрываем (брендбук, 7.6)
      dismissOnBackdrop={false}
      title="Название набора"
      footer={
        <View style={styles.modalActions}>
          <Button variant="quiet" tone="secondary" title="Отмена" onPress={onCancel} style={styles.flex1} />
          <Button
            title="Сохранить"
            onPress={handleConfirm}
            loading={saving}
            style={[styles.flex1, !languagesSelected && styles.dimmed]}
          />
        </View>
      }
    >
      <TextField
        placeholder="Например: Биология. Митоз"
        accessibilityLabel="Название набора"
        value={title}
        onChangeText={setTitle}
        returnKeyType="done"
        style={styles.titleField}
      />

      {renderLanguageRow('Язык слов *', languageFrom, setLanguageFrom)}
      {renderLanguageRow('Язык перевода *', languageTo, setLanguageTo)}
      {showValidation && !languagesSelected && (
        <Text variant="caption" style={{ color: colors.errorText, marginTop: spacing.xs }}>
          Выбери оба языка
        </Text>
      )}
    </Dialog>
  );
}

// ─── Логика ───────────────────────────────────────────────────────────────────

interface Item extends ImportCard {
  key: string;
  checked: boolean;
  /** Уже есть в наборе или повторяется в этом же списке */
  duplicate: boolean;
}

type Filter = 'all' | 'duplicate' | 'noTranslation' | 'check';

const EXAMPLE_BATCH = 25;

/** Для сравнения дублей: без регистра и грамматических заметок («der Hund, -e» = «der hund») */
function normalizeFront(front: string): string {
  return front.split(',')[0].trim().toLowerCase().replace(/\s+/g, ' ');
}

function toCardInput(setId: string, c: ImportCard): CreateCardInput {
  return {
    setId,
    frontText: c.front.trim(),
    backText: c.back.trim(),
    // «Незнакомые слова» из текста и сгенерированные примеры — карточка сразу готова для «Слова в контексте»
    ...(c.example ? { example: c.example, wordForm: c.wordForm, wordType: c.wordType } : {}),
  };
}

/** Примеры для карточек без них — пачками по 25 по очереди; не вышло — карточка просто без примера */
async function addExamples(
  cards: ImportCard[],
  languageFrom: string | undefined,
  languageTo: string | undefined,
  onProgress: (done: number) => void,
): Promise<ImportCard[]> {
  const result = [...cards];
  const missing = result.map((c, i) => (c.example ? -1 : i)).filter(i => i >= 0);
  let done = 0;
  for (let start = 0; start < missing.length; start += EXAMPLE_BATCH) {
    const batch = missing.slice(start, start + EXAMPLE_BATCH);
    try {
      const generated = await apiService.generateExamples(
        batch.map(i => ({ front: result[i].front, back: result[i].back })),
        languageFrom,
        languageTo,
      );
      batch.forEach((cardIndex, j) => {
        const gen = generated[j];
        if (gen?.example) {
          result[cardIndex] = {
            ...result[cardIndex],
            example: gen.example,
            wordForm: gen.wordForm || undefined,
            wordType: gen.wordType as ImportCard['wordType'],
          };
        }
      });
    } catch {
      // Сервер занят — эти карточки останутся без примера, итог об этом скажет
    }
    done += batch.length;
    onProgress(done);
  }
  return result;
}

interface Summary {
  setId: string;
  added: number;
  withExamples: number;
  /** id карточек без примера — для «Догенерировать» */
  missingIds: string[];
  skippedDuplicates: number;
  examplesWanted: boolean;
}

// ─── Строка карточки ──────────────────────────────────────────────────────────

const ItemRow = React.memo(function ItemRow({
  item,
  editing,
  onToggle,
  onEdit,
  onChange,
}: {
  item: Item;
  editing: boolean;
  onToggle: (key: string) => void;
  onEdit: (key: string | null) => void;
  onChange: (key: string, patch: Partial<Pick<Item, 'front' | 'back'>>) => void;
}) {
  const colors = useThemeColors();
  const lowConfidence = item.confidence === 'low';
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: editing ? colors.surface : lowConfidence ? alpha(colors.warning, 10) : colors.surfaceMuted,
          borderColor: editing ? colors.primary : 'transparent',
          opacity: item.checked || editing ? 1 : 0.6,
        },
      ]}
    >
      <View style={styles.rowMain}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={`Добавить «${item.front}»`}
          onPress={() => onToggle(item.key)}
          hitSlop={8}
          style={[
            styles.checkbox,
            item.checked
              ? { backgroundColor: colors.primaryFill }
              : { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          {item.checked && <Check size={iconSize.xs} color={colors.onPrimary} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Изменить слово и перевод"
          onPress={() => onEdit(editing ? null : item.key)}
          style={styles.rowTexts}
        >
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{item.front}</Text>
          <Text variant="bodySmall" style={{ color: item.back ? colors.textSecondary : colors.warningText }}>
            {item.back || 'без перевода — нажми, чтобы вписать'}
          </Text>
        </Pressable>
        {item.duplicate ? <Badge label="Уже есть" tone="neutral" />
          : lowConfidence ? <Badge label="Проверь" tone="warning" />
            : null}
      </View>
      {editing && (
        <View style={styles.editor}>
          <TextField label="Слово" value={item.front} onChangeText={t => onChange(item.key, { front: t })} />
          <TextField
            label="Перевод"
            value={item.back}
            placeholder="Впиши перевод"
            onChangeText={t => onChange(item.key, { back: t })}
          />
          <Button size="s" title="Готово" onPress={() => onEdit(null)} />
        </View>
      )}
    </View>
  );
});

// ─── Экран ────────────────────────────────────────────────────────────────────

export function PreviewImportScreen({ navigation, route }: Props) {
  const { cards, suggestedTitle = '', setId, languageFrom: defaultLanguageFrom, languageTo: defaultLanguageTo } = route.params;
  const draftKey = route.params.draftKey ?? setId;
  const colors = useThemeColors();
  const bottomInset = useScreenBottomInset();

  const set = useSetsStore(s => (setId ? s.getSet(setId) : undefined));
  const addSet = useSetsStore(s => s.addSet);
  const updateSetStats = useSetsStore(s => s.updateSetStats);
  const addCards = useCardsStore(s => s.addCards);
  const updateCard = useCardsStore(s => s.updateCard);

  const [items, setItems] = useState<Item[]>(() => {
    const existing = new Set(
      (setId ? useCardsStore.getState().getCardsBySet(setId) : []).map(c => normalizeFront(c.frontText)),
    );
    const seen = new Set<string>();
    return cards.map((card, i) => {
      const norm = normalizeFront(card.front);
      const duplicate = existing.has(norm) || seen.has(norm);
      seen.add(norm);
      return { ...card, key: String(i), checked: !duplicate, duplicate };
    });
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [examplesOn, setExamplesOn] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const checked = items.filter(i => i.checked && i.front.trim());
  const counts = useMemo(() => ({
    duplicate: items.filter(i => i.duplicate).length,
    noTranslation: items.filter(i => !i.back.trim()).length,
    check: items.filter(i => i.confidence === 'low').length,
  }), [items]);
  const visible = useMemo(() => items.filter(i =>
    filter === 'all' ? true
      : filter === 'duplicate' ? i.duplicate
        : filter === 'noTranslation' ? !i.back.trim()
          : i.confidence === 'low'), [items, filter]);
  const allChecked = items.every(i => i.checked);

  const toggle = useCallback((key: string) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, checked: !i.checked } : i)));
  }, []);
  const change = useCallback((key: string, patch: Partial<Pick<Item, 'front' | 'back'>>) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
  }, []);
  const toggleAll = useCallback(() => {
    setItems(prev => prev.map(i => ({ ...i, checked: !allChecked })));
  }, [allChecked]);

  /** «+ Фото»: правки сохраняем в черновик, новые страницы допишутся к этому же списку */
  const addMorePhotos = useCallback(() => {
    const prevDraft = getImportDraft(draftKey);
    saveImportDraft(draftKey, {
      cards: items.map(({ key: _key, checked: _checked, duplicate: _duplicate, ...card }) => card),
      suggestedTitle,
      kind: prevDraft?.kind ?? 'vocab',
      lang: prevDraft?.lang ?? null,
    });
    navigation.navigate('ImportFiles', { setId: draftKey, append: true });
  }, [items, draftKey, suggestedTitle, navigation]);

  // ── сохранение ────────────────────────────────────────────────────────────

  const save = useCallback(async (target: { setId: string; isNew: boolean; languageFrom?: string; languageTo?: string }) => {
    let toAdd: ImportCard[] = checked.map(({ key: _key, checked: _checked, duplicate: _duplicate, ...card }) => card);
    const needExamples = examplesOn && toAdd.some(c => !c.example);
    // Примеры пишет ИИ — без согласия добавляем без них
    const examplesWanted = needExamples && (await ensureAiConsent());

    if (examplesWanted) {
      const total = toAdd.filter(c => !c.example).length;
      setProgress({ done: 0, total });
      toAdd = await addExamples(toAdd, target.languageFrom, target.languageTo, done => setProgress({ done, total }));
    }

    const created = addCards(toAdd.map(c => toCardInput(target.setId, c)));
    const stats = selectSetStats(target.setId);
    updateSetStats(target.setId, {
      cardCount: stats.total,
      newCount: stats.newCount,
      learningCount: stats.learningCount,
      reviewCount: stats.reviewCount,
      masteredCount: stats.masteredCount,
    });
    clearImportDraft(draftKey);
    setProgress(null);
    setSummary({
      setId: target.setId,
      added: created.length,
      withExamples: created.filter(c => c.example).length,
      missingIds: created.filter(c => !c.example).map(c => c.id),
      skippedDuplicates: items.filter(i => i.duplicate && !i.checked).length,
      examplesWanted,
    });
  }, [checked, examplesOn, addCards, updateSetStats, draftKey, items]);

  const handleSaveToExisting = useCallback(async () => {
    if (checked.length === 0) return;
    try {
      await save({ setId, isNew: false, languageFrom: set?.languageFrom, languageTo: set?.languageTo });
    } catch (e) {
      setProgress(null);
      toast.error(describeError(e, 'Не удалось сохранить карточки'));
    }
  }, [checked.length, save, setId, set?.languageFrom, set?.languageTo]);

  const handleSaveConfirm = useCallback(async (title: string, languageFrom: string, languageTo: string) => {
    try {
      const newSet = await addSet({ title: title.trim() || 'Импорт', languageFrom, languageTo });
      setModalVisible(false);
      await save({ setId: newSet.id, isNew: true, languageFrom, languageTo });
    } catch (e) {
      setProgress(null);
      toast.error(describeError(e, 'Не удалось сохранить набор'));
    }
  }, [addSet, save]);

  /** «Догенерировать»: примеры для уже добавленных карточек без них */
  const retryExamples = useCallback(async () => {
    if (!summary || summary.missingIds.length === 0) return;
    const target = useSetsStore.getState().getSet(summary.setId);
    const state = useCardsStore.getState();
    const missing = summary.missingIds
      .map(id => state.getCard(id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    const total = missing.length;
    setProgress({ done: 0, total });
    const filled = await addExamples(
      missing.map(c => ({ front: c.frontText, back: c.backText })),
      target?.languageFrom,
      target?.languageTo,
      done => setProgress({ done, total }),
    );
    const stillMissing: string[] = [];
    filled.forEach((c, i) => {
      if (c.example) updateCard(missing[i].id, { example: c.example, wordForm: c.wordForm, wordType: c.wordType });
      else stillMissing.push(missing[i].id);
    });
    setProgress(null);
    setSummary(prev => prev && {
      ...prev,
      withExamples: prev.added - stillMissing.length,
      missingIds: stillMissing,
    });
  }, [summary, updateCard]);

  // ── render ────────────────────────────────────────────────────────────────

  if (progress) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: colors.background, paddingBottom: bottomInset }]}>
        <Text variant="h2" align="center" style={{ color: colors.textPrimary }}>Пишем примеры</Text>
        <Text variant="body" align="center" color="secondary">
          {`Примеры: ${progress.done} из ${progress.total}`}
        </Text>
        <ProgressBar progress={progress.total ? (progress.done / progress.total) * 100 : 0} style={styles.progress} />
        <Text variant="bodySmall" align="center" color="secondary">
          Для режима «Слово в контексте». Если сервер занят, добавим без примера — их можно дописать позже.
        </Text>
      </View>
    );
  }

  if (summary) {
    const missing = summary.missingIds.length;
    const rows: Array<[string, number, string?]> = [
      ...(summary.examplesWanted ? [['С примерами', summary.withExamples] as [string, number]] : []),
      ...(summary.examplesWanted && missing > 0 ? [['Без примера — сервер был занят', missing, colors.warningText] as [string, number, string]] : []),
      ...(summary.skippedDuplicates > 0 ? [['Пропущено дублей', summary.skippedDuplicates, colors.textSecondary] as [string, number, string]] : []),
    ];
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: bottomInset }]}>
        <View style={styles.doneBody}>
          <View style={[styles.doneIcon, { backgroundColor: alpha(colors.success, 10) }]}>
            <CheckCircle size={iconSize.xl} color={colors.successText} />
          </View>
          <Text variant="h2" align="center" style={{ color: colors.textPrimary }}>
            {`${pluralize(summary.added, 'Добавлена', 'Добавлено', 'Добавлено')} ${summary.added} ${pluralize(summary.added, 'карточка', 'карточки', 'карточек')}`}
          </Text>
          {rows.length > 0 && (
            <View style={styles.doneRows}>
              {rows.map(([label, value, color]) => (
                <View key={label} style={[styles.doneRow, { borderBottomColor: colors.border }]}>
                  <Text variant="body" style={{ color: colors.textPrimary }}>{label}</Text>
                  <Text variant="body" style={{ color: color ?? colors.textPrimary, fontWeight: '700' }}>{value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.doneActions}>
          <Button title="К набору" onPress={() => navigation.navigate('SetDetail', { setId: summary.setId })} fullWidth />
          {summary.examplesWanted && missing > 0 && (
            <Button
              variant="secondary"
              title={`Догенерировать ${missing} ${pluralize(missing, 'пример', 'примера', 'примеров')}`}
              onPress={retryExamples}
              fullWidth
            />
          )}
        </View>
      </View>
    );
  }

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'Все', count: items.length },
    { key: 'duplicate', label: 'Уже есть', count: counts.duplicate },
    { key: 'noTranslation', label: 'Без перевода', count: counts.noTranslation },
    { key: 'check', label: 'Проверить', count: counts.check },
  ];

  return (
    // Верхний safe area уже учтён в App.tsx; снизу — свой (экран без панели вкладок)
    <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: bottomInset }]}>
      <ScreenHeader
        title="Проверь слова"
        onBack={() => navigation.goBack()}
        right={<Button variant="quiet" size="s" title={allChecked ? 'Снять все' : 'Отметить все'} onPress={toggleAll} />}
      />
      <Text variant="bodySmall" color="secondary" style={styles.subtitle}>
        {`Будет добавлено ${checked.length} из ${items.length}`}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.filter(f => f.key === 'all' || f.count > 0).map(f => (
          <Chip key={f.key} label={`${f.label} ${f.count}`} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      <FlatList
        data={visible}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <ItemRow item={item} editing={editingKey === item.key} onToggle={toggle} onEdit={setEditingKey} onChange={change} />
        )}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View style={[styles.bottom, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>Примеры предложений</Text>
            <Text variant="caption" color="secondary">ИИ допишет к каждой карточке — для «Слова в контексте»</Text>
          </View>
          <Switch value={examplesOn} onValueChange={setExamplesOn} accessibilityLabel="Примеры предложений" />
        </View>
        <View style={styles.bottomButtons}>
          {setId ? <Button variant="secondary" title="+ Фото" onPress={addMorePhotos} /> : null}
          <Button
            title={checked.length === 0
              ? 'Ничего не выбрано'
              : `${setId ? 'Добавить' : 'Сохранить'} ${checked.length} ${pluralize(checked.length, 'карточку', 'карточки', 'карточек')}`}
            onPress={setId ? handleSaveToExisting : () => setModalVisible(true)}
            disabled={checked.length === 0}
            style={styles.flex1}
          />
        </View>
      </View>

      {!setId && (
        <SaveModal
          visible={modalVisible}
          defaultTitle={suggestedTitle}
          defaultLanguageFrom={defaultLanguageFrom}
          defaultLanguageTo={defaultLanguageTo}
          saving={false}
          colors={colors}
          onConfirm={handleSaveConfirm}
          onCancel={() => setModalVisible(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { justifyContent: 'center', paddingHorizontal: screenPadding, gap: spacing.s },
  progress: { marginVertical: spacing.s },
  flex1: { flex: 1 },
  dimmed: { opacity: 0.6 },
  subtitle: { paddingHorizontal: screenPadding, marginTop: -spacing.xs },
  filters: { paddingHorizontal: screenPadding, paddingVertical: spacing.s, gap: spacing.xs },
  list: { paddingHorizontal: screenPadding, paddingBottom: spacing.l },
  separator: { height: spacing.xs },
  row: { borderRadius: borderRadius.l, borderWidth: 1.5, padding: spacing.s, gap: spacing.s },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: { flex: 1, gap: spacing.xxs },
  editor: { gap: spacing.s },
  bottom: { paddingHorizontal: screenPadding, paddingTop: spacing.s, paddingBottom: spacing.m, borderTopWidth: 1, gap: spacing.s },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  switchText: { flex: 1, gap: spacing.xxs },
  bottomButtons: { flexDirection: 'row', gap: spacing.s },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: screenPadding, gap: spacing.s },
  doneIcon: { width: 84, height: 84, borderRadius: borderRadius.xl, alignItems: 'center', justifyContent: 'center' },
  doneRows: { alignSelf: 'stretch', marginTop: spacing.m },
  doneRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.s, borderBottomWidth: StyleSheet.hairlineWidth },
  doneActions: { paddingHorizontal: screenPadding, paddingBottom: spacing.l, gap: spacing.s },
  // Модалка нового набора
  titleField: { marginBottom: spacing.m },
  modalActions: { flexDirection: 'row', gap: spacing.s },
  langBlock: { gap: spacing.xs, marginBottom: spacing.s },
  langChips: { flexDirection: 'row', gap: spacing.xs },
  langChip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
});
