/**
 * «Ты знаешь 47 слов» на главной (plan/new/new_user_activation.md, Start 5.3). На 7-й и 30-й
 * день учёбы — сравнение с учебником: прогресс в понятных словах, а не в уроках.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BookOpenCheck } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { useThemeColors } from '@/store';
import { iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';

export const KnownWordsRow = memo(function KnownWordsRow({
  words,
  comparison,
}: {
  words: number;
  comparison: string | null;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row} accessible>
      <BookOpenCheck size={iconSize.s} color={colors.successText} />
      <Text variant="bodySmall" style={[styles.text, { color: colors.textSecondary }]}>
        Ты знаешь{' '}
        <Text variant="bodySmall" style={[styles.bold, { color: colors.textPrimary }]}>
          {words} {pluralize(words, 'слово', 'слова', 'слов')}
        </Text>
        {comparison ? ` · ${comparison}` : ''}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  text: {
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
});
