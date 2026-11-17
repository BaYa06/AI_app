/**
 * «Мои книги» — книги учебного центра, которые выбрал ученик (plan/new/center_books.md, Center 6).
 * У каждой книги свой юнит и прогресс (card_progress) — при смене ничего не теряется.
 * Нажатие делает книгу текущей (на главной); нажатие на текущую — сменить юнит.
 * Пройден последний юнит — «Перейти на …», если у центра есть следующий уровень того же языка.
 */
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BookOpen, CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Badge, Button, Card, EmptyState, Screen, ScreenHeader, toast } from '@/components/ui';
import { useThemeColors } from '@/store';
import { useCenterStore } from '@/store/centerStore';
import { alpha, borderRadius, getLanguageLabel, iconSize, spacing } from '@/constants';
import {
  isCenterOpen,
  myBookEntries,
  nextLevelBook,
  type MyBookEntry,
} from '@/services/centerBooks';
import { formatAccessDate } from '@/utils/centerCode';
import { CenterLogo } from '@/screens/courseJoin/CenterFoundScreen';
import type { RootStackScreenProps } from '@/types/navigation';

export function MyBooksScreen({ navigation }: RootStackScreenProps<'MyBooks'>) {
  const colors = useThemeColors();
  const data = useCenterStore((s) => s.data);
  const refresh = useCenterStore((s) => s.refresh);
  const pickBook = useCenterStore((s) => s.pickBook);
  const entries = myBookEntries(data);
  const center = entries[0]?.center ?? data?.organizations[0] ?? null;
  const locked = !!center && !isCenterOpen(center);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onBook = async (e: MyBookEntry) => {
    if (locked) return;
    if (e.mine.isActive) {
      navigation.navigate('CenterUnitPick', { bookId: e.book.id, mode: 'unit' });
      return;
    }
    if (!(await pickBook(e.book.id, { active: true })))
      toast.error('Не удалось переключить книгу. Проверь интернет');
  };

  const header = <ScreenHeader title="Мои книги" onBack={() => navigation.goBack()} bordered />;

  if (!center) {
    return (
      <Screen header={header}>
        <EmptyState
          icon={BookOpen}
          title="Книг учебного центра пока нет"
          description="Введи код центра в «Ввести код» на главной."
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      footer={
        <View style={styles.footer}>
          <Button
            title="Сменить книгу"
            variant="secondary"
            disabled={locked}
            onPress={() =>
              navigation.navigate('CenterBookPick', { orgId: center.id, mode: 'change' })
            }
            fullWidth
          />
          <Button
            title="Добавить книгу на другом языке"
            variant="quiet"
            disabled={locked}
            onPress={() => navigation.navigate('CenterBookPick', { orgId: center.id, mode: 'add' })}
            fullWidth
          />
        </View>
      }
    >
      <View style={styles.org}>
        <CenterLogo org={center} size={36} />
        <View style={styles.flex}>
          <Text variant="body" style={[styles.bold, { color: colors.textPrimary }]}>
            {center.name}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            {locked ? 'Доступ закончился' : `Доступ до ${formatAccessDate(center.accessUntil)}`}
          </Text>
        </View>
      </View>

      {locked ? (
        <Text variant="bodySmall" style={[styles.note, { color: colors.textSecondary }]}>
          Книги закрыты, прогресс сохранён. Возьми актуальный код у менеджера курса.
        </Text>
      ) : null}

      <View style={styles.list}>
        {entries.map((e) => {
          const unit = e.mine.currentUnit;
          const next = unit?.isLast ? nextLevelBook(e.center, e.book) : null;
          return (
            <View key={e.book.id} style={styles.item}>
              <Card
                tone={e.mine.isActive ? 'selected' : 'default'}
                onPress={() => onBook(e)}
                disabled={locked}
                accessibilityLabel={`${e.book.title}${e.mine.isActive ? ', текущая' : ''}`}
              >
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text variant="bodyLarge" style={[styles.bold, { color: colors.textPrimary }]}>
                      {e.book.title}
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                      {getLanguageLabel(e.book.languageFrom)}
                      {unit ? ` · Unit ${unit.number} · ${unit.title}` : ''}
                    </Text>
                  </View>
                  {e.mine.isActive ? <Badge label="Сейчас" tone="primary" /> : null}
                </View>
              </Card>
              {next && !locked ? (
                <View
                  style={[styles.next, { backgroundColor: alpha(colors.success, 10) }]}
                  accessibilityRole="summary"
                >
                  <CheckCircle2 size={iconSize.s} color={colors.successText} />
                  <Text variant="bodySmall" style={[styles.flex, { color: colors.successText }]}>
                    Все юниты пройдены
                  </Text>
                  <Button
                    title={`Перейти на ${next.title}`}
                    size="s"
                    variant="quiet"
                    onPress={() =>
                      navigation.navigate('CenterUnitPick', {
                        bookId: next.id,
                        mode: 'change',
                        replaceBookId: e.book.id,
                      })
                    }
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
        У каждой книги свой юнит и прогресс. При смене ничего не теряется.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  org: { flexDirection: 'row', gap: spacing.s, alignItems: 'center', marginBottom: spacing.m },
  note: { marginBottom: spacing.m },
  list: { gap: spacing.s, marginBottom: spacing.m },
  item: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.s, alignItems: 'center' },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.m,
    paddingLeft: spacing.s,
  },
  footer: { gap: spacing.xs },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: '700' },
});
