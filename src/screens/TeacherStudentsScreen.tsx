/**
 * Teacher Students Screen
 * @description Список учеников курса для учителя
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  BackHandler,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services/supabaseClient';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherStudents'>;

// ==================== TYPES ====================

type StudentStatus = 'online' | 'away' | 'offline' | 'inactive';

interface Student {
  id: string;
  name: string;
  initials: string;
  status: StudentStatus;
  streak: number;
  lastActivity: string;
  lastActivityColor: string;
  todayCards: number;
}

type FilterKey = 'all' | 'active' | 'away3d' | 'away7d';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',    label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'away3d', label: 'Не заходили 3д' },
  { key: 'away7d', label: 'Не заходили 7д+' },
];

// ==================== HELPERS ====================

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getStudentStatus(lastActiveDate: string | null): StudentStatus {
  if (!lastActiveDate) return 'inactive';
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 'online';
  if (diffDays <= 2) return 'away';
  if (diffDays <= 6) return 'offline';
  return 'inactive';
}

function formatLastActivity(lastActiveDate: string | null): { text: string; color: string } {
  if (!lastActiveDate) return { text: 'Нет активности', color: '#9CA3AF' };
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { text: 'Сегодня', color: '#10B981' };
  if (diffDays === 1) return { text: 'Вчера', color: '#F59E0B' };
  if (diffDays <= 6) return { text: `${diffDays} дн. назад`, color: '#EF4444' };
  if (diffDays < 30) return { text: `${diffDays} дн. назад`, color: '#9CA3AF' };
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5) return { text: `${weeks} нед. назад`, color: '#9CA3AF' };
  const months = Math.floor(diffDays / 30);
  return { text: `${months} мес. назад`, color: '#9CA3AF' };
}

function pluralCards(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'карточек';
  if (mod10 === 1) return 'карточка';
  if (mod10 >= 2 && mod10 <= 4) return 'карточки';
  return 'карточек';
}

// ==================== STUDENT ROW ====================

function StudentRow({ student, colors, isDark, onPress, onRemove }: {
  student: Student;
  colors: any;
  isDark: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const isInactive = student.status === 'inactive';
  const dotColor = student.lastActivityColor;

  const avatarBg = isInactive
    ? (isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB')
    : colors.primary + '33';
  const avatarTextColor = isInactive
    ? (isDark ? '#9CA3AF' : '#6B7280')
    : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6',
          opacity: pressed ? 0.7 : isInactive ? 0.7 : 1,
        },
      ]}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[styles.avatarText, { color: avatarTextColor }]}>
            {student.initials}
          </Text>
        </View>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: dotColor, borderColor: isDark ? colors.background : '#FFFFFF' },
          ]}
        />
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <View style={styles.rowNameRow}>
          <Text
            style={[
              styles.rowName,
              { color: isInactive ? colors.textSecondary : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {student.name}
          </Text>
          {student.streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {student.streak}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowMetaRow}>
          <Text style={[styles.rowMeta, { color: student.lastActivityColor }]}>
            {student.lastActivity}
          </Text>
          {student.todayCards > 0 && (
            <View style={[styles.cardsBadge, { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5' }]}>
              <Text style={styles.cardsBadgeText}>
                {student.todayCards} {pluralCards(student.todayCards)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Remove button */}
      <TouchableOpacity
        onPress={onRemove}
        activeOpacity={0.6}
        hitSlop={8}
        style={[
          styles.removeBtn,
          { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2' },
        ]}
      >
        <Trash2 size={16} color="#EF4444" />
      </TouchableOpacity>
    </Pressable>
  );
}

// ==================== SCREEN ====================

export function TeacherStudentsScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Загрузка реальных участников
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    NeonService.loadCourseMembers(route.params.courseId)
      .then((members) => {
        if (!mounted) return;
        setStudents(
          members.map((m) => {
            const status = getStudentStatus(m.lastActiveDate);
            const activity = formatLastActivity(m.lastActiveDate);
            return {
              id: m.id,
              name: m.displayName,
              initials: getInitials(m.displayName),
              status,
              streak: m.streak,
              lastActivity: activity.text,
              lastActivityColor: activity.color,
              todayCards: m.todayCards,
            };
          }),
        );
      })
      .catch((e) => console.error('Failed to load members:', e))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [route.params.courseId]);

  useEffect(() => {
    let mounted = true;
    const checkOwnership = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId || !NeonService.isEnabled()) return;
        const isOwner = await NeonService.isCourseOwner(route.params.courseId, userId);
        if (mounted && !isOwner) navigation.goBack();
      } catch {
        if (mounted) navigation.goBack();
      }
    };
    checkOwnership();
    return () => { mounted = false; };
  }, [route.params.courseId]);

  const filtered = useMemo(() => {
    let list = students;

    // Filter by tab
    if (activeFilter === 'active') {
      list = list.filter((s) => s.status === 'online' || s.status === 'away');
    } else if (activeFilter === 'away3d') {
      list = list.filter((s) => s.status === 'offline');
    } else if (activeFilter === 'away7d') {
      list = list.filter((s) => s.status === 'inactive');
    }

    // Filter by search
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    return list;
  }, [query, activeFilter, students]);

  const handleRemoveStudent = useCallback(async (student: Student) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Удалить ученика?\n${student.name} больше не будет иметь доступ к курсу`)
      : await new Promise<boolean>((resolve) =>
          Alert.alert(
            'Удалить ученика?',
            `${student.name} больше не будет иметь доступ к курсу`,
            [
              { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Удалить', style: 'destructive', onPress: () => resolve(true) },
            ],
          ),
        );

    if (!confirmed) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const success = await NeonService.removeStudentFromCourse(
        route.params.courseId,
        student.id,
        session.user.id,
      );

      if (success) {
        setStudents(prev => prev.filter(s => s.id !== student.id));
      } else {
        if (Platform.OS === 'web') window.alert('Не удалось удалить ученика');
        else Alert.alert('Ошибка', 'Не удалось удалить ученика');
      }
    } catch {
      if (Platform.OS === 'web') window.alert('Не удалось удалить ученика');
      else Alert.alert('Ошибка', 'Не удалось удалить ученика');
    }
  }, [route.params.courseId]);

  const inputBg = isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6';
  const pillActiveBg = colors.primary;
  const pillInactiveBg = isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6';

  const navigateBackToTeacher = useCallback(() => {
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Main' },
        {
          name: 'TeacherCourseStats',
          params: {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          },
        },
      ],
    });
  }, [navigation, route.params.courseId, route.params.courseTitle]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'android') {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
          navigateBackToTeacher();
          return true;
        });
        return () => subscription.remove();
      }

      if (Platform.OS === 'web') {
        const handler = (e: PopStateEvent) => {
          e.stopImmediatePropagation();
          navigateBackToTeacher();
        };
        window.addEventListener('popstate', handler, true);
        return () => window.removeEventListener('popstate', handler, true);
      }

      return undefined;
    }, [navigateBackToTeacher]),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === 'web' ? 12 : insets.top + 8,
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.92)',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            ...Platform.select({ web: { backdropFilter: 'blur(12px)' } }) as any,
          },
        ]}
      >
        {/* Left: back + title */}
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => {
              const target = {
                name: 'TeacherCourseStats' as const,
                params: {
                  courseId: route.params.courseId,
                  courseTitle: route.params.courseTitle,
                },
              };

              if (Platform.OS === 'web') {
                navigation.reset({ index: 1, routes: [{ name: 'Main' }, target] });
                return;
              }

              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.reset({ index: 1, routes: [{ name: 'Main' }, target] });
              }
            }}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ученики</Text>
            <View style={[styles.countBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}>
              <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>
                {filtered.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Right: add button */}
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Plus size={20} color={colors.primary} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>Добавить</Text>
        </Pressable>
      </View>

      {/* ── Search + Filters ── */}
      <View style={styles.searchSection}>
        {/* Search input */}
        <View style={[styles.searchBar, { backgroundColor: inputBg }]}>
          <Text style={[styles.searchIcon, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск..."
            placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {FILTERS.map((f) => {
            const active = activeFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setActiveFilter(f.key)}
                style={[
                  styles.pill,
                  { backgroundColor: active ? pillActiveBg : pillInactiveBg },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Student List ── */}
      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <StudentRow
              student={item}
              colors={colors}
              isDark={isDark}
              onPress={() =>
                navigation.navigate('StudentDetail', {
                  courseId: route.params.courseId,
                  courseTitle: route.params.courseTitle,
                  studentId: item.id,
                  studentName: item.name,
                  studentInitials: item.initials,
                  streak: item.streak,
                  todayCards: item.todayCards,
                  lastActivity: item.lastActivity,
                })
              }
              onRemove={() => handleRemoveStudent(item)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {students.length === 0 ? 'Пока нет учеников' : 'Ученики не найдены'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flex: 1,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 99,
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Search + Filters
  searchSection: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
    gap: spacing.m,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    gap: spacing.s,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    padding: 0,
    margin: 0,
  },
  pillsRow: {
    gap: spacing.s,
    paddingBottom: 4,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 99,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // List row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.m,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  streakBadge: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  cardsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.s,
  },

  // Empty
  empty: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
