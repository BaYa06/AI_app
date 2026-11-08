/**
 * Шапка главной: меню курсов, серия, алмазы, рейтинг курса
 * (Clean 8 — вынесено из HomeScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import ReanimatedAnimated, { useAnimatedStyle } from 'react-native-reanimated';
import { iconSize } from '@/constants';
import { Button } from '@/components/ui';
import { Menu, Flame, Gem, Trophy } from 'lucide-react-native';
import { styles } from '../styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setStreakModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  todayGoalReached: boolean;
  formatDays: (value: number) => string;
  streakValue: number;
  diamondIconRef: React.RefObject<View>;
  setDiamondTargetPos: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  diamonds: number;
  diamondCountAnimStyle: ReturnType<typeof useAnimatedStyle>;
  ratingTeaser: {
    badge: string;
    title: string;
    hint: string;
    dot: boolean;
    week: 'current' | 'previous';
  } | null;
  openLeaderboard: (week: 'current' | 'previous') => void;
};

export function HomeHeader({
  colors,
  setDrawerOpen,
  setStreakModalVisible,
  todayGoalReached,
  formatDays,
  streakValue,
  diamondIconRef,
  setDiamondTargetPos,
  diamonds,
  diamondCountAnimStyle,
  ratingTeaser,
  openLeaderboard,
}: Props) {
  return (
    <View
      style={[
        styles.header,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}
    >
      <Button
        variant="icon"
        icon={Menu}
        background="none"
        accessibilityLabel="Курсы"
        onPress={() => setDrawerOpen(true)}
      />

      <View style={styles.headerCenter}>
        <Pressable
          style={styles.headerStat}
          onPress={() => setStreakModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={`Серия: ${formatDays(streakValue)}`}
        >
          <Flame size={iconSize.m} color={todayGoalReached ? colors.streak : colors.textTertiary} />
          <Text
            style={[
              styles.headerStatText,
              { color: todayGoalReached ? colors.textPrimary : colors.textSecondary },
            ]}
          >
            {formatDays(streakValue)}
          </Text>
        </Pressable>

        <View
          ref={diamondIconRef}
          style={styles.headerStat}
          accessible
          accessibilityLabel={`Алмазы: ${diamonds}`}
          onLayout={() => {
            diamondIconRef.current?.measureInWindow((x, y, w, h) => {
              setDiamondTargetPos({ x: x + w / 2, y: y + h / 2 });
            });
          }}
        >
          <Gem size={iconSize.m} color={colors.diamond} />
          <ReanimatedAnimated.View style={diamondCountAnimStyle}>
            <Text style={[styles.headerStatText, { color: colors.textPrimary }]}>{diamonds}</Text>
          </ReanimatedAnimated.View>
        </View>
      </View>

      <View style={styles.headerRight}>
        {/* Рейтинг курса (plan/done/home_redesign.md, 3.2): значок в шапке, точка — есть новости */}
        {ratingTeaser && (
          <View>
            <Button
              variant="icon"
              icon={Trophy}
              background="none"
              iconSize={iconSize.s}
              iconColor={colors.warningText}
              accessibilityLabel={`${ratingTeaser.title}. ${ratingTeaser.hint}`}
              onPress={() => openLeaderboard(ratingTeaser.week)}
            />
            {ratingTeaser.dot && (
              <View
                pointerEvents="none"
                style={[
                  styles.ratingDot,
                  { backgroundColor: colors.error, borderColor: colors.background },
                ]}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
}
