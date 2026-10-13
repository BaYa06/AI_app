/**
 * Test Done Screen
 * @description Экран результатов ученика после завершения теста
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  X,
  CheckCircle2,
  XCircle,
  Award,
  Home,
  PartyPopper,
  LogOut,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Card, CelebrationIcon, Screen, ScreenHeader, toast, type CelebrationKind } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize, typography } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { supabase } from '@/services/supabaseClient';
import { API_BASE } from '@/config/apiBase';

type Props = NativeStackScreenProps<RootStackParamList, 'TestDone'>;


export function TestDoneScreen({ navigation, route }: Props) {
  const colors = useThemeColors();

  const { correct, total, answers = [], leftReason, answered, resume } = route.params;

  // Учитель может разрешить продолжить (ложное срабатывание: звонок, блокировка телефона).
  // Realtime здесь не используем: канал `test:${sessionId}` общий с другими экранами теста, и
  // supabase-js отдаёт на одно имя один объект — чужая отписка сняла бы и нашу. Опрос monitor
  // раз в 3 с, пока тест идёт: своя строка снова не done → вернуться к вопросу answered.
  useEffect(() => {
    if (!leftReason || !resume) return;
    let cancelled = false;

    const check = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        const session = authData.session;
        if (!session || cancelled) return;
        const resp = await fetch(`${API_BASE}/test?action=monitor&sessionId=${resume.sessionId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (cancelled) return;
        if (data.status !== 'active') {
          cancelled = true;
          clearInterval(interval);
          return;
        }
        const me = (data.participants || []).find((p: any) => p.userId === session.user.id);
        if (me && !me.done) {
          cancelled = true;
          clearInterval(interval);
          toast.success('Учитель разрешил продолжить');
          navigation.replace('TestExam', { ...resume, initialQuestionIndex: me.answered });
        }
      } catch {}
    };

    const interval = setInterval(check, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [leftReason, resume, navigation]);
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

  // Попытка завершена досрочно (plan/exam_lockdown.md): без поздравлений, медали и разбора —
  // иначе итог превращается в шпаргалку для тех, кто ещё проходит тест.
  const leftTitle =
    leftReason === 'manual' ? 'Ты завершил тест досрочно'
    : leftReason === 'relaunch' ? 'Приложение закрывали во время теста'
    : 'Ты вышел из приложения во время теста';

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
              {!leftReason && <PartyPopper size={iconSize.s} color={colors.primary} />}
            </View>
          }
        />
      }
      footer={<Button title="На главную" iconRight={Home} fullWidth onPress={goHome} />}
      contentStyle={styles.scroll}
    >
      {leftReason && (
        <Card style={[styles.leftCard, { borderColor: alpha(colors.error, 40) }]}>
          <View style={styles.rankTitleRow}>
            <LogOut size={iconSize.s} color={colors.errorText} />
            <Text variant="label" accessibilityRole="header" style={[styles.rankTitle, { color: colors.textPrimary }]}>
              {leftTitle}
            </Text>
          </View>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            {leftReason === 'manual' ? 'Тест завершён' : 'Тест завершён автоматически'}, результат
            отправлен учителю. Отвечено {answered ?? correct} из {total}, неотвеченные вопросы
            засчитаны как неверные.
          </Text>
        </Card>
      )}

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
        {!leftReason && (
          <Text variant="button" style={[styles.greeting, { color: colors.primary }]}>
            {getGreeting()}
          </Text>
        )}
      </View>

      {/* Rank Card */}
      {!leftReason && (
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
      )}

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
      {!leftReason && answers.length > 0 && (
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
  leftCard: {
    gap: spacing.xs,
    marginBottom: spacing.m,
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
