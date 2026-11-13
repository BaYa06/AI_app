/**
 * Блок «Слова» в мониторе живого теста по списку слов (plan/new/teacher_cabinet.md, Teacher 40):
 * доля верных по каждому слову по мере ответов и «Ещё не ответил». Данные — monitor.byCard.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { answeredText, sortCardStats, wordStatus, type CardStat } from './warmup';

export function WarmupWordsBlock({
  cards,
  students,
  waiting,
}: {
  cards: CardStat[];
  /** Сколько учеников подключилось */
  students: number;
  /** Имена тех, кто ещё не дал ни одного ответа */
  waiting: string[];
}) {
  const colors = useThemeColors();
  return (
    <View style={st.wrap}>
      <Text variant="h3">Слова</Text>
      <View style={[st.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {sortCardStats(cards).map((card, i) => {
          const status = wordStatus(card);
          const fg =
            status === 'learned'
              ? colors.successText
              : status === 'hard'
                ? colors.warningText
                : colors.textSecondary;
          const bar = status === 'learned' ? colors.success : colors.warning;
          return (
            <View
              key={card.cardId}
              style={[
                st.row,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={st.rowTop}>
                <Text variant="body" style={[st.flex, st.bold]} numberOfLines={1}>
                  {card.word}
                </Text>
                <Text variant="bodySmall" style={[st.bold, { color: fg }]}>
                  {card.correctRate === null ? '—' : `${card.correctRate}%`}
                </Text>
              </View>
              <View style={[st.track, { backgroundColor: colors.surfaceMuted }]}>
                <View
                  style={[st.fill, { width: `${card.correctRate ?? 0}%`, backgroundColor: bar }]}
                />
              </View>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {`${card.hint} · ${answeredText(card, students)}`}
              </Text>
            </View>
          );
        })}
      </View>
      {waiting.length > 0 && (
        <View style={st.waiting}>
          <Text variant="caption" color="secondary" style={st.overline}>
            ЕЩЁ НЕ ОТВЕТИЛ
          </Text>
          <View style={st.chips}>
            {waiting.map((name, i) => (
              <View
                key={`${name}-${i}`}
                style={[st.chip, { backgroundColor: alpha(colors.warning, 10) }]}
              >
                <Text variant="bodySmall">{name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: spacing.s, marginBottom: spacing.m },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  list: {
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.m,
  },
  row: { paddingVertical: spacing.s, gap: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  track: { height: 6, borderRadius: borderRadius.s, overflow: 'hidden' },
  fill: { height: 6, borderRadius: borderRadius.s },
  waiting: { gap: spacing.xs },
  overline: { fontWeight: '600', letterSpacing: 0.8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
});
