/**
 * Test Waiting Screen
 * @description Экран ожидания ученика — ждёт пока учитель запустит тест
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { BookOpen, Play } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Badge, Card, Screen, ScreenHeader } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize, type ColorToken } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { API_BASE } from '@/config/apiBase';
import { pluralize } from '@/utils';

type Props = NativeStackScreenProps<RootStackParamList, 'TestWaiting'>;

// Цвета аватаров участников — имена токенов, значения берутся из темы
const AVATAR_TOKENS: ColorToken[] = ['primaryFill', 'warning', 'like', 'success', 'streak'];
const MAX_VISIBLE_AVATARS = 4;

type Participant = { id: string; initials: string };

const MODE_LABELS: Record<string, string> = {
  multiple: 'Выбор ответа',
  writing: 'Письменный',
  mixed: 'Смешанный',
};

export function TestWaitingScreen({ navigation, route }: Props) {
  const colors = useThemeColors();

  const { sessionId, participantId, setTitle, testMode, questionCount, timePerQuestion } = route.params;

  const [participants, setParticipants] = useState<Participant[]>([]);

  // Загрузить начальный список участников
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        const token = authData.session?.access_token;
        if (!token) return;
        const resp = await fetch(`${API_BASE}/test?action=monitor&sessionId=${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        if (!mounted) return;
        const list: Participant[] = (data.participants || []).map((p: any, idx: number) => ({
          id: String(idx),
          initials: (p.name || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '??',
        }));
        setParticipants(list);
      } catch (e) {
        console.error('Failed to load participants:', e);
      }
    })();
    return () => { mounted = false; };
  }, [sessionId]);

  // Pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(-1)).current;

  // Bounce dots
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  // Polling: проверяем статус каждые 2 сек (надёжный fallback)
  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      if (cancelled) return;
      try {
        const { data: authData } = await supabase.auth.getSession();
        const token = authData.session?.access_token;
        if (!token) return;
        const resp = await fetch(`${API_BASE}/test?action=monitor&sessionId=${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (cancelled) return;
        if (data.status === 'active') {
          navigation.replace('TestExam', {
            sessionId,
            participantId,
            testMode,
            questionCount,
            timePerQuestion,
          });
        } else if (data.status === 'finished') {
          navigation.navigate('Main' as any);
        }
      } catch {}
    };

    const interval = setInterval(checkStatus, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, participantId, testMode, questionCount, timePerQuestion]);

  // Realtime: мгновенный старт (без ожидания следующего polling)
  useEffect(() => {
    const channel = supabase.channel(`test:${sessionId}`);

    channel
      .on('broadcast', { event: 'test_started' }, () => {
        navigation.replace('TestExam', {
          sessionId,
          participantId,
          testMode,
          questionCount,
          timePerQuestion,
        });
      })
      .on('broadcast', { event: 'test_finished' }, () => {
        navigation.navigate('Main' as any);
      })
      .on('broadcast', { event: 'student_joined' }, ({ payload }) => {
        if (!payload) return;
        setParticipants(prev => {
          if (prev.some(p => p.id === payload.userId)) return prev;
          return [...prev, { id: payload.userId, initials: payload.initials || '??' }];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, participantId, testMode, questionCount, timePerQuestion]);

  useEffect(() => {
    // Pulse
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.2,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    // Progress bar
    Animated.loop(
      Animated.timing(progressAnim, {
        toValue: 3,
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ).start();

    // Bouncing dots
    const bounceDot = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -6,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    bounceDot(dot1, 0).start();
    bounceDot(dot2, 150).start();
    bounceDot(dot3, 300).start();
  }, []);

  const timeText = timePerQuestion > 0
    ? `${questionCount} ${pluralize(questionCount, 'вопрос', 'вопроса', 'вопросов')} • ${Math.round((timePerQuestion * questionCount) / 60)} мин`
    : `${questionCount} ${pluralize(questionCount, 'вопрос', 'вопроса', 'вопросов')} • Без ограничения времени`;

  return (
    <Screen
      scroll={false}
      header={<ScreenHeader title="Ожидание теста" onBack={() => navigation.goBack()} />}
    >
      {/* Main Content */}
      <View style={styles.content}>
        {/* Pulsing Circle */}
        <View style={styles.pulseWrap}>
          <Animated.View
            style={[
              styles.pulseRing2,
              {
                backgroundColor: alpha(colors.primary, 10),
                transform: [{ scale: pulseAnim }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing1,
              {
                backgroundColor: alpha(colors.primary, 20),
                transform: [{ scale: pulseAnim }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View style={[styles.pulseCenter, { backgroundColor: colors.primaryFill }]}>
            <Play size={iconSize.l} color={colors.onPrimary} fill={colors.onPrimary} />
          </View>
        </View>

        {/* Title */}
        <Text variant="h2" style={[styles.title, { color: colors.textPrimary }]}>
          Приготовься!
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Тест скоро начнётся
        </Text>

        {/* Set Info Card */}
        <Card padding="none" style={styles.card}>
          {/* Card Image Placeholder */}
          <View style={[styles.cardImage, { backgroundColor: alpha(colors.primary, 10) }]}>
            <BookOpen size={iconSize.xl} color={colors.primary} />
          </View>

          <View style={styles.cardBody}>
            <Badge label={MODE_LABELS[testMode] || testMode} />
            <Text variant="h3" style={{ color: colors.textPrimary }}>
              {setTitle}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {timeText}
            </Text>
          </View>
        </Card>

        {/* Student Avatars */}
        <View style={styles.avatarsSection}>
          <View style={styles.avatarsRow}>
            {participants.slice(0, MAX_VISIBLE_AVATARS).map((s, idx) => {
              const tint = colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]];
              return (
                <View
                  key={s.id}
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: alpha(tint, 20),
                      borderColor: colors.background,
                      marginLeft: idx > 0 ? -spacing.s : 0,
                      zIndex: participants.length - idx,
                    },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: tint }]}>
                    {s.initials[0]}
                  </Text>
                </View>
              );
            })}
            {participants.length > MAX_VISIBLE_AVATARS && (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.background,
                    marginLeft: -spacing.s,
                    zIndex: 0,
                  },
                ]}
              >
                <Text variant="caption" style={[styles.avatarOverflow, { color: colors.textSecondary }]}>
                  +{participants.length - MAX_VISIBLE_AVATARS}
                </Text>
              </View>
            )}
          </View>
          <Text variant="label" style={{ color: colors.textPrimary }}>
            {participants.length <= 1
              ? 'Пока подключился только ты'
              : `Ты и ещё ${participants.length - 1} ${pluralize(participants.length - 1, 'ученик', 'ученика', 'учеников')}`}
          </Text>
        </View>
      </View>

      {/* Bottom Waiting State */}
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Ждём, когда учитель начнёт"
        style={styles.bottomSection}
      >
        <View style={styles.waitingRow}>
          <Text variant="label" style={{ color: colors.primary }}>
            Ждём, когда учитель начнёт
          </Text>
          <View style={styles.dotsRow}>
            {[dot1, dot2, dot3].map((dot, i) => (
              <Animated.View
                key={i}
                style={[styles.dot, { backgroundColor: colors.primary, transform: [{ translateY: dot }] }]}
              />
            ))}
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: colors.primary,
                transform: [
                  {
                    translateX: progressAnim.interpolate({
                      inputRange: [-1, 3],
                      outputRange: [-120, 360],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pulse
  pulseWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.l,
  },
  pulseRing2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: borderRadius.full,
  },
  pulseRing1: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: borderRadius.full,
  },
  pulseCenter: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Title
  title: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  // Card
  card: {
    width: '100%',
    maxWidth: 360,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: spacing.m,
    gap: spacing.xs,
  },
  // Avatars
  avatarsSection: {
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.l,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  avatarOverflow: {
    fontWeight: '700',
  },
  // Bottom
  bottomSection: {
    paddingTop: spacing.l,
    paddingBottom: spacing.l,
    alignItems: 'center',
    gap: spacing.m,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBar: {
    width: 100,
    height: '100%',
    borderRadius: borderRadius.full,
  },
});
