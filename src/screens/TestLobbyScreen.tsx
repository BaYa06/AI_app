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
import {
  GraduationCap,
  Copy,
  UserPlus,
  CheckCircle2,
  ArrowRight,
  QrCode,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';

type Props = NativeStackScreenProps<RootStackParamList, 'TestLobby'>;

type Student = {
  id: string;
  name: string;
  initials: string;
};

const AVATAR_COLORS = ['#6366F1', '#F59E0B', '#EC4899', '#10B981', '#F97316'];

export function TestLobbyScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const { sessionId, code: gameCode } = route.params;
  const [students, setStudents] = useState<Student[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Подписка на Supabase Realtime — student_joined
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
            name: payload.displayName || 'Student',
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
      const teacherId = data.session?.user?.id;
      if (!teacherId) throw new Error('Not authenticated');

      const resp = await fetch(`${API_BASE}/test?action=start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teacherId }),
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
      alert(e.message || 'Ошибка запуска теста');
      setStarting(false);
    }
  }, [starting, students.length, sessionId, route.params]);

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <GraduationCap size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Test Lobby
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.endBtn,
            {
              backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
              borderColor: isDark ? 'rgba(239,68,68,0.2)' : '#FECACA',
            },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.endBtnText}>End</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Game Code Card */}
        <View style={styles.codeCard}>
          <View style={styles.codeCardTop}>
            <View style={styles.codeCardLeft}>
              <Text style={styles.codeLabel}>GAME CODE</Text>
              <Text style={styles.codeValue}>{gameCode}</Text>
            </View>
            <View style={styles.qrWrap}>
              <QrCode size={52} color="#6366F1" />
            </View>
          </View>
          <View style={styles.codeCardShare}>
            <Text style={styles.shareText}>Отправьте код ученикам</Text>
            <Pressable
              style={({ pressed }) => [
                styles.copyBtn,
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleCopy}
            >
              {copied ? (
                <CheckCircle2 size={14} color="#22C55E" />
              ) : (
                <Copy size={14} color="#6366F1" />
              )}
              <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Waiting header */}
        <View style={styles.waitingRow}>
          <View style={styles.waitingLeft}>
            <View style={styles.pingWrap}>
              <View style={styles.pingOuter} />
              <View style={styles.pingDot} />
            </View>
            <Text style={[styles.waitingTitle, { color: colors.textPrimary }]}>
              Ожидание учеников...
            </Text>
          </View>
          <View style={[styles.joinedBadge, { backgroundColor: colors.primary + '15' }]}>
            <Text style={[styles.joinedText, { color: colors.primary }]}>
              {students.length} joined
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
                      backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] + '20',
                      borderColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] + '40',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.studentAvatarText,
                      { color: AVATAR_COLORS[idx % AVATAR_COLORS.length] },
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
                    Ready to play
                  </Text>
                </View>
              </View>
              <CheckCircle2 size={22} color="#22C55E" />
            </View>
          ))}

          {/* Empty placeholder */}
          <View
            style={[
              styles.emptySlot,
              { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' },
            ]}
          >
            <View
              style={[
                styles.emptyAvatar,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' },
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
                      backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] + '30',
                      borderColor: colors.background,
                      marginLeft: idx > 0 ? -10 : 0,
                      zIndex: students.length - idx,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.crewAvatarText,
                      { color: AVATAR_COLORS[idx % AVATAR_COLORS.length] },
                    ]}
                  >
                    {s.initials[0]}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[styles.crewLabel, { color: colors.textSecondary }]}>
              JOINED CREW
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
                background: isDark
                  ? 'linear-gradient(to top, #101122 60%, transparent)'
                  : 'linear-gradient(to top, #f6f6f8 60%, transparent)',
              },
            }) as any,
            backgroundColor: Platform.OS !== 'web' ? colors.background : undefined,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: students.length === 0 || starting ? colors.textSecondary : colors.primary },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          disabled={students.length === 0 || starting}
          onPress={handleStart}
        >
          {starting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.ctaText}>Start Test</Text>
              <ArrowRight size={20} color="#FFFFFF" />
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
    fontSize: 19,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
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
    backgroundColor: '#6366F1',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(135deg, #6467f2, #4c4d9a)',
        boxShadow: '0 8px 24px rgba(100,103,242,0.25)',
      },
    }) as any,
    shadowColor: '#6366F1',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 6,
  },
  qrWrap: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: borderRadius.m,
  },
  codeCardShare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: spacing.s,
    borderRadius: borderRadius.m,
    marginTop: spacing.l,
  },
  shareText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.s,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
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
    borderRadius: 6,
    backgroundColor: '#22C55E',
    opacity: 0.3,
  },
  pingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
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
    fontSize: 13,
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
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
    }) as any,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  studentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 11,
    fontWeight: '500',
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
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
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
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crewAvatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  crewLabel: {
    fontSize: 10,
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
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(100,103,242,0.3)' },
    }) as any,
    shadowColor: '#6467F2',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
