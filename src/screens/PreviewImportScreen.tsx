import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSetsStore, useCardsStore } from '@/store';
import { spacing, borderRadius, iconSize, screenPadding, TOP_LANGUAGES, alpha } from '@/constants';
import { Button, Dialog, ScreenHeader, TextField, toast, useScreenBottomInset } from '@/components/ui';
import type { RootStackScreenProps } from '@/types/navigation';
import { BookOpen } from 'lucide-react-native';
import { describeError } from '@/utils/userErrors';

type Props = RootStackScreenProps<'PreviewImport'>;

type CardItem = { front: string; back: string };

// ─── Save Modal ───────────────────────────────────────────────────────────────

function SaveModal({
  visible,
  defaultTitle,
  saving,
  colors,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  defaultTitle: string;
  saving: boolean;
  colors: ReturnType<typeof useThemeColors>;
  onConfirm: (title: string, languageFrom: string, languageTo: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  // Языки выбирает пользователь — без выбора набор не создаётся
  const [languageFrom, setLanguageFrom] = useState<string | null>(null);
  const [languageTo, setLanguageTo] = useState<string | null>(null);
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

// ─── Card Row ─────────────────────────────────────────────────────────────────

function CardRow({
  item,
  index,
  colors,
}: {
  item: CardItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.cardRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.cardIndex, { backgroundColor: alpha(colors.primary, 10) }]}>
        <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
          {index + 1}
        </Text>
      </View>
      <View style={styles.cardTexts}>
        <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>
          {item.front}
        </Text>
        {item.back ? (
          <Text variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
            {item.back}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function PreviewImportScreen({ navigation, route }: Props) {
  const { cards, suggestedTitle = '', setId } = route.params;
  const colors = useThemeColors();
  const bottomInset = useScreenBottomInset();

  const addSet = useSetsStore(s => s.addSet);
  const updateSetStats = useSetsStore(s => s.updateSetStats);
  const addCards = useCardsStore(s => s.addCards);

  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── save to existing set ──────────────────────────────────────────────────

  const handleSaveToExisting = useCallback(async () => {
    setSaving(true);
    try {
      addCards(cards.map(c => ({ setId, frontText: c.front, backText: c.back })));
      updateSetStats(setId, { cardCount: cards.length, newCount: cards.length });
      navigation.replace('SetDetail', { setId });
    } catch (e: any) {
      toast.error(describeError(e, 'Не удалось сохранить карточки'));
    } finally {
      setSaving(false);
    }
  }, [cards, setId, addCards, updateSetStats, navigation]);

  // ── save as new set ───────────────────────────────────────────────────────

  const handleSaveConfirm = useCallback(async (title: string, languageFrom: string, languageTo: string) => {
    const trimmed = title.trim() || 'Импорт';
    setSaving(true);
    try {
      const newSet = await addSet({ title: trimmed, languageFrom, languageTo });
      addCards(cards.map(c => ({ setId: newSet.id, frontText: c.front, backText: c.back })));
      updateSetStats(newSet.id, { cardCount: cards.length, newCount: cards.length });
      setModalVisible(false);
      navigation.replace('SetDetail', { setId: newSet.id });
    } catch (e: any) {
      toast.error(describeError(e, 'Не удалось сохранить набор'));
    } finally {
      setSaving(false);
    }
  }, [cards, addSet, addCards, updateSetStats, navigation]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    // Верхний safe area уже учтён в App.tsx; снизу — свой (экран без панели вкладок)
    <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: bottomInset }]}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        bordered
        center={
          <View style={styles.headerTitles} accessibilityRole="header">
            <Text variant="button" style={[styles.noLetterSpacing, { color: colors.textPrimary }]}>
              Предпросмотр
            </Text>
            <Text variant="caption" color="secondary">
              {cards.length} {declCard(cards.length)}
            </Text>
          </View>
        }
        right={
          <View style={[styles.countBadge, { backgroundColor: alpha(colors.primary, 10) }]}>
            <BookOpen size={iconSize.xs} color={colors.primary} />
            <Text variant="caption" style={[styles.bold, { color: colors.primary }]}>
              {cards.length}
            </Text>
          </View>
        }
      />

      {/* Card list */}
      <FlatList
        data={cards}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <CardRow item={item} index={index} colors={colors} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      />

      {/* Bottom actions */}
      <View style={[styles.bottom, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Button
          title="Изменить"
          variant="secondary"
          onPress={() => navigation.goBack()}
          style={styles.flex1}
        />
        <Button
          title={setId ? 'Добавить в набор' : 'Сохранить набор'}
          onPress={setId ? handleSaveToExisting : () => setModalVisible(true)}
          loading={saving}
          style={styles.flex2}
        />
      </View>

      {/* Modal — only for new set flow */}
      {!setId && (
        <SaveModal
          visible={modalVisible}
          defaultTitle={suggestedTitle}
          saving={saving}
          colors={colors}
          onConfirm={handleSaveConfirm}
          onCancel={() => !saving && setModalVisible(false)}
        />
      )}
    </View>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function declCard(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'карточек';
  if (mod10 === 1) return 'карточка';
  if (mod10 >= 2 && mod10 <= 4) return 'карточки';
  return 'карточек';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  bold: { fontWeight: '700' },
  noLetterSpacing: { letterSpacing: 0 },
  dimmed: { opacity: 0.6 },
  headerTitles: { alignItems: 'center' },
  titleField: { marginBottom: spacing.m },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  list: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    paddingBottom: spacing.l,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.s,
  },
  cardIndex: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTexts: {
    flex: 1,
  },
  bottom: {
    flexDirection: 'row',
    gap: spacing.s,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    paddingBottom: spacing.m,
    borderTopWidth: 1,
  },
  // Modal
  modalActions: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  langBlock: {
    gap: spacing.xs,
    marginBottom: spacing.s,
  },
  langChips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  langChip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
});
