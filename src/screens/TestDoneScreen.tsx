/**
 * Test Done Screen
 * @description Экран результатов ученика после завершения теста
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  X,
  CheckCircle2,
  XCircle,
  Award,
  Home,
  PartyPopper,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Card, CelebrationIcon, Screen, ScreenHeader, type CelebrationKind } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize, typography } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TestDone'>;


export function TestDoneScreen({ navigation, route }: Props) {
  const colors = useThemeColors();

  const { correct, total, answers = [] } = route.params;
  const wrong = total - correct;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Circular progress
  const RADIUS = 70;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * (1 - percent / 100);

  const getGreeting = () => {
    if (percent >= 90) return 'Отличная работа!';
    if (percent >= 70) return 'Хороший результат!';
    if (percent >= 50) return 'Неплохо!';
    return 'Продолжай тренироваться!';
  };

  // Медаль за процент правильных ответов — это не место в классе (раньше писали «1st place»)
  const getRankText = () => {
    if (percent >= 90) return 'Золото';
    if (percent >= 75) return 'Серебро';
    if (percent >= 60) return 'Бронза';
    return 'Ещё немного!';
  };

  const getRankIcon = (): CelebrationKind => {
    if (percent >= 90) return 'gold';
    if (percent >= 75) return 'silver';
    if (percent >= 60) return 'bronze';
    return 'strength';
  };

  const goHome = () => navigation.navigate('Main' as any);

  return (
    <Screen
      enableSwipeBack={false}
      header={
        <ScreenHeader
          onBack={goHome}
          backIcon={X}
          backLabel="Закрыть"
          center={
            <View style={styles.headerCenter}>
              <Text variant="button" accessibilityRole="header" style={[styles.headerTitle, { color: colors.textPrimary }]}>
                Тест завершён
              </Text>
              <PartyPopper size={iconSize.s} color={colors.primary} />
            </View>
          }
        />
      }
      footer={<Button title="На главную" iconRight={Home} fullWidth onPress={goHome} />}
      contentStyle={styles.scroll}
    >
      {/* Score Circle */}
      <View style={styles.scoreSection}>
        <View
          style={styles.circleWrap}
          accessible
          accessibilityLabel={`Результат ${percent}%, ${correct} из ${total} верно`}
        >
          <Svg width={160} height={160} style={StyleSheet.absoluteFill}>
            <Circle
              cx={80}
              cy={80}
              r={RADIUS}
              stroke={alpha(colors.primary, 10)}
              strokeWidth={8}
              fill="none"
            />
            <Circle
              cx={80}
              cy={80}
              r={RADIUS}
              stroke={colors.primary}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE}`}
              strokeDashoffset={`${strokeDashoffset}`}
              transform="rotate(-90 80 80)"
            />
          </Svg>
          <View style={styles.circleInner}>
            <Text variant="display" style={{ color: colors.textPrimary }}>
              {percent}%
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {correct} из {total} верно
            </Text>
          </View>
        </View>
        <Text variant="button" style={[styles.greeting, { color: colors.primary }]}>
          {getGreeting()}
        </Text>
      </View>

      {/* Rank Card */}
      <Card style={styles.rankCard}>
        <View style={styles.rankLeft}>
          <View style={styles.rankTitleRow}>
            <CelebrationIcon kind={getRankIcon()} size="s" plain />
            <Text variant="label" style={[styles.rankTitle, { color: colors.textPrimary }]}>
              Твой результат: {getRankText()}
            </Text>
          </View>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Ты опередил {percent}% курса
          </Text>
        </View>
        <View style={[styles.rankIcon, { backgroundColor: alpha(colors.primary, 20) }]}>
          <Award size={iconSize.l} color={colors.primary} />
        </View>
      </Card>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Верно
          </Text>
          <Text variant="h2" style={{ color: colors.successText }}>
            {correct}
          </Text>
        </Card>
        <Card style={styles.statCard}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Ошибки
          </Text>
          <Text variant="h2" style={{ color: colors.errorText }}>
            {wrong}
          </Text>
        </Card>
        <Card style={styles.statCard}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            Результат
          </Text>
          <Text variant="h2" style={{ color: colors.textPrimary }}>
            {percent}%
          </Text>
        </Card>
      </View>

      {/* Answers Review */}
      {answers.length > 0 && (
        <View style={styles.reviewSection}>
          <Text variant="h3" accessibilityRole="header" style={[styles.reviewTitle, { color: colors.textPrimary }]}>
            Разбор ответов
          </Text>

          {answers.map((item, idx) => (
            <Card
              key={idx}
              style={[
                styles.reviewCard,
                !item.isCorrect && { borderColor: alpha(colors.error, 40) },
              ]}
            >
              <View style={styles.reviewHeader}>
                <Text variant="label" style={[styles.reviewWord, { color: colors.primary }]}>
                  {item.word}
                </Text>
                {item.isCorrect ? (
                  <CheckCircle2 size={iconSize.s} color={colors.success} accessibilityLabel="Верно" />
                ) : (
                  <XCircle size={iconSize.s} color={colors.error} accessibilityLabel="Неверно" />
                )}
              </View>

              <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                Твой ответ:{' '}
                <Text
                  variant="bodySmall"
                  style={[styles.semibold, { color: item.isCorrect ? colors.textPrimary : colors.errorText }]}
                >
                  {item.yourAnswer || '—'}
                </Text>
              </Text>

              {!item.isCorrect && item.correctAnswer && (
                <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                  Верный ответ:{' '}
                  <Text variant="bodySmall" style={[styles.semibold, { color: colors.successText }]}>
                    {item.correctAnswer}
                  </Text>
                </Text>
              )}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    letterSpacing: 0,
  },
  scroll: {
    paddingTop: spacing.m,
  },
  // Score circle
  scoreSection: {
    alignItems: 'center',
    paddingBottom: spacing.s,
    gap: spacing.xs,
  },
  circleWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
  // Rank card
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.m,
    marginTop: spacing.xs,
  },
  rankLeft: {
    flex: 1,
    gap: spacing.xxs,
  },
  rankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rankTitle: {
    flexShrink: 1,
  },
  rankIcon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.s,
    paddingVertical: spacing.m,
  },
  statCard: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 90,
  },
  // Review
  reviewSection: {
    paddingTop: spacing.m,
    gap: spacing.s,
  },
  reviewTitle: {
    marginBottom: spacing.xxs,
  },
  reviewCard: {
    gap: spacing.xs,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  reviewWord: {
    flex: 1,
  },
  semibold: {
    fontWeight: typography.label.fontWeight,
  },
});
