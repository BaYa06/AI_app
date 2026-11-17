/**
 * «Какую книгу учишь?» — книги учебного центра (plan/new/center_books.md, Center 6).
 * Сразу после кода центра (first), «Сменить книгу» (change), «Добавить книгу» (add) из «Моих книг».
 * Языки — вкладками, если у центра их больше одного. Языки карточек берутся из книги.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BookOpen, Check } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Badge, Button, Card, Chip, EmptyState, Screen, ScreenHeader } from '@/components/ui';
import { useThemeColors } from '@/store';
import { useCenterStore } from '@/store/centerStore';
import { borderRadius, getLanguageLabel, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import {
  activeBookEntry,
  activeCenter,
  centerBooksOfLanguage,
  centerLanguages,
} from '@/services/centerBooks';
import type { RootStackScreenProps } from '@/types/navigation';

const TITLES = {
  first: 'Какую книгу учишь?',
  change: 'На какую книгу перейти?',
  add: 'Какую книгу добавить?',
  unit: 'Какую книгу учишь?',
} as const;

export function CenterBookPickScreen({
  navigation,
  route,
}: RootStackScreenProps<'CenterBookPick'>) {
  const { orgId, mode, replaceBookId } = route.params;
  const colors = useThemeColors();
  const data = useCenterStore((s) => s.data);
  const loaded = useCenterStore((s) => s.loaded);
  const refresh = useCenterStore((s) => s.refresh);
  const center = activeCenter(data, orgId);
  const current = activeBookEntry(data);
  const languages = useMemo(() => (center ? centerLanguages(center) : []), [center]);
  const myIds = useMemo(() => new Set((data?.myBooks ?? []).map((m) => m.bookId)), [data]);
  const myLanguages = useMemo(
    () => new Set((center?.books ?? []).filter((b) => myIds.has(b.id)).map((b) => b.languageFrom)),
    [center, myIds]
  );

  // Вкладка по умолчанию: «добавить» — язык, которого ещё нет; «сменить» — язык текущей книги
  const initialLanguage =
    (mode === 'add' && languages.find((l) => !myLanguages.has(l))) ||
    (mode === 'change' && current?.book.languageFrom) ||
    languages[0] ||
    '';
  const [language, setLanguage] = useState(initialLanguage);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);
  useEffect(() => {
    if (!language && initialLanguage) setLanguage(initialLanguage);
  }, [language, initialLanguage]);

  const books = center ? centerBooksOfLanguage(center, language) : [];
  const header = (
    <ScreenHeader
      title={mode === 'add' ? 'Добавить книгу' : mode === 'change' ? 'Сменить книгу' : undefined}
      onBack={mode === 'first' ? undefined : () => navigation.goBack()}
      bordered={mode !== 'first'}
    />
  );

  if (!center) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={BookOpen}
          title={loaded ? 'Нет доступа к книгам центра' : 'Загружаем книги центра'}
          description={
            loaded
              ? 'Возьми актуальный код у менеджера курса и введи его в «Ввести код».'
              : undefined
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      footer={
        <Button
          title="Дальше"
          disabled={!picked}
          fullWidth
          onPress={() =>
            picked &&
            navigation.navigate('CenterUnitPick', {
              bookId: picked,
              mode,
              replaceBookId: mode === 'change' ? (replaceBookId ?? current?.book.id) : undefined,
            })
          }
        />
      }
    >
      <View style={styles.head}>
        <Text variant="h1" style={{ color: colors.textPrimary }}>
          {TITLES[mode]}
        </Text>
        <Text variant="body" style={{ color: colors.textSecondary }}>
          Посмотри на обложку учебника или спроси учителя.
        </Text>
      </View>

      {languages.length > 1 ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {languages.map((code) => (
            <Chip
              key={code}
              label={getLanguageLabel(code)}
              selected={code === language}
              onPress={() => {
                setLanguage(code);
                setPicked(null);
              }}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.list}>
        {books.map((b) => {
          const selected = picked === b.id;
          return (
            <Card
              key={b.id}
              tone={selected ? 'selected' : 'default'}
              onPress={() => setPicked(b.id)}
              accessibilityLabel={`${b.title}${b.level ? ', ' + b.level : ''}`}
            >
              <View style={styles.row}>
                <View style={[styles.cover, { backgroundColor: colors.surfaceVariant }]}>
                  <Text variant="label" style={{ color: colors.primary }}>
                    {b.level || getLanguageLabel(b.languageFrom).slice(0, 2)}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyLarge" style={[styles.bold, { color: colors.textPrimary }]}>
                    {b.title}
                  </Text>
                  <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                    {b.unitsCount} {pluralize(b.unitsCount, 'юнит', 'юнита', 'юнитов')} ·{' '}
                    {b.cardsCount} {pluralize(b.cardsCount, 'слово', 'слова', 'слов')}
                  </Text>
                  {myIds.has(b.id) ? (
                    <Badge label="Уже учишь" tone="neutral" style={styles.badge} />
                  ) : null}
                </View>
                {selected ? <Check size={iconSize.m} color={colors.primary} /> : null}
              </View>
            </Card>
          );
        })}
      </View>

      <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
        Языки карточек — из книги: {getLanguageLabel(language)} →{' '}
        {getLanguageLabel(books[0]?.languageTo ?? 'ru')}. Выбирать не нужно.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs, marginBottom: spacing.m },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.m },
  list: { gap: spacing.s, marginBottom: spacing.m },
  row: { flexDirection: 'row', gap: spacing.m, alignItems: 'center' },
  cover: {
    width: 48,
    height: 60,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: '700' },
  badge: { alignSelf: 'flex-start', marginTop: spacing.xxs },
});
