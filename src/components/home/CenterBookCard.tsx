/**
 * Карточка книги учебного центра на главной (plan/new/center_books.md, Center 6): логотип центра,
 * книга, текущий юнит, сколько слов юнита начато, «Учить / Продолжить Unit N», «Мои книги».
 * Показывается, только пока доступ к центру идёт; конец доступа и плашка за 7 дней — Center 7.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Library } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button, Card, ProgressBar } from '@/components/ui';
import { useCardsStore, useThemeColors } from '@/store';
import { useCenterStore } from '@/store/centerStore';
import { iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { activeBookEntry, myBookEntries } from '@/services/centerBooks';
import { CenterLogo } from '@/screens/courseJoin/CenterFoundScreen';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = {
  onStudy: (setId: string) => void;
  onMyBooks: () => void;
  style?: StyleProp<ViewStyle>;
};

export function CenterBookCard({ onStudy, onMyBooks, style }: Props) {
  const colors = useThemeColors();
  const data = useCenterStore((s) => s.data);
  const entry = activeBookEntry(data);
  const unit = entry?.mine.currentUnit ?? null;
  const setId = unit?.setId ?? null;
  // Начатые слова юнита — по картам в сторе (официальный набор приходит с личным прогрессом)
  const started = useCardsStore((s) => {
    if (!setId) return 0;
    return (s.cardsBySet[setId] || []).filter((id) => (s.cards[id]?.learningStep || 0) >= 1).length;
  });

  if (!entry || !entry.center.active || !unit || !setId) return null;
  const total = unit.totalCards;
  const done = Math.min(started, total);
  const booksCount = myBookEntries(data).length;

  return (
    <Card style={style}>
      <View style={styles.head}>
        <CenterLogo org={entry.center} size={24} />
        <Text
          variant="overline"
          numberOfLines={1}
          style={[styles.flex, { color: colors.textSecondary }]}
        >
          {entry.book.title}
        </Text>
      </View>
      <Text variant="h3" style={{ color: colors.textPrimary }}>
        Unit {unit.number} · {unit.title}
      </Text>
      <ProgressBar
        progress={total > 0 ? (done / total) * 100 : 0}
        accessibilityLabel={`${done} из ${total} слов юнита`}
        style={styles.bar}
      />
      <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
        {done} из {total} {pluralize(total, 'слова', 'слов', 'слов')} юнита
      </Text>
      <Button
        title={`${done > 0 ? 'Продолжить' : 'Учить'} Unit ${unit.number}`}
        onPress={() => onStudy(setId)}
        fullWidth
        style={styles.button}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onMyBooks}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Library size={iconSize.s} color={colors.primary} />
        <Text variant="body" style={[styles.flex, { color: colors.primary }]}>
          Мои книги · {booksCount} {pluralize(booksCount, 'книга', 'книги', 'книг')}
        </Text>
        <ChevronRight size={iconSize.s} color={colors.textTertiary} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  bar: { marginTop: spacing.s, marginBottom: spacing.xxs },
  button: { marginTop: spacing.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.xs,
  },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
});
