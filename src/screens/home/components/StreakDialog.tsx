/**
 * Окно «Ударный режим» на главной: серия, неделя, дневная цель, заморозка
 * (Clean 8a — вынесено из HomeScreen без изменений разметки.)
 */
import React from 'react';
import { View } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha } from '@/constants';
import { Button, Dialog, ProgressBar } from '@/components/ui';
import { Check, Flame, Gem } from 'lucide-react-native';
import { getLocalDateKey } from '@/services/StreakService';
import type { DailyActivity } from '@/services/StreakService';
import { styles } from '../styles';

type Props = {
  streakModalVisible: boolean;
  closeStreakModal: () => void;
  colors: ReturnType<typeof useThemeColors>;
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

      {/* Week grid */}
      <View style={styles.weekGrid}>
        {(() => {
          const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
          const today = new Date();
          const todayKey = getLocalDateKey();

          // Форматтер для получения YYYY-MM-DD в правильном timezone
          const dateFmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
          // Определяем день недели из todayKey (надёжнее чем getDay())
          const todayParsed = new Date(todayKey + 'T12:00:00');
          const todayIndex = (todayParsed.getDay() + 6) % 7; // Пн = 0

          // Создаём Set дат, когда была активность (из реальных данных БД)
          const activeDates = new Set(
            weekActivity.filter((a) => a.cards_studied >= 10).map((a) => a.local_date)
          );

          return weekDays.map((day, idx) => {
            const isToday = idx === todayIndex;
            // Вычисляем дату для каждой ячейки
            const dateForCell = new Date(today);
            const diff = idx - todayIndex;
            dateForCell.setDate(today.getDate() + diff);
            const dayNumber = parseInt(dateFmt.format(dateForCell).split('-')[2], 10);
            const dateKey = dateFmt.format(dateForCell); // YYYY-MM-DD в local tz
            const isFuture = dateKey > todayKey;
            const done = !isFuture && activeDates.has(dateKey);
            return (
              <View key={day} style={styles.weekItem}>
                <Text
                  variant="overline"
                  style={{ color: isToday ? colors.primary : colors.textSecondary }}
                >
                  {day}
                </Text>
                <View
                  accessible
                  accessibilityLabel={`${day}, ${dayNumber}: ${done ? 'цель выполнена' : isToday ? 'сегодня' : 'нет занятий'}`}
                  style={[
                    styles.weekCircle,
                    done
                      ? { backgroundColor: colors.success, borderColor: colors.success }
                      : { borderColor: isToday ? colors.primary : colors.border },
                  ]}
                >
                  {done ? (
                    <Check size={iconSize.xs} color={colors.onPrimary} strokeWidth={3} />
                  ) : (
                    <Text
                      variant="caption"
                      style={[
                        styles.bold,
                        { color: isToday ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {dayNumber}
                    </Text>
                  )}
                </View>
              </View>
            );
          });
        })()}
      </View>

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
