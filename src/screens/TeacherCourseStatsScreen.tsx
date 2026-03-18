/**
 * Teacher Course Stats Screen
 * @description Статистика курса для учителя
 */
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>;

// ==================== MOCK DATA ====================

const MOCK_STUDENTS = [
  { id: '1', name: 'Алексей',  online: true,  avatar: null, activeToday: true,  inactive7d: false },
  { id: '2', name: 'Марина',   online: true,  avatar: null, activeToday: true,  inactive7d: false },
  { id: '3', name: 'Игорь',    online: false, avatar: null, activeToday: false, inactive7d: true },
  { id: '4', name: 'Светлана', online: true,  avatar: null, activeToday: true,  inactive7d: false },
  { id: '5', name: 'Дмитрий',  online: false, avatar: null, activeToday: false, inactive7d: true },
  { id: '6', name: 'Елена',    online: false, avatar: null, activeToday: true,  inactive7d: false },
  { id: '7', name: 'Кирилл',   online: false, avatar: null, activeToday: true,  inactive7d: false },
];

const MOCK_SETS = [
  {
    id: '1',
    title: 'Die Artikel (Der, Die, Das)',
    totalWords: 40,
    startedOf20: 15,
    progress: 0.75,
    accuracy: 72,
  },
  {
    id: '2',
    title: 'Verben im Präsens',
    totalWords: 25,
    startedOf20: 6,
    progress: 0.30,
    accuracy: 89,
  },
];

const CHART_DATA_7D = [
  { day: 'Пн', pct: 0.40 },
  { day: 'Вт', pct: 0.65 },
  { day: 'Ср', pct: 0.50 },
  { day: 'Чт', pct: 0.85 },
  { day: 'Пт', pct: 0.70 },
  { day: 'Сб', pct: 0.30 },
  { day: 'Вс', pct: 0.45 },
];

const CHART_DATA_30D = [
  { day: '1', pct: 0.20 }, { day: '5', pct: 0.45 }, { day: '10', pct: 0.60 },
  { day: '15', pct: 0.80 }, { day: '20', pct: 0.55 }, { day: '25', pct: 0.70 },
  { day: '30', pct: 0.90 },
];

// ==================== COMPONENTS ====================

function AvatarPlaceholder({ name, online, colors }: { name: string; online: boolean; colors: any }) {
  const initials = name.slice(0, 1).toUpperCase();
  return (
    <View style={styles.studentItem}>
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '33' }]}>
          <Text style={[styles.avatarInitials, { color: colors.primary }]}>{initials}</Text>
        </View>
        <View
          style={[
            styles.onlineDot,
            { backgroundColor: online ? '#22C55E' : colors.border, borderColor: colors.background },
          ]}
        />
      </View>
      <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

// ==================== SCREEN ====================

export function TeacherCourseStatsScreen({ navigation, route }: Props) {
  const { courseTitle } = route.params;
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const insets = useSafeAreaInsets();

  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d'>('7d');
  const [studentModal, setStudentModal] = useState<'active' | 'inactive' | null>(null);

  const activeStudents = MOCK_STUDENTS.filter((s) => s.activeToday);
  const inactiveStudents = MOCK_STUDENTS.filter((s) => s.inactive7d);
  const modalStudents = studentModal === 'active' ? activeStudents : inactiveStudents;
  const modalTitle = studentModal === 'active' ? 'Активны сегодня' : 'Не заходили 7д+';
  const chartData = chartPeriod === '7d' ? CHART_DATA_7D : CHART_DATA_30D;

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  const CHART_HEIGHT = 96;

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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {courseTitle || 'Статистика курса'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Metric tiles */}
        <View style={styles.metricsGrid}>
          {/* Active today */}
          <Pressable
            style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setStudentModal('active')}
          >
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>АКТИВНЫХ СЕГОДНЯ</Text>
            <Text style={[styles.metricValue, { color: colors.primary }]}>{activeStudents.length}</Text>
          </Pressable>

          {/* Inactive 7d+ */}
          <Pressable
            style={[styles.metricCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => setStudentModal('inactive')}
          >
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>НЕ ЗАХОДИЛИ 7Д+</Text>
            <Text style={[styles.metricValue, { color: colors.error }]}>{inactiveStudents.length}</Text>
          </Pressable>
        </View>

        {/* Activity Chart */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Активность группы</Text>
            <View style={[styles.togglePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
              <Pressable
                style={[
                  styles.toggleBtn,
                  chartPeriod === '7d' && { backgroundColor: colors.background,
                    ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.1)' } }) as any,
                    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
                ]}
                onPress={() => setChartPeriod('7d')}
              >
                <Text style={[styles.toggleText, { color: chartPeriod === '7d' ? colors.textPrimary : colors.textSecondary }]}>
                  7д
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.toggleBtn,
                  chartPeriod === '30d' && { backgroundColor: colors.background,
                    ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.1)' } }) as any,
                    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
                ]}
                onPress={() => setChartPeriod('30d')}
              >
                <Text style={[styles.toggleText, { color: chartPeriod === '30d' ? colors.textPrimary : colors.textSecondary }]}>
                  30д
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Bar chart */}
          <View style={[styles.chartWrap, { height: CHART_HEIGHT + 20 }]}>
            {chartData.map((item, idx) => (
              <View key={idx} style={styles.barCol}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: item.pct * CHART_HEIGHT,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{item.day}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Students carousel */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ученики</Text>
            <Pressable onPress={() => navigation.navigate('TeacherStudents', { courseId: route.params.courseId, courseTitle: route.params.courseTitle })}>
              <Text style={[styles.viewAll, { color: colors.primary }]}>Все →</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.studentsRow}
          >
            {MOCK_STUDENTS.map((s) => (
              <AvatarPlaceholder key={s.id} name={s.name} online={s.online} colors={colors} />
            ))}
          </ScrollView>
        </View>

        {/* Sets list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Наборы</Text>
          <View style={styles.setsList}>
            {MOCK_SETS.map((set) => (
              <View
                key={set.id}
                style={[styles.setCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
              >
                <View style={styles.setCardHeader}>
                  <Text style={[styles.setCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {set.title}
                  </Text>
                  <Text style={[styles.setCardWords, { color: colors.textSecondary }]}>
                    {set.totalWords} слов
                  </Text>
                </View>

                {/* Progress bar */}
                <View style={[styles.progressBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(set.progress * 100)}%` as any, backgroundColor: colors.primary },
                    ]}
                  />
                </View>

                <View style={styles.setCardMeta}>
                  <Text style={[styles.setCardMetaText, { color: colors.textSecondary }]}>
                    {set.startedOf20} из 20 начали
                  </Text>
                  <Text style={[styles.setCardAccuracy, { color: colors.primary }]}>
                    {set.accuracy}% точность
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Student List Modal */}
      <Modal
        visible={studentModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setStudentModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setStudentModal(null)}>
          <Pressable
            style={[styles.modalContent, { backgroundColor: isDark ? '#1E2030' : '#FFFFFF' }]}
            onPress={() => {}}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{modalTitle}</Text>
              <Pressable onPress={() => setStudentModal(null)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {modalStudents.map((s) => (
                <View key={s.id} style={[styles.modalStudentRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                  <View style={styles.modalAvatarWrap}>
                    <View style={[styles.avatar, { backgroundColor: colors.primary + '33' }]}>
                      <Text style={[styles.avatarInitials, { color: colors.primary }]}>
                        {s.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.onlineDot,
                        {
                          backgroundColor: s.online ? '#22C55E' : studentModal === 'inactive' ? colors.error : colors.border,
                          borderColor: isDark ? '#1E2030' : '#FFFFFF',
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.modalStudentName, { color: colors.textPrimary }]}>{s.name}</Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ==================== STYLES ====================

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
    marginLeft: spacing.m,
    flex: 1,
  },
  scroll: {
    padding: spacing.m,
    gap: spacing.xl,
  },

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    minHeight: 100,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },

  // Section
  section: {
    gap: spacing.m,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Toggle
  togglePill: {
    flexDirection: 'row',
    borderRadius: borderRadius.m,
    padding: 4,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: spacing.m,
    paddingVertical: 4,
    borderRadius: borderRadius.s,
  },
  toggleText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chart
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.s,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    height: '100%',
  },
  bar: {
    width: 18,
    borderRadius: 3,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '500',
  },

  // Students
  studentsRow: {
    gap: spacing.l,
    paddingVertical: spacing.xs,
  },
  studentItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 56,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  studentName: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 56,
  },

  // Sets
  setsList: {
    gap: spacing.m,
  },
  setCard: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
    gap: spacing.s,
  },
  setCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  setCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.s,
  },
  setCardWords: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  setCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  setCardMetaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  setCardAccuracy: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: borderRadius.l,
    padding: spacing.l,
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
    }) as any,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  modalList: {
    flexGrow: 0,
  },
  modalStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalAvatarWrap: {
    position: 'relative',
  },
  modalStudentName: {
    fontSize: 15,
    fontWeight: '500',
  },
});
