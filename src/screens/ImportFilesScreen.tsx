/**
 * ImportFilesScreen — «Создать карточки» (plan/ai_import.md, AI 4, вариант A).
 * Единый экран ИИ-импорта: камера, галерея, файл (PDF/CSV/TSV/TXT) или вставленный текст +
 * что сделать (слова с переводом / слова из текста / термины / вопрос-ответ).
 * Простые таблицы «слово — перевод» разбираем сами, без ИИ и без расхода дневного лимита.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Camera,
  Check,
  ClipboardPaste,
  FileText,
  Images,
  Sparkles,
  Table,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Chip, ScreenHeader, TextField, toast, useScreenBottomInset } from '@/components/ui';
import type { IconComponent } from '@/components/ui';
import { ImportGuideSheet } from '@/components/import/ImportGuideSheet';
import { useSetsStore, useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, screenPadding, spacing } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import { ensureAiConsent } from '@/services/aiConsent';
import {
  AiImportError,
  IMPORT_LIMITS,
  getAiUsage,
  importFiles,
  payloadSize,
  type AiUsage,
  type CefrLevel,
  type ImportFile,
  type ImportGoal,
} from '@/services/AiImportService';
import { PickError, pickDocuments, pickFromCamera, pickFromGallery } from '@/utils/importPicker';
import { parseWordTable } from '@/utils/parseWordTable';

type Props = RootStackScreenProps<'ImportFiles'>;
/** Выбор файлов: готовые к отправке файлы или null, если пользователь отменил */
type FilePicker = typeof pickFromCamera;

const GOALS: Array<{ goal: ImportGoal; label: string }> = [
  { goal: 'vocab', label: 'Слова с переводом' },
  { goal: 'pick_words', label: 'Выбрать слова из текста' },
  { goal: 'terms', label: 'Термины' },
  { goal: 'qa', label: 'Вопрос-ответ' },
];

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

const FILE_ICONS: Record<ImportFile['kind'], IconComponent> = {
  image: Images,
  pdf: FileText,
  table: Table,
  text: ClipboardPaste,
};

function formatResetTime(resetAt?: string): string {
  if (!resetAt) return 'завтра';
  const date = new Date(resetAt);
  return Number.isNaN(date.getTime())
    ? 'завтра'
    : `в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Понятный текст ошибки ИИ-импорта (подробные экраны ошибок — AI 5) */
function errorMessage(error: unknown): string {
  if (error instanceof AiImportError) {
    switch (error.code) {
      case 'ai_busy': return 'ИИ сейчас перегружен. Попробуй через минуту';
      case 'daily_limit': return `Распознавания на сегодня закончились. Новые — ${formatResetTime(error.resetAt)}`;
      case 'too_large': return 'Слишком много за раз — максимум ~3 МБ. Убери пару фото';
      default: return error.message;
    }
  }
  return 'Не удалось создать карточки. Попробуй ещё раз';
}

// ─── Плитка источника ─────────────────────────────────────────────────────────

const SourceTile = React.memo(function SourceTile({
  icon: Icon,
  title,
  hint,
  primary,
  disabled,
  onPress,
}: {
  icon: IconComponent;
  title: string;
  hint: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const fg = primary ? colors.onPrimary : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: primary ? colors.primaryFill : colors.surfaceMuted, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: primary ? alpha(colors.onPrimary, 20) : colors.surface }]}>
        <Icon size={iconSize.m} color={primary ? colors.onPrimary : colors.primary} />
      </View>
      <Text variant="body" style={{ color: fg, fontWeight: '700' }}>{title}</Text>
      <Text variant="caption" style={primary ? { color: colors.onPrimary, opacity: 0.9 } : { color: colors.textSecondary }}>{hint}</Text>
    </Pressable>
  );
});

// ─── Экран ────────────────────────────────────────────────────────────────────

export function ImportFilesScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();
  const bottomInset = useScreenBottomInset();
  const set = useSetsStore(s => s.getSet(setId));

  const [files, setFiles] = useState<ImportFile[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [goal, setGoal] = useState<ImportGoal>('vocab');
  const [level, setLevel] = useState<CefrLevel>('B1');
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);

  useEffect(() => {
    getAiUsage().then(setUsage);
  }, []);

  const slotsLeft = IMPORT_LIMITS.maxFiles - files.length;
  const hasInput = files.length > 0 || pasted.trim().length > 0;
  const languages = set?.languageFrom && set?.languageTo
    ? `${set.languageFrom.toUpperCase()} → ${set.languageTo.toUpperCase()}`
    : null;

  // ── выбор файлов ──────────────────────────────────────────────────────────

  const addPicked = useCallback(async (pick: FilePicker) => {
    try {
      const picked = await pick();
      if (!picked?.length) return;
      setFiles(prev => {
        const next = [...prev, ...picked].slice(0, IMPORT_LIMITS.maxFiles);
        if (prev.length + picked.length > IMPORT_LIMITS.maxFiles) {
          toast.info(`За раз — до ${IMPORT_LIMITS.maxFiles} файлов`);
        }
        return next;
      });
    } catch (error) {
      toast.error(error instanceof PickError ? error.message : 'Не удалось добавить файл');
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // ── отправка ──────────────────────────────────────────────────────────────

  /** Всё, что уйдёт в запрос: файлы + вставленный текст */
  const inputs = useMemo<ImportFile[]>(() => {
    const text = pasted.trim();
    return text
      ? [...files, { id: 'pasted', name: 'Вставленный текст', kind: 'text', mimeType: 'text/plain', content: text }]
      : files;
  }, [files, pasted]);

  const handleSubmit = useCallback(async () => {
    if (!hasInput || loading) return;

    // Простые таблицы «слово — перевод» — без ИИ
    if (goal === 'vocab' && !prompt.trim() && inputs.every(f => f.kind === 'table')) {
      const pairs = inputs.map(f => parseWordTable(f.content || ''));
      if (pairs.every(p => p !== null)) {
        const cards = pairs.flat() as Array<{ front: string; back: string }>;
        navigation.navigate('PreviewImport', { cards, setId });
        return;
      }
    }

    const total = inputs.reduce((sum, f) => sum + payloadSize(f), 0);
    if (total > IMPORT_LIMITS.maxTotalChars) {
      toast.info('Слишком много за раз — максимум ~3 МБ. Убери пару фото или отправь частями');
      return;
    }

    // Файлы разбирает ИИ — сначала согласие на передачу данных
    if (!(await ensureAiConsent())) return;

    setLoading(true);
    try {
      const result = await importFiles({
        files: inputs,
        goal,
        level: goal === 'pick_words' ? level : undefined,
        prompt: promptOpen ? prompt : undefined,
        languageFrom: set?.languageFrom,
        languageTo: set?.languageTo,
      });
      if (result.usage) setUsage(result.usage);

      if (result.cards.length > 0) {
        navigation.navigate('PreviewImport', { cards: result.cards, suggestedTitle: result.suggestedTitle, setId });
        return;
      }
      // Пока нет экрана выбора (AI 6) — подсказываем цель прямо здесь
      if (result.kind === 'text') {
        setGoal('pick_words');
        toast.info('Это сплошной текст, а не список слов. Выбрали «Слова из текста» — нажми ещё раз');
      } else if (result.kind === 'exercise') {
        toast.info('Похоже на упражнение, а не на список слов. Найди словарик к уроку или напиши инструкцию');
      } else {
        toast.info('Не нашли слов. Сними страницу ровно, при хорошем свете');
      }
    } catch (error) {
      if (error instanceof AiImportError && error.code === 'daily_limit') {
        setUsage(u => (u ? { ...u, used: u.limit } : u));
      }
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [hasInput, loading, goal, prompt, promptOpen, inputs, level, set?.languageFrom, set?.languageTo, navigation, setId]);

  // ── render ────────────────────────────────────────────────────────────────

  const usageLeft = usage ? Math.max(usage.limit - usage.used, 0) : null;

  return (
    // Верхний safe area уже учтён в App.tsx; снизу — свой (экран без панели вкладок)
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Создать карточки" onBack={() => navigation.goBack()} />
      {(set?.title || languages) && (
        <Text variant="caption" color="secondary" style={styles.subtitle} numberOfLines={1}>
          {[set?.title && `Набор «${set.title}»`, languages].filter(Boolean).join(' · ')}
        </Text>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 160 + bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Источники ── */}
        <View style={styles.grid}>
          <SourceTile
            icon={Camera}
            title="Сфотографировать"
            hint="Страница учебника или тетради"
            primary
            disabled={slotsLeft <= 0}
            onPress={() => addPicked(pickFromCamera)}
          />
          <SourceTile
            icon={Images}
            title="Из галереи"
            hint="До 5 фото за раз, скриншоты тоже"
            disabled={slotsLeft <= 0}
            onPress={() => addPicked(() => pickFromGallery(slotsLeft))}
          />
          <SourceTile
            icon={FileText}
            title="Файл"
            hint="PDF до 3 МБ, CSV, TSV"
            disabled={slotsLeft <= 0}
            onPress={() => addPicked(() => pickDocuments(slotsLeft))}
          />
          <SourceTile
            icon={ClipboardPaste}
            title="Вставить текст"
            hint="Список из заметок, чата, сайта"
            onPress={() => setPasteOpen(true)}
          />
        </View>

        {/* ── Выбранное ── */}
        {files.length > 0 && (
          <View style={styles.files}>
            {files.map(file => {
              const Icon = FILE_ICONS[file.kind];
              return (
                <View key={file.id} style={[styles.fileRow, { backgroundColor: colors.surfaceMuted }]}>
                  {file.previewUri ? (
                    <Image source={{ uri: file.previewUri }} style={styles.thumb} accessibilityIgnoresInvertColors />
                  ) : (
                    <View style={[styles.thumb, styles.thumbIcon, { backgroundColor: colors.surface }]}>
                      <Icon size={iconSize.s} color={colors.primary} />
                    </View>
                  )}
                  <Text variant="bodySmall" style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Button
                    variant="icon"
                    icon={X}
                    background="none"
                    iconSize={iconSize.xs}
                    iconColor={colors.textSecondary}
                    accessibilityLabel={`Убрать ${file.name}`}
                    onPress={() => removeFile(file.id)}
                  />
                </View>
              );
            })}
          </View>
        )}

        {pasteOpen && (
          <View style={styles.section}>
            <TextField
              label="Текст или список слов"
              placeholder={'der Hund — собака\nlaufen — бегать\n…или вставь статью целиком'}
              multiline
              value={pasted}
              onChangeText={t => setPasted(t.slice(0, IMPORT_LIMITS.maxPastedChars))}
              hint={`${pasted.length} / ${IMPORT_LIMITS.maxPastedChars}`}
              inputStyle={styles.pasteInput}
              right={
                <Button
                  variant="icon"
                  icon={X}
                  background="none"
                  iconSize={iconSize.xs}
                  iconColor={colors.textSecondary}
                  accessibilityLabel="Убрать вставленный текст"
                  onPress={() => { setPasted(''); setPasteOpen(false); }}
                />
              }
            />
          </View>
        )}

        {/* ── Что сделать ── */}
        <View style={styles.section}>
          <Text variant="overline" color="secondary">Что сделать</Text>
          <View style={styles.chips}>
            {GOALS.map(item => (
              <Chip key={item.goal} label={item.label} selected={goal === item.goal} onPress={() => setGoal(item.goal)} />
            ))}
          </View>
          {goal === 'pick_words' && (
            <View style={styles.levelRow}>
              <Text variant="caption" color="secondary">Твой уровень:</Text>
              {LEVELS.map(l => (
                <Chip key={l} label={l} selected={level === l} onPress={() => setLevel(l)} />
              ))}
            </View>
          )}
          {promptOpen ? (
            <TextField
              label="Своя инструкция для ИИ"
              placeholder="Например: только глаголы, перевод на английский"
              value={prompt}
              onChangeText={t => setPrompt(t.slice(0, 500))}
              multiline
              right={
                <Button
                  variant="icon"
                  icon={X}
                  background="none"
                  iconSize={iconSize.xs}
                  iconColor={colors.textSecondary}
                  accessibilityLabel="Убрать свою инструкцию"
                  onPress={() => { setPrompt(''); setPromptOpen(false); }}
                />
              }
            />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setPromptOpen(true)} hitSlop={8}>
              <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>+ Своя инструкция для ИИ</Text>
            </Pressable>
          )}
        </View>

        {/* ── Подсказка ── */}
        <View style={[styles.tips, { borderColor: colors.border }]}>
          <View style={styles.tipsHeader}>
            <Text variant="label" style={{ color: colors.textPrimary }}>ИИ поймёт лучше всего</Text>
            <Pressable accessibilityRole="button" onPress={() => setGuideOpen(true)} hitSlop={8}>
              <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>Примеры →</Text>
            </Pressable>
          </View>
          {[
            'Список или таблица: слово — перевод',
            'Одна страница, ровно, при хорошем свете',
            'Без перевода тоже можно — ИИ переведёт сам',
          ].map(tip => (
            <View key={tip} style={styles.tipRow}>
              <Check size={iconSize.xs} color={colors.successText} />
              <Text variant="bodySmall" color="secondary" style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Низ ── */}
      <View style={[styles.bottom, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: spacing.m + bottomInset }]}>
        {usageLeft !== null && (
          <Text variant="caption" color="secondary" align="center" style={styles.usage}>
            {usageLeft > 0
              ? `Сегодня доступно ${usageLeft} из ${usage!.limit} распознаваний`
              : `Распознавания на сегодня закончились. Новые — ${formatResetTime(usage!.resetAt)}`}
          </Text>
        )}
        <Button
          title={loading ? 'ИИ создаёт карточки…' : 'Создать карточки'}
          icon={Sparkles}
          onPress={handleSubmit}
          disabled={!hasInput || loading}
          loading={loading}
          fullWidth
        />
      </View>

      <ImportGuideSheet visible={guideOpen} onClose={() => setGuideOpen(false)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  subtitle: { paddingHorizontal: screenPadding, marginTop: -spacing.xs, marginBottom: spacing.xs },
  scroll: { flex: 1 },
  content: { paddingHorizontal: screenPadding, paddingTop: spacing.s, gap: spacing.l },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 124,
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    gap: spacing.xxs,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  files: { gap: spacing.xs, marginTop: -spacing.s },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: borderRadius.l,
    padding: spacing.xs,
  },
  thumb: { width: 40, height: 52, borderRadius: borderRadius.s },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  fileName: { flex: 1 },
  section: { gap: spacing.s },
  pasteInput: { minHeight: 120, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  tips: { borderWidth: 1, borderRadius: borderRadius.xl, padding: spacing.m, gap: spacing.xs },
  tipsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxs },
  tipRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  tipText: { flex: 1 },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    borderTopWidth: 1,
  },
  usage: { marginBottom: spacing.xs },
});
