/**
 * «Какую книгу учишь?» — сразу после кода учебного центра (plan/new/center_books.md, Center 6, этап 7).
 * «Добавить книгу» делает книгу целиком моим курсом и открывает главную на нём — юнит не выбираем.
 * Другие книги центра потом добавляют из «Библиотеки». Языки — вкладками, если у центра их больше
 * одного. Языки карточек берутся из книги.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BookOpen, Check } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  ScreenHeader,
  toast,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { useCenterStore } from '@/store/centerStore';
import { borderRadius, getLanguageLabel, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { activeCenter, centerBooksOfLanguage, centerLanguages } from '@/services/centerBooks';
import { addCenterBookCourse } from '@/components/study/centerSession';
import type { RootStackScreenProps } from '@/types/navigation';

export function CenterBookPickScreen({
  navigation,
  route,
}: RootStackScreenProps<'CenterBookPick'>) {
  const orgId = route.params?.orgId;
  const colors = useThemeColors();
  const data = useCenterStore((s) => s.data);
  const loaded = useCenterStore((s) => s.loaded);
  const refresh = useCenterStore((s) => s.refresh);
  const center = activeCenter(data, orgId);
  const languages = useMemo(() => (center ? centerLanguages(center) : []), [center]);
  const initialLanguage = languages[0] || '';
  const [language, setLanguage] = useState(initialLanguage);
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);
  useEffect(() => {
    if (!language && initialLanguage) setLanguage(initialLanguage);
  }, [language, initialLanguage]);

  const books = center ? centerBooksOfLanguage(center, language) : [];
  const header = <ScreenHeader bordered={false} />;

  // Книга целиком — мой курс; сразу главная на нём (не «Мои наборы» и без сессии)
  const add = async () => {
    if (!picked || adding) return;
    setAdding(true);
    const r = await addCenterBookCourse(picked, 'onboarding');
    setAdding(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Home' } }] });
  };

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
          title={picked ? 'Добавить книгу' : 'Выбери книгу'}
          disabled={!picked}
          loading={adding}
          fullWidth
          onPress={add}
        />
      }
    >
      <View style={styles.head}>
        <Text variant="h1" style={{ color: colors.textPrimary }}>
          Какую книгу учишь?
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
                  {b.courseId ? (
                    <Badge label="Добавлена" tone="neutral" style={styles.badge} />
                  ) : null}
                </View>
                {selected ? <Check size={iconSize.m} color={colors.primary} /> : null}
              </View>
            </Card>
          );
        })}
      </View>

      <Text variant="bodySmall" style={[styles.note, { color: colors.textSecondary }]}>
        Откроются сразу все юниты — отдельным курсом в боковом меню. Другие книги центра будут в
        «Библиотеке».
      </Text>
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
  note: { marginBottom: spacing.xs },
});
