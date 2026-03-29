/**
 * Test Done Screen
 * @description Экран результатов ученика после завершения теста
 */
import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import {
  X,
  CheckCircle2,
  XCircle,
  Award,
  Home,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TestDone'>;


export function TestDoneScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const { correct, total, answers = [] } = route.params;
  const wrong = total - correct;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Circular progress
  const RADIUS = 70;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * (1 - percent / 100);

  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  const getGreeting = () => {
    if (percent >= 90) return 'Excellent work!';
    if (percent >= 70) return 'Great job!';
    if (percent >= 50) return 'Good effort!';
    return 'Keep practicing!';
  };

  const getRankText = () => {
    if (percent >= 90) return '1st place';
    if (percent >= 75) return '2nd place';
    if (percent >= 60) return '3rd place';
    return 'Keep going!';
  };

  const getRankEmoji = () => {
    if (percent >= 90) return '\u{1F947}';
    if (percent >= 75) return '\u{1F948}';
    if (percent >= 60) return '\u{1F949}';
    return '\u{1F4AA}';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 4,
            backgroundColor: isDark
              ? colors.background + 'CC'
              : 'rgba(246,246,248,0.8)',
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigation.navigate('Main' as any)}
        >
          <X size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Test Complete! {'\u{1F389}'}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Score Circle */}
        <View style={styles.scoreSection}>
          <View style={styles.circleWrap}>
            <Svg width={160} height={160} style={StyleSheet.absoluteFill}>
              <Circle
                cx={80}
                cy={80}
                r={RADIUS}
                stroke={colors.primary + '18'}
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
              <Text style={[styles.scorePercent, { color: colors.textPrimary }]}>
                {percent}%
              </Text>
              <Text style={[styles.scoreDetail, { color: colors.textSecondary }]}>
                {correct} / {total} correct
              </Text>
            </View>
          </View>
          <Text style={[styles.greeting, { color: colors.primary }]}>
            {getGreeting()}
          </Text>
        </View>

        {/* Rank Card */}
        <View style={styles.cardPadding}>
          <View
            style={[
              styles.rankCard,
              {
                backgroundColor: cardBg,
                borderColor: colors.primary + '18',
              },
            ]}
          >
            <View style={styles.rankLeft}>
              <Text style={[styles.rankTitle, { color: colors.textPrimary }]}>
                Your rank: {getRankEmoji()} {getRankText()}
              </Text>
              <Text style={[styles.rankSub, { color: colors.textSecondary }]}>
                You outperformed {percent}% of the class
              </Text>
            </View>
            <View
              style={[
                styles.rankIcon,
                { backgroundColor: colors.primary + '20' },
              ]}
            >
              <Award size={32} color={colors.primary} />
            </View>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: cardBg,
                borderColor: colors.primary + '18',
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Correct
            </Text>
            <Text style={[styles.statValue, { color: '#22C55E' }]}>
              {correct}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: cardBg,
                borderColor: colors.primary + '18',
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Wrong
            </Text>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>
              {wrong}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: cardBg,
                borderColor: colors.primary + '18',
              },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Score
            </Text>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {percent}%
            </Text>
          </View>
        </View>

        {/* Answers Review */}
        {answers.length > 0 && (
          <View style={styles.reviewSection}>
            <Text style={[styles.reviewTitle, { color: colors.textPrimary }]}>
              Answers Review
            </Text>

            {answers.map((item, idx) => (
              <View
                key={idx}
                style={[
                  styles.reviewCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: item.isCorrect ? cardBorder : 'transparent',
                    borderLeftColor: item.isCorrect ? cardBorder : '#EF4444',
                    borderLeftWidth: item.isCorrect ? 1 : 4,
                  },
                ]}
              >
                <View style={styles.reviewHeader}>
                  <Text style={[styles.reviewWord, { color: colors.primary }]}>
                    {item.word}
                  </Text>
                  {item.isCorrect ? (
                    <CheckCircle2 size={20} color="#22C55E" />
                  ) : (
                    <XCircle size={20} color="#EF4444" />
                  )}
                </View>

                <Text style={[styles.reviewAnswer, { color: colors.textSecondary }]}>
                  Your answer:{' '}
                  <Text
                    style={{
                      color: item.isCorrect ? colors.textPrimary : '#EF4444',
                      fontWeight: '500',
                    }}
                  >
                    {item.yourAnswer || '—'}
                  </Text>
                </Text>

                {!item.isCorrect && item.correctAnswer && (
                  <Text style={[styles.reviewAnswer, { color: colors.textSecondary }]}>
                    Correct:{' '}
                    <Text style={{ color: '#22C55E', fontWeight: '500' }}>
                      {item.correctAnswer}
                    </Text>
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom Button */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + 16,
            backgroundColor: isDark
              ? colors.background + 'F2'
              : 'rgba(246,246,248,0.95)',
            borderTopColor: cardBorder,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.homeBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
          onPress={() => navigation.navigate('Main' as any)}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
          <Home size={18} color="#FFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingBottom: 8,
    zIndex: 10,
  },
  closeBtn: {
    width: 48,
    height: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    flex: 1,
  },
  scroll: {
    paddingTop: spacing.m,
  },
  // Score circle
  scoreSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.s,
    gap: 8,
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
  scorePercent: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  scoreDetail: {
    fontSize: 13,
    fontWeight: '500',
  },
  greeting: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  // Rank card
  cardPadding: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m + 4,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: spacing.m,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  rankLeft: {
    flex: 1,
    gap: 4,
  },
  rankTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rankSub: {
    fontSize: 12,
    fontWeight: '400',
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
    gap: 10,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
  },
  statCard: {
    flex: 1,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: 4,
    minWidth: 90,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  // Review
  reviewSection: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: spacing.m,
  },
  reviewCard: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    marginBottom: 10,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  reviewWord: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewAnswer: {
    fontSize: 13,
    lineHeight: 18,
  },
  // Bottom
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: 1,
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: borderRadius.l,
    ...Platform.select({
      ios: {
        shadowColor: '#6467f2',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  homeBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
