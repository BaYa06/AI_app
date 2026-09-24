/**
 * ChooseCourseSheet
 * @description Куда добавить набор из библиотеки: «Без курса» или один из своих курсов (одиночный выбор).
 * План: plan/book_catalog_plan.md, часть 9.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { Course } from '@/types';

interface Props {
  visible: boolean;
  setTitle: string;
  /** Только свои курсы (не те, где пользователь ученик). */
  courses: Course[];
  initialCourseId: string | null;
  isSubmitting: boolean;
  /** Показать подсказку, что ученики курса сразу увидят набор (для учителя). */
  showStudentsHint: boolean;
  onClose: () => void;
  onSubmit: (courseId: string | null) => void;
}

export function ChooseCourseSheet({
  visible,
  setTitle,
  courses,
  initialCourseId,
  isSubmitting,
  showStudentsHint,
  onClose,
  onSubmit,
}: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(initialCourseId);

  useEffect(() => {
    if (visible) setSelected(initialCourseId);
  }, [visible, initialCourseId]);

  const optionBg = isDark ? 'rgba(255,255,255,0.06)' : '#F8F7FF';
  const optionBorder = isDark ? 'rgba(99,102,241,0.2)' : '#E0DDFB';
  const options: Array<{ id: string | null; title: string }> = [
    { id: null, title: 'Без курса' },
    ...courses.map((c) => ({ id: c.id, title: c.title })),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: isDark ? '#1E2030' : '#FFFFFF', paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            Добавить «{setTitle}»
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const isSelected = selected === option.id;
              return (
                <Pressable
                  key={option.id ?? 'none'}
                  disabled={isSubmitting}
                  onPress={() => setSelected(option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    { backgroundColor: optionBg, borderColor: isSelected ? colors.primary : optionBorder },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <View style={[styles.radio, { borderColor: isSelected ? colors.primary : colors.border }]}>
                    {isSelected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                  </View>
                  <Text style={[styles.optionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {option.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {showStudentsHint && selected !== null && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Если в курсе есть ученики, они сразу увидят этот набор. Скрыть его можно в меню набора.
            </Text>
          )}

          <Pressable
            disabled={isSubmitting}
            onPress={() => onSubmit(selected)}
            style={[styles.submit, { backgroundColor: colors.primary }, isSubmitting && { opacity: 0.5 }]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Добавить</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.l,
    paddingTop: 12,
    maxHeight: '80%',
    ...(Platform.select({ web: { boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' } }) as object),
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, marginBottom: 16 },
  list: { flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: borderRadius.l, borderWidth: 1, marginBottom: 10, gap: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optionTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginBottom: spacing.s },
  submit: { height: 48, borderRadius: borderRadius.l, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
