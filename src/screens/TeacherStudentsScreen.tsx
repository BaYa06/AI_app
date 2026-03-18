/**
 * Teacher Students Screen
 * @description Список учеников курса для учителя
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherStudents'>;

// ==================== TYPES ====================

type StudentStatus = 'online' | 'away' | 'offline' | 'inactive';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  initials: string;
  status: StudentStatus;
  streak: number;
  lastActivity: string;
  avatarVariant: 'solid' | 'light' | 'gray';
}

type FilterKey = 'all' | 'active' | 'away3d' | 'away7d';

// ==================== MOCK DATA ====================

const MOCK_STUDENTS: Student[] = [
  { id: '1',  firstName: 'Александр', lastName: 'Иванов',   initials: 'АИ', status: 'online',   streak: 7,  lastActivity: 'Вчера, 19:42',   avatarVariant: 'solid' },
  { id: '2',  firstName: 'Екатерина', lastName: 'Петрова',  initials: 'ЕП', status: 'away',     streak: 12, lastActivity: 'Сегодня, 10:15',  avatarVariant: 'light' },
  { id: '3',  firstName: 'Михаил',    lastName: 'Сидоров',  initials: 'МС', status: 'offline',  streak: 0,  lastActivity: '3 дня назад',     avatarVariant: 'solid' },
  { id: '4',  firstName: 'Дмитрий',   lastName: 'Новиков',  initials: 'ДН', status: 'inactive', streak: 0,  lastActivity: '8 дней назад',    avatarVariant: 'gray' },
  { id: '5',  firstName: 'Анна',       lastName: 'Смирнова', initials: 'АС', status: 'online',   streak: 5,  lastActivity: 'Сегодня, 08:30',  avatarVariant: 'light' },
  { id: '6',  firstName: 'Павел',      lastName: 'Козлов',   initials: 'ПК', status: 'online',   streak: 3,  lastActivity: 'Сегодня, 09:55',  avatarVariant: 'solid' },
  { id: '7',  firstName: 'Ольга',      lastName: 'Волкова',  initials: 'ОВ', status: 'away',     streak: 21, lastActivity: 'Вчера, 22:10',    avatarVariant: 'light' },
  { id: '8',  firstName: 'Сергей',     lastName: 'Морозов',  initials: 'СМ', status: 'offline',  streak: 0,  lastActivity: '4 дня назад',     avatarVariant: 'solid' },
  { id: '9',  firstName: 'Наталья',    lastName: 'Лебедева', initials: 'НЛ', status: 'inactive', streak: 0,  lastActivity: '10 дней назад',   avatarVariant: 'gray' },
  { id: '10', firstName: 'Иван',       lastName: 'Попов',    initials: 'ИП', status: 'online',   streak: 9,  lastActivity: 'Сегодня, 11:00',  avatarVariant: 'solid' },
  { id: '11', firstName: 'Мария',      lastName: 'Федорова', initials: 'МФ', status: 'away',     streak: 2,  lastActivity: 'Вчера, 17:30',    avatarVariant: 'light' },
  { id: '12', firstName: 'Андрей',     lastName: 'Соколов',  initials: 'АС', status: 'offline',  streak: 0,  lastActivity: '2 дня назад',     avatarVariant: 'solid' },
  { id: '13', firstName: 'Татьяна',    lastName: 'Михайлова',initials: 'ТМ', status: 'online',   streak: 14, lastActivity: 'Сегодня, 07:45',  avatarVariant: 'light' },
  { id: '14', firstName: 'Николай',    lastName: 'Захаров',  initials: 'НЗ', status: 'inactive', streak: 0,  lastActivity: '12 дней назад',   avatarVariant: 'gray' },
  { id: '15', firstName: 'Юлия',       lastName: 'Соловьёва',initials: 'ЮС', status: 'away',     streak: 6,  lastActivity: 'Вчера, 20:05',    avatarVariant: 'light' },
  { id: '16', firstName: 'Виктор',     lastName: 'Васильев', initials: 'ВВ', status: 'offline',  streak: 0,  lastActivity: '5 дней назад',    avatarVariant: 'solid' },
  { id: '17', firstName: 'Елена',      lastName: 'Кузнецова',initials: 'ЕК', status: 'online',   streak: 30, lastActivity: 'Сегодня, 12:20',  avatarVariant: 'solid' },
  { id: '18', firstName: 'Алексей',    lastName: 'Орлов',    initials: 'АО', status: 'inactive', streak: 0,  lastActivity: '9 дней назад',    avatarVariant: 'gray' },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',    label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'away3d', label: 'Не заходили 3д' },
  { key: 'away7d', label: 'Не заходили 7д+' },
];

// ==================== STATUS DOT COLOR ====================

const STATUS_COLORS: Record<StudentStatus, string> = {
  online:   '#10B981',
  away:     '#F59E0B',
  offline:  '#EF4444',
  inactive: '#D1D5DB',
};

// ==================== STUDENT ROW ====================

function StudentRow({ student, colors, isDark, onPress }: {
  student: Student;
  colors: any;
  isDark: boolean;
  onPress: () => void;
}) {
  const isInactive = student.status === 'inactive';
  const dotColor = STATUS_COLORS[student.status];

  const avatarBg =
    student.avatarVariant === 'solid'   ? colors.primary :
    student.avatarVariant === 'light'   ? colors.primary + '33' :
                                          isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB';

  const avatarTextColor =
    student.avatarVariant === 'solid'   ? '#FFFFFF' :
    student.avatarVariant === 'light'   ? colors.primary :
                                          isDark ? '#9CA3AF' : '#6B7280';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6',
          opacity: isInactive ? 0.7 : 1,
          backgroundColor: pressed ? (isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB') : 'transparent',
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
            {student.firstName} {student.lastName}
          </Text>
          {student.streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {student.streak}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>
          {student.lastActivity}
        </Text>
      </View>

      {/* Chevron */}
      <ChevronRight size={18} color={isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'} />
    </Pressable>
  );
}

// ==================== SCREEN ====================

export function TeacherStudentsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    let list = MOCK_STUDENTS;

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
      list = list.filter(
        (s) =>
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q),
      );
    }

    return list;
  }, [query, activeFilter]);

  const inputBg = isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6';
  const pillActiveBg = colors.primary;
  const pillInactiveBg = isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.92)',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            ...Platform.select({ web: { backdropFilter: 'blur(12px)' } }) as any,
          },
        ]}
      >
        {/* Left: back + title */}
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
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
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <StudentRow
            student={item}
            colors={colors}
            isDark={isDark}
            onPress={() => {}}
          />
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Ученики не найдены
            </Text>
          </View>
        }
      />
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
  rowMeta: {
    fontSize: 12,
    fontWeight: '400',
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
