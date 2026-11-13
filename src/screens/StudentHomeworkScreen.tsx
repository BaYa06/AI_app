/**
 * Экран задания ученика (plan/new/teacher_cabinet.md, Teacher 27; макет У3).
 * Срок, «Чтобы сдать» (все слова + порог), полоска «засчитано / осталось», «Путаешь»,
 * «Дальше новые», «В группе уже сдали N из M». Кнопки запускают сессию только на словах задания.
 * Подписи — studentHomework/homeworkScreenText.ts.
 */
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Clock, Users } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCardsStore, useThemeColors } from '@/store';
import { useHomeworkStore } from '@/store/homeworkStore';
import { Text } from '@/components/common';
import { Button, ScreenHeader, SegmentedProgressBar, toast } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import { homeworkLeft } from '@/services/homework';
import { startHomeworkSession } from '@/components/study/homeworkSession';
import type { RootStackParamList } from '@/types/navigation';
import { homeworkScreenTexts } from './studentHomework/homeworkScreenText';

type Props = NativeStackScreenProps<RootStackParamList, 'StudentHomework'>;

/** Сколько «дальше новых» показать чипами; остальное — «+N» */
const NEXT_SHOWN = 6;

export function StudentHomeworkScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const hw = useHomeworkStore((s) => s.items.find((h) => h.id === route.params.homeworkId));
  const cards = useCardsStore((s) => s.cards);

  useFocusEffect(
    useCallback(() => {
      useHomeworkStore
        .getState()
        .load()
        .catch(() => {});
    }, [])
  );

  const lists = useMemo(() => {
    if (!hw) return null;
    const credited = new Set(hw.creditedCardIds);
    const word = (id: string) => cards[id];
    const hard = hw.wrongCardIds.map(word).filter(Boolean);
    const next = hw.cardIds
      .filter((id) => !credited.has(id))
      .map(word)
      .filter(Boolean);
    return { hard, next };
  }, [hw, cards]);

  if (!hw || !lists) {
    return (
      <View style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ScreenHeader title="Задание" onBack={() => navigation.goBack()} />
        <View style={st.center}>
          <Text color="secondary">Задание не найдено — возможно, учитель его отменил</Text>
        </View>
      </View>
    );
  }

  const t = homeworkScreenTexts(hw);
  const left = homeworkLeft(hw);
  const right = hw.creditedCardIds.length - hw.wrongCardIds.length;

  const start = (prefer: 'learn' | 'review') => {
    if (!startHomeworkSession(navigation, hw, prefer)) {
      toast.info('Слова задания ещё загружаются — открой курс и попробуй снова');
    }
  };

  const ruleRow = (label: string, value: string, done: boolean) => (
    <View style={st.ruleRow}>
      <View
        style={[
          st.ruleDot,
          done
            ? { backgroundColor: colors.success, borderColor: colors.success }
            : { borderColor: colors.border },
        ]}
      >
        {done && <Check size={14} color={colors.onPrimary} strokeWidth={3} />}
      </View>
      <Text style={st.flex}>{label}</Text>
      <Text variant="label" style={{ color: done ? colors.successText : colors.textPrimary }}>
        {value}
      </Text>
    </View>
  );

  return (
    <View style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        center={
          <View>
            <Text variant="h3" numberOfLines={1}>
              {t.title}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {t.subtitle}
            </Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={st.content}>
        <View style={[st.due, { backgroundColor: alpha(colors.homework, 10) }]}>
          <Clock size={22} color={colors.homeworkText} />
          <View style={st.flex}>
            <Text variant="bodyLarge" style={[st.bold, { color: colors.homeworkText }]}>
              {t.due}
            </Text>
            <Text
              variant="caption"
              style={{ color: t.overdue ? colors.errorText : colors.textSecondary }}
            >
              {t.dueHint}
            </Text>
          </View>
        </View>

        <View style={[st.box, { borderColor: colors.border }]}>
          <Text variant="overline" color="secondary">
            Чтобы сдать
          </Text>
          {ruleRow(t.allWords.label, t.allWords.value, t.allWords.done)}
          {t.score && ruleRow(t.score.label, t.score.value, t.score.done)}
          <Text variant="caption" color="secondary">
            {t.rule}
          </Text>
        </View>

        <View style={st.section}>
          <SegmentedProgressBar
            total={hw.words}
            segments={[
              { value: right, color: colors.success },
              { value: hw.wrongCardIds.length, color: colors.homework },
            ]}
          />
          <View style={st.legend}>
            {[
              { c: colors.success, l: `Засчитано ${right}` },
              { c: colors.homework, l: `Путаешь ${hw.wrongCardIds.length}` },
              { c: colors.surfaceMuted, l: `Осталось ${left}` },
            ].map((x) => (
              <View key={x.l} style={st.legendItem}>
                <View style={[st.dot, { backgroundColor: x.c, borderColor: colors.border }]} />
                <Text variant="caption">{x.l}</Text>
              </View>
            ))}
          </View>
        </View>

        {lists.hard.length > 0 && (
          <View style={st.section}>
            <Text variant="overline" style={{ color: colors.homeworkText }}>
              Путаешь
            </Text>
            <View style={st.chips}>
              {lists.hard.map((c) => (
                <View key={c.id} style={[st.chip, { backgroundColor: alpha(colors.homework, 10) }]}>
                  <Text variant="bodySmall">
                    <Text variant="bodySmall" style={st.bold}>
                      {c.frontText}
                    </Text>
                    {` — ${c.backText}`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {lists.next.length > 0 && (
          <View style={st.section}>
            <Text variant="overline" color="secondary">
              Дальше новые
            </Text>
            <View style={st.chips}>
              {lists.next.slice(0, NEXT_SHOWN).map((c) => (
                <View key={c.id} style={[st.chip, { backgroundColor: colors.surfaceMuted }]}>
                  <Text variant="bodySmall">{c.frontText}</Text>
                </View>
              ))}
              {lists.next.length > NEXT_SHOWN && (
                <Text variant="bodySmall" color="secondary" style={st.more}>
                  {`+${lists.next.length - NEXT_SHOWN}`}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={[st.box, st.groupRow, { borderColor: colors.border }]}>
          <Users size={22} color={colors.primary} />
          <Text variant="bodySmall" style={st.flex}>
            {t.group}
          </Text>
        </View>
      </ScrollView>

      {(t.primary || t.secondary) && (
        <View
          style={[
            st.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, spacing.m),
            },
          ]}
        >
          {t.primary && (
            <Button title={t.primary.title} onPress={() => start(t.primary!.prefer)} fullWidth />
          )}
          {t.secondary && (
            <Button
              title={t.secondary.title}
              variant="secondary"
              onPress={() => start(t.secondary!.prefer)}
              fullWidth
            />
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.l },
  content: { padding: spacing.m, gap: spacing.l, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
    borderRadius: borderRadius.l,
  },
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.s,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  ruleDot: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: spacing.xs },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.s, paddingVertical: spacing.xs, borderRadius: borderRadius.m },
  more: { alignSelf: 'center' },
  groupRow: { flexDirection: 'row', alignItems: 'center' },
  footer: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
});
