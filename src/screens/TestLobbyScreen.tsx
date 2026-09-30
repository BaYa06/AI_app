/**
 * Test Lobby Screen
 * @description Лобби теста — ожидание учеников по game-коду
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerHaptic } from '@/utils/haptic';
import {
  GraduationCap,
  Copy,
  UserPlus,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, type ColorToken } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { API_BASE } from '@/config/apiBase';
import { describeTestError } from '@/utils/testApiErrors';

type Props = NativeStackScreenProps<RootStackParamList, 'TestLobby'>;

type Student = {
  id: string;
  name: string;
  initials: string;
};

// Цвета аватаров участников — имена токенов, значения берутся из темы
const AVATAR_TOKENS: ColorToken[] = ['primaryFill', 'warning', 'like', 'success', 'streak'];

export function TestLobbyScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const { sessionId, code: gameCode } = route.params;
  const [students, setStudents] = useState<Student[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Polling — синхронизация списка студентов каждые 3 сек
  useEffect(() => {
    let cancelled = false;

    const fetchParticipants = async () => {
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
        setStudents(
          (data.participants || []).map((p: any) => ({
            id: p.userId,
            name: p.name || 'Ученик',
            initials: p.initials || (p.name?.[0] ?? 'S').toUpperCase(),
          }))
        );
      } catch {}
    };

    fetchParticipants();
    const interval = setInterval(fetchParticipants, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  // Realtime — мгновенное добавление студента (без ожидания следующего polling)
  useEffect(() => {
    const channel = supabase.channel(`test:${sessionId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'student_joined' }, ({ payload }) => {
        if (!payload) return;
        setStudents(prev => {
          if (prev.some(s => s.id === payload.userId)) return prev;
          return [...prev, {
            id: payload.userId,
            name: payload.displayName || 'Ученик',
            initials: payload.initials || '??',
          }];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const handleCopy = useCallback(() => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(gameCode);
      } else {
        Clipboard.setString(gameCode);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [gameCode]);

  const handleStart = useCallback(async () => {
    if (starting || students.length === 0) return;
    setStarting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${API_BASE}/test?action=start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to start test');

      navigation.replace('LiveTest', {
        courseId: route.params.courseId,
        courseTitle: route.params.courseTitle,
        sessionId,
      });
    } catch (e: any) {
      console.error('Start test error:', e);
      alert(describeTestError(e, 'Не удалось запустить тест. Попробуй ещё раз.'));
      setStarting(false);
    }
  }, [starting, students.length, sessionId, route.params]);

  const cardBg = colors.surface;
  const cardBorder = colors.border;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            paddingTop: 12,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <GraduationCap size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Лобби теста
          </Text>
        </View>
        <Pressable accessibilityRole="button"
          style={({ pressed }) => [
            styles.endBtn,
            {
              backgroundColor: alpha(colors.error, 10),
              borderColor: alpha(colors.error, 10),
            },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.endBtnText, { color: colors.errorText }]}>Завершить</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Game Code Card */}
        <View style={[styles.codeCard, { backgroundColor: colors.primaryFill }]}>
          <View style={styles.codeCardTop}>
            <View style={styles.codeCardLeft}>
              <Text style={[styles.codeLabel, { color: colors.onPrimary }]}>Код теста</Text>
              <Text style={[styles.codeValue, { color: colors.onPrimary }]}>{gameCode}</Text>
            </View>
          </View>
          <View style={[styles.codeCardShare, { backgroundColor: alpha(colors.onPrimary, 10) }]}>
            <Text style={[styles.shareText, { color: colors.onPrimary }]}>Отправь код ученикам</Text>
            <Pressable accessibilityRole="button"
              style={({ pressed }) => [
                [styles.copyBtn, { backgroundColor: colors.surface }],
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleCopy}
            >
              {copied ? (
                <CheckCircle2 size={14} color={colors.success} />
              ) : (
                <Copy size={14} color={colors.primaryFill} />
              )}
              <Text style={[styles.copyBtnText, { color: colors.primary }]}>{copied ? 'Скопировано' : 'Копировать'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Waiting header */}
        <View style={styles.waitingRow}>
          <View style={styles.waitingLeft}>
            <View style={styles.pingWrap}>
              <View style={[styles.pingOuter, { backgroundColor: colors.success }]} />
              <View style={[styles.pingDot, { backgroundColor: colors.success }]} />
            </View>
            <Text style={[styles.waitingTitle, { color: colors.textPrimary }]}>
              Ожидание учеников...
            </Text>
          </View>
          <View style={[styles.joinedBadge, { backgroundColor: alpha(colors.primary, 10) }]}>
            <Text style={[styles.joinedText, { color: colors.primary }]}>
              Подключились: {students.length}
            </Text>
          </View>
        </View>

        {/* Student list */}
        <View style={styles.studentsList}>
          {students.map((s, idx) => (
            <View
              key={s.id}
              style={[
                styles.studentRow,
                { backgroundColor: cardBg, borderColor: cardBorder },
              ]}
            >
              <View style={styles.studentLeft}>
                <View
                  style={[
                    styles.studentAvatar,
                    {
                      backgroundColor: alpha(colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]], 20),
                      borderColor: alpha(colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]], 40),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.studentAvatarText,
                      { color: colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]] },
                    ]}
                  >
                    {s.initials}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.studentName, { color: colors.textPrimary }]}>
                    {s.name}
                  </Text>
                  <Text style={[styles.studentStatus, { color: colors.textSecondary }]}>
                    Готов к тесту
                  </Text>
                </View>
              </View>
              <CheckCircle2 size={22} color={colors.success} />
            </View>
          ))}

          {/* Empty placeholder */}
          <View
            style={[
              styles.emptySlot,
              { borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.emptyAvatar,
                { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <UserPlus size={18} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Ожидание учеников...
            </Text>
          </View>
        </View>

        {/* Joined crew avatars */}
        {students.length > 0 && (
          <View style={styles.crewRow}>
            <View style={styles.crewAvatars}>
              {students.map((s, idx) => (
                <View
                  key={s.id}
                  style={[
                    styles.crewAvatar,
                    {
                      backgroundColor: alpha(colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]], 20),
                      borderColor: colors.background,
                      marginLeft: idx > 0 ? -10 : 0,
                      zIndex: students.length - idx,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.crewAvatarText,
                      { color: colors[AVATAR_TOKENS[idx % AVATAR_TOKENS.length]] },
                    ]}
                  >
                    {s.initials[0]}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[styles.crewLabel, { color: colors.textSecondary }]}>
              Подключились
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 16,
            ...Platform.select({
              web: {
                background: `linear-gradient(to top, ${colors.background} 60%, transparent)`,
              },
            }) as any,
            backgroundColor: Platform.OS !== 'web' ? colors.background : undefined,
          },
        ]}
      >
        <Pressable accessibilityRole="button"
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: students.length === 0 || starting ? colors.textSecondary : colors.primary },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          disabled={students.length === 0 || starting}
          onPress={() => { triggerHaptic('selection'); handleStart(); }}
        >
          {starting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Начать тест</Text>
              <ArrowRight size={20} color={colors.onPrimary} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.m,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  endBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  endBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  scroll: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    gap: spacing.l,
  },

  // Game Code Card
  codeCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    overflow: 'hidden',
  },
  codeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  codeCardLeft: {
    gap: 4,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 6,
  },
  codeCardShare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.s,
    borderRadius: borderRadius.m,
    marginTop: spacing.l,
  },
  shareText: {
    fontSize: 14,
    fontWeight: '600',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.s,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Waiting
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waitingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pingWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pingOuter: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: borderRadius.s,
    opacity: 0.3,
  },
  pingDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.s,
  },
  waitingTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  joinedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  joinedText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Students
  studentsList: {
    gap: spacing.s,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    
  },
  studentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700',
  },
  studentStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },

  // Empty slot
  emptySlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  emptyAvatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Crew avatars
  crewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  crewAvatars: {
    flexDirection: 'row',
  },
  crewAvatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  crewLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: spacing.m,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: borderRadius.l,
    gap: 8,
    
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
