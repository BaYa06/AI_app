/**
 * Окно «Ударный режим» на главной: серия, неделя, дневная цель, заморозка
 * Неделя — как считает сервер: засчитан / заморозка / занимался, но не засчитан (Freeze 3).
 */
import React from 'react';
import { View } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha } from '@/constants';
import { Button, Dialog, ProgressBar } from '@/components/ui';
import { AlertCircle, Check, Flame, Gem, Snowflake } from 'lucide-react-native';
import { buildWeekStatus, getLocalDateKey, weekNotes } from '@/services/StreakService';
import type { DailyActivity, WeekDayState } from '@/services/StreakService';
import { styles } from '../styles';

type Colors = ReturnType<typeof useThemeColors>;

/** Для экранного диктора — по таблице плана. */
const DAY_A11Y: Record<WeekDayState, string> = {
  counted: 'засчитан',
  frozen: 'спасён заморозкой',
  studied: 'занимался, но день не засчитан',
  missed: 'пропущен',
  today: 'сегодня, ещё не засчитан',
  future: 'впереди',
};

function dayLook(status: WeekDayState, colors: Colors) {
  switch (status) {
    case 'counted':
      return {
        circle: { backgroundColor: colors.streak, borderColor: colors.streak },
        number: colors.onPrimary,
      };
    case 'frozen':
      return {
        circle: { backgroundColor: alpha(colors.info, 10), borderColor: alpha(colors.info, 40) },
        number: colors.info,
      };
    case 'studied':
      return { circle: { borderColor: alpha(colors.warning, 40) }, number: colors.textSecondary };
    case 'missed':
      return { circle: { borderColor: colors.border }, number: colors.textTertiary };
    case 'today':
      return { circle: { borderColor: colors.primary }, number: colors.primary };
    default:
      return { circle: { borderColor: colors.border }, number: colors.textSecondary };
  }
}

type Props = {
  streakModalVisible: boolean;
  closeStreakModal: () => void;
  colors: Colors;
  todayGoalReached: boolean;
  formatDays: (value: number) => string;
  streakValue: number;
  weekActivity: DailyActivity[];
  cardsLearned: number;
  dailyGoal: number;
  goalProgress: number;
  streakSupportText: string;
  streakFreezes: number | null;
  MAX_STREAK_FREEZES: number;
  STREAK_FREEZE_PRICE: number;
  handleBuyStreakFreeze: () => void;
  buyingFreeze: boolean;
};

export function StreakDialog({
  streakModalVisible,
  closeStreakModal,
  colors,
  todayGoalReached,
  formatDays,
  streakValue,
  weekActivity,
  cardsLearned,
  dailyGoal,
  goalProgress,
  streakSupportText,
  streakFreezes,
  MAX_STREAK_FREEZES,
  STREAK_FREEZE_PRICE,
  handleBuyStreakFreeze,
  buyingFreeze,
}: Props) {
  const week = buildWeekStatus(weekActivity, getLocalDateKey());
  const notes = weekNotes(week);
  return (
    <Dialog
      visible={streakModalVisible}
      onClose={closeStreakModal}
      placement="top"
      style={styles.streakCard}
    >
      {/* Section 1: Header */}
      <View style={styles.streakTop}>
        <View
          style={[
            styles.streakTopIcon,
            todayGoalReached
              ? {
                  backgroundColor: alpha(colors.streak, 10),
                  borderColor: alpha(colors.streak, 40),
                }
              : { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        >
          <Flame size={iconSize.l} color={todayGoalReached ? colors.streak : colors.textTertiary} />
        </View>
        <View style={styles.streakTopText}>
          <Text variant="overline" style={{ color: colors.textSecondary }}>
            Ударный режим
          </Text>
          <Text variant="h2" style={{ color: colors.textPrimary }}>
            {formatDays(streakValue)}
          </Text>
        </View>
      </View>

      {/* Week grid — то, что считает сервер (plan/new/streak_freeze_display.md, Freeze 3) */}
      <View style={styles.weekGrid}>
        {week.map((d) => {
          const look = dayLook(d.status, colors);
          return (
            <View key={d.date} style={styles.weekItem}>
              <Text
                variant="overline"
                style={{ color: d.isToday ? colors.primary : colors.textSecondary }}
              >
                {d.dayLabel}
              </Text>
              <View
                accessible
                accessibilityLabel={`${d.dayLabel}, ${d.dayNumber}: ${DAY_A11Y[d.status]}`}
                style={[styles.weekCircle, look.circle]}
              >
                {d.status === 'counted' ? (
                  <Check size={iconSize.xs} color={colors.onPrimary} strokeWidth={3} />
                ) : d.status === 'frozen' ? (
                  <Snowflake size={iconSize.xs} color={colors.info} strokeWidth={2.5} />
                ) : (
                  <Text variant="caption" style={[styles.bold, { color: look.number }]}>
                    {d.dayNumber}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
      {notes.length > 0 && (
        <View style={styles.weekNotes}>
          {notes.map((n) => (
            <View key={n.kind} style={styles.weekNote}>
              {n.kind === 'frozen' ? (
                <Snowflake size={14} color={colors.info} />
              ) : (
                <AlertCircle size={14} color={colors.warning} />
              )}
              <Text variant="bodySmall" style={[styles.flex1, { color: colors.textSecondary }]}>
                {n.text}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Section 3: Progress / goal */}
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View>
            <Text variant="overline" style={{ color: colors.textSecondary }}>
              Карточки
            </Text>
            <Text variant="h3" style={[styles.bold, { color: colors.textPrimary }]}>
              {cardsLearned}
              <Text variant="h3" style={{ color: colors.textSecondary }}>
                /{dailyGoal}
              </Text>
            </Text>
          </View>
          <Text variant="overline" style={{ color: colors.primary }}>
            Дневная цель
          </Text>
        </View>
        <ProgressBar progress={goalProgress} accessibilityLabel="Дневная цель" />
      </View>

      <Text variant="bodySmall" align="center" style={{ color: colors.textSecondary }}>
        {streakSupportText}
      </Text>

      {streakFreezes !== null && (
        <View style={[styles.freezeRow, { borderColor: colors.border }]}>
          <View style={styles.flex1}>
            <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>
              Заморозка серии: {streakFreezes} из {MAX_STREAK_FREEZES}
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Спасёт серию, если пропустишь один день
            </Text>
          </View>
          {streakFreezes < MAX_STREAK_FREEZES && (
            <Button
              size="s"
              icon={Gem}
              title={String(STREAK_FREEZE_PRICE)}
              accessibilityLabel={`Купить заморозку за ${STREAK_FREEZE_PRICE} алмазов`}
              onPress={handleBuyStreakFreeze}
              loading={buyingFreeze}
            />
          )}
        </View>
      )}
    </Dialog>
  );
}
