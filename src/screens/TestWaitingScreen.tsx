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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Play,
} from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TestWaiting'>;

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';
const AVATAR_COLORS = ['#6366F1', '#F59E0B', '#EC4899', '#10B981', '#F97316'];
const MAX_VISIBLE_AVATARS = 4;

type Participant = { id: string; initials: string };

const MODE_LABELS: Record<string, string> = {
  multiple: 'Multiple Choice',
  writing: 'Writing',
  mixed: 'Mixed',
};

export function TestWaitingScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const { sessionId, participantId, setTitle, testMode, questionCount, timePerQuestion } = route.params;

  const [participants, setParticipants] = useState<Participant[]>([]);

  // Загрузить начальный список участников
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/test?action=monitor&sessionId=${sessionId}`);
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

  // Realtime: ждём старта теста
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
    ? `${questionCount} questions • ${Math.round((timePerQuestion * questionCount) / 60)} min`
    : `${questionCount} questions • No time limit`;

  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Test Lobby
        </Text>
        <View style={{ width: 48 }} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Pulsing Circle */}
        <View style={styles.pulseWrap}>
          <Animated.View
            style={[
              styles.pulseRing2,
              {
                backgroundColor: colors.primary + '18',
                transform: [{ scale: pulseAnim }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing1,
              {
                backgroundColor: colors.primary + '30',
                transform: [{ scale: pulseAnim }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View
            style={[
              styles.pulseCenter,
              {
                backgroundColor: colors.primary,
                ...Platform.select({
                  ios: {
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.3,
                    shadowRadius: 16,
                  },
                  android: { elevation: 12 },
                }),
              },
            ]}
          >
            <Play size={36} color="#FFF" fill="#FFF" />
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Get Ready!
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          The test will begin shortly
        </Text>

        {/* Set Info Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: cardBorder,
            },
          ]}
        >
          {/* Card Image Placeholder */}
          <View
            style={[
              styles.cardImage,
              { backgroundColor: colors.primary + '12' },
            ]}
          >
            <Text style={styles.cardImageEmoji}>📚</Text>
          </View>

          <View style={styles.cardBody}>
            <View
              style={[
                styles.modeBadge,
                { backgroundColor: colors.primary + '15' },
              ]}
            >
              <Text style={[styles.modeBadgeText, { color: colors.primary }]}>
                {MODE_LABELS[testMode] || testMode}
              </Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              {setTitle}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              {timeText}
            </Text>
          </View>
        </View>

        {/* Student Avatars */}
        <View style={styles.avatarsSection}>
          <View style={styles.avatarsRow}>
            {participants.slice(0, MAX_VISIBLE_AVATARS).map((s, idx) => (
              <View
                key={s.id}
                style={[
                  styles.avatar,
                  {
                    backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] + '25',
                    borderColor: isDark ? colors.background : '#FFFFFF',
                    marginLeft: idx > 0 ? -12 : 0,
                    zIndex: participants.length - idx,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    { color: AVATAR_COLORS[idx % AVATAR_COLORS.length] },
                  ]}
                >
                  {s.initials[0]}
                </Text>
              </View>
            ))}
            {participants.length > MAX_VISIBLE_AVATARS && (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                    borderColor: isDark ? colors.background : '#FFFFFF',
                    marginLeft: -12,
                    zIndex: 0,
                  },
                ]}
              >
                <Text style={[styles.avatarOverflow, { color: colors.textSecondary }]}>
                  +{participants.length - MAX_VISIBLE_AVATARS}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.avatarsLabel, { color: colors.textPrimary }]}>
            {participants.length <= 1
              ? 'Just you joined'
              : `You + ${participants.length - 1} others joined`}
          </Text>
        </View>
      </View>

      {/* Bottom Waiting State */}
      <View
        style={[
          styles.bottomSection,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.waitingRow}>
          <Text style={[styles.waitingText, { color: colors.primary }]}>
            Waiting for teacher to start
          </Text>
          <View style={styles.dotsRow}>
            <Animated.View
              style={[
                styles.dot,
                { backgroundColor: colors.primary, transform: [{ translateY: dot1 }] },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                { backgroundColor: colors.primary, transform: [{ translateY: dot2 }] },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                { backgroundColor: colors.primary, transform: [{ translateY: dot3 }] },
              ]}
            />
          </View>
        </View>

        {/* Progress bar */}
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0' },
          ]}
        >
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
  },
  backBtn: {
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
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
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
    borderRadius: 80,
  },
  pulseRing1: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  pulseCenter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Title
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  // Card
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageEmoji: {
    fontSize: 48,
  },
  cardBody: {
    padding: spacing.m + 4,
    gap: 8,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  modeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardMeta: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Avatars
  avatarsSection: {
    alignItems: 'center',
    gap: 12,
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
    borderRadius: 24,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  avatarOverflow: {
    fontSize: 12,
    fontWeight: '700',
  },
  avatarsLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Bottom
  bottomSection: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    alignItems: 'center',
    gap: 16,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waitingText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    width: 100,
    height: '100%',
    borderRadius: 2,
  },
});
