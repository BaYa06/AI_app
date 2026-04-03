/**
 * Test History Screen
 * @description Список завершённых экзаменных тестов курса
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Trophy,
  Clock,
  Users,
  ChevronRight,
  FileText,
  AlertTriangle,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';

type Props = NativeStackScreenProps<RootStackParamList, 'TestHistory'>;

type HistoryItem = {
  sessionId: string;
  setTitle: string;
  finishedAt: string;
  participantCount: number;
  avgScore: number;
  questionCount: number;
  testMode: string;
};

function scoreColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function TestHistoryScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const { courseId, courseTitle } = route.params;

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const teacherId = data.session?.user?.id;
      if (!teacherId) {
        setError('Не авторизован');
        return;
      }
      const res = await fetch(
        `${API_BASE}/test?action=history&courseId=${courseId}&teacherId=${teacherId}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Ошибка ${res.status}`);
        return;
      }
      const json = await res.json();
      setItems(json);
    } catch (e: any) {
      setError(e.message || 'Не удалось загрузить историю');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.m }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            История тестов
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {courseTitle}
          </Text>
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.centerState}>
          <AlertTriangle size={40} color="#EF4444" />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary, marginTop: 12 }]}>
            {error}
          </Text>
          <Pressable
            onPress={load}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <View style={styles.centerState}>
          <FileText size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Тестов пока нет
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Проведите первый тест, и он{'\n'}появится здесь
          </Text>
        </View>
      )}

      {/* List */}
      {!loading && !error && items.length > 0 && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item) => (
            <Pressable
              key={item.sessionId}
              onPress={() =>
                navigation.navigate('TestResultsTeacher', {
                  courseId,
                  courseTitle,
                  sessionId: item.sessionId,
                })
              }
              style={({ pressed }) => [
                styles.historyCard,
                { backgroundColor: cardBg, borderColor: cardBorder },
                pressed && { opacity: 0.7 },
              ]}
            >
              {/* Icon */}
              <View style={[styles.historyIcon, { backgroundColor: '#6366F1' + '18' }]}>
                <Trophy size={20} color="#6366F1" />
              </View>

              {/* Content */}
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.historyCardRow}>
                  <Text
                    style={[styles.cardTitle, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.setTitle}
                  </Text>
                  <Text style={[styles.cardScore, { color: scoreColor(item.avgScore) }]}>
                    {item.avgScore}%
                  </Text>
                  <ChevronRight size={16} color={colors.textSecondary} />
                </View>
                <View style={styles.historyCardBottom}>
                  <Clock size={12} color={colors.textSecondary} />
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {formatDate(item.finishedAt)}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>·</Text>
                  <Users size={12} color={colors.textSecondary} />
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {item.participantCount} уч.
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>·</Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {item.questionCount} вопр.
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
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
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: spacing.l,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
    marginTop: 4,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    padding: spacing.m,
    gap: spacing.s,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.m,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cardScore: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 13,
  },
});
