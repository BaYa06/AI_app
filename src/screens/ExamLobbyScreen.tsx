/**
 * Exam Lobby Screen
 * @description Экран создания экзамена для учителя
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerHaptic } from '@/utils/haptic';
import {
  ArrowLeft,
  ArrowRight,
  ListChecks,
  PenLine,
  Layers,
  Minus,
  Plus,
  Check,
  ChevronDown,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import { NeonService } from '@/services/NeonService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamLobby'>;

type TestMode = 'multiple' | 'writing' | 'mixed';

const TIME_OPTIONS = [
  { label: 'Без лимита', value: 0 },
  { label: '10с', value: 10 },
  { label: '20с', value: 20 },
  { label: '30с', value: 30 },
];

export function ExamLobbyScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const [testMode, setTestMode] = useState<TestMode>('multiple');
  const [totalQuestions, setTotalQuestions] = useState(20);
  const [timePerQuestion, setTimePerQuestion] = useState(20);
  const [creating, setCreating] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Наборы карточек курса
  const [sets, setSets] = useState<Array<{ setId: string; title: string; totalCards: number }>>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [loadingSets, setLoadingSets] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stats = await NeonService.loadCourseSetStats(route.params.courseId);
        if (!mounted) return;
        setSets(stats);
        if (stats.length > 0) setSelectedSetId(stats[0].setId);
      } catch (e) {
        console.error('Failed to load sets:', e);
      } finally {
        if (mounted) setLoadingSets(false);
      }
    })();
    return () => { mounted = false; };
  }, [route.params.courseId]);

  const selectedSet = sets.find(s => s.setId === selectedSetId);
  const maxQuestions = Math.min(50, selectedSet?.totalCards || 50);

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const pillBg = isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9';

  const modes: { key: TestMode; label: string; icon: typeof ListChecks; disabled?: boolean }[] = [
    { key: 'multiple', label: 'Тест', icon: ListChecks },
    { key: 'writing', label: 'Письменный', icon: PenLine, disabled: true },
    { key: 'mixed', label: 'Смешанный', icon: Layers, disabled: true },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            paddingTop: Platform.OS === 'web' ? 12 : insets.top + 8,
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Новый тест
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Select Set — Dropdown */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Набор карточек
          </Text>

          {loadingSets ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : sets.length === 0 ? (
            <Text style={[styles.setCardMeta, { color: colors.textSecondary, textAlign: 'center', marginVertical: 20 }]}>
              Нет доступных наборов
            </Text>
          ) : (
            <View>
              {/* Selected value / trigger */}
              <Pressable
                onPress={() => setDropdownOpen(prev => !prev)}
                style={({ pressed }) => [
                  styles.dropdownTrigger,
                  {
                    backgroundColor: cardBg,
                    borderColor: dropdownOpen ? colors.primary : cardBorder,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.dropdownTriggerLeft}>
                  <View style={[styles.dropdownIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E8E7FD' }]}>
                    <ListChecks size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.setCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {selectedSet?.title || 'Выберите набор'}
                    </Text>
                    {selectedSet && (
                      <Text style={[styles.setCardMeta, { color: colors.textSecondary }]}>
                        {selectedSet.totalCards} терминов
                      </Text>
                    )}
                  </View>
                </View>
                <ChevronDown
                  size={20}
                  color={colors.textSecondary}
                  style={{ transform: [{ rotate: dropdownOpen ? '180deg' : '0deg' }] }}
                />
              </Pressable>

              {/* Dropdown list */}
              {dropdownOpen && (
                <View style={[styles.dropdownList, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                  {sets.map((s, idx) => {
                    const isActive = s.setId === selectedSetId;
                    return (
                      <Pressable
                        key={s.setId}
                        onPress={() => {
                          setSelectedSetId(s.setId);
                          setDropdownOpen(false);
                          if (totalQuestions > s.totalCards) setTotalQuestions(Math.max(5, Math.min(s.totalCards, totalQuestions)));
                        }}
                        style={({ pressed }) => [
                          styles.dropdownItem,
                          isActive && { backgroundColor: colors.primary + '10' },
                          idx < sets.length - 1 && { borderBottomWidth: 1, borderBottomColor: cardBorder },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.dropdownItemTitle,
                              { color: isActive ? colors.primary : colors.textPrimary },
                            ]}
                            numberOfLines={1}
                          >
                            {s.title}
                          </Text>
                          <Text style={[styles.setCardMeta, { color: colors.textSecondary }]}>
                            {s.totalCards} терминов
                          </Text>
                        </View>
                        {isActive && <Check size={18} color={colors.primary} strokeWidth={3} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Test Mode */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Тип теста
          </Text>
          <View style={styles.modesGrid}>
            {modes.map((m) => {
              const active = testMode === m.key;
              const Icon = m.icon;
              return (
                <Pressable
                  key={m.key}
                  style={({ pressed }) => [
                    styles.modeCard,
                    {
                      backgroundColor: cardBg,
                      borderColor: active ? colors.primary : cardBorder,
                      borderWidth: active ? 2 : 1,
                    },
                    active && {
                      ...Platform.select({
                        web: { boxShadow: `0 0 0 4px ${colors.primary}18` },
                      }) as any,
                      shadowColor: colors.primary,
                      shadowOpacity: 0.12,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 0 },
                    },
                    m.disabled && { opacity: 0.45 },
                    !active && !m.disabled && { opacity: 0.6 },
                    pressed && !m.disabled && { opacity: 0.5 },
                  ]}
                  onPress={() => { if (!m.disabled) { triggerHaptic('selection'); setTestMode(m.key); } }}
                >
                  {active && (
                    <View style={[styles.modeCheck, { backgroundColor: colors.primary }]}>
                      <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                  {m.disabled && (
                    <View style={[styles.modeSoon, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#F1F5F9' }]}>
                      <Text style={[styles.modeSoonText, { color: colors.textSecondary }]}>Скоро</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.modeIcon,
                      {
                        backgroundColor: active
                          ? colors.primary + '18'
                          : isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                      },
                    ]}
                  >
                    <Icon size={22} color={active ? colors.primary : colors.textSecondary} />
                  </View>
                  <Text
                    style={[
                      styles.modeLabel,
                      { color: active ? colors.textPrimary : colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Настройки
          </Text>

          {/* Total Questions Stepper */}
          <View style={[styles.settingCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                Кол-во вопросов
              </Text>
              <Text style={[styles.settingHint, { color: colors.textSecondary }]}>
                Макс: {maxQuestions}
              </Text>
            </View>
            <View style={[styles.stepper, { backgroundColor: pillBg }]}>
              <Pressable
                style={({ pressed }) => [
                  styles.stepperBtn,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF' },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => setTotalQuestions((q) => Math.max(5, q - 5))}
              >
                <Minus size={16} color={colors.textPrimary} />
              </Pressable>
              <Text style={[styles.stepperValue, { color: colors.textPrimary }]}>
                {totalQuestions}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.stepperBtn,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF' },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => setTotalQuestions((q) => Math.min(maxQuestions, q + 5))}
              >
                <Plus size={16} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Time per Question */}
          <View style={[styles.settingCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.settingLabel, { color: colors.textPrimary, marginBottom: 12 }]}>
              Время на вопрос
            </Text>
            <View style={[styles.timePill, { backgroundColor: pillBg }]}>
              {TIME_OPTIONS.map((opt) => {
                const active = timePerQuestion === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.timeOption,
                      active && {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF',
                        ...Platform.select({
                          web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
                        }) as any,
                        shadowColor: '#000',
                        shadowOpacity: 0.06,
                        shadowRadius: 3,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 1,
                      },
                    ]}
                    onPress={() => setTimePerQuestion(opt.value)}
                  >
                    <Text
                      style={[
                        styles.timeText,
                        { color: active ? colors.primary : colors.textSecondary },
                        active && { fontWeight: '700' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
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
            { backgroundColor: !selectedSetId || creating ? colors.textSecondary : colors.primary },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          disabled={!selectedSetId || creating}
          onPress={async () => {
            if (!selectedSetId || creating) return;
            triggerHaptic('selection');
            setCreating(true);
            try {
              const { data } = await supabase.auth.getSession();
              const teacherId = data.session?.user?.id;
              if (!teacherId) throw new Error('Not authenticated');

              const resp = await fetch(`${API_BASE}/test?action=create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  setId: selectedSetId,
                  courseId: route.params.courseId,
                  testMode,
                  questionCount: totalQuestions,
                  timePerQuestion,
                  teacherId,
                }),
              });
              const result = await resp.json();
              if (!resp.ok) throw new Error(result.error || 'Failed to create test');

              navigation.navigate('TestLobby', {
                courseId: route.params.courseId,
                courseTitle: route.params.courseTitle,
                sessionId: result.sessionId,
                code: result.code,
                testMode,
                questionCount: totalQuestions,
                timePerQuestion,
              });
            } catch (e: any) {
              console.error('Create test error:', e);
              alert(e.message || 'Ошибка создания теста');
            } finally {
              setCreating(false);
            }
          }}
        >
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.ctaText}>Создать тест</Text>
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
    gap: 28,
  },

  // Sections
  section: {
    gap: spacing.s,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  // Dropdown
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dropdownIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownList: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.m,
  },
  dropdownItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  setCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  setCardMeta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },

  // Mode grid
  modesGrid: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  modeCard: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.l,
    position: 'relative',
  },
  modeCheck: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modeSoon: {
    position: 'absolute',
    top: -6,
    right: -6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 1,
  },
  modeSoonText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Settings
  settingCard: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingHint: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: 4,
    borderRadius: borderRadius.m,
    position: 'absolute',
    right: spacing.m,
    top: spacing.m,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },
    }) as any,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'center',
  },

  // Time picker
  timePill: {
    flexDirection: 'row',
    borderRadius: borderRadius.m,
    padding: 4,
  },
  timeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.s,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
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
    paddingVertical: 16,
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
    fontSize: 16,
    fontWeight: '700',
  },
});
