/**
 * AttachToCoursesSheet
 * @description «Подключить книгу к курсу»: мультивыбор своих курсов. Уже подключённые — отмечены и недоступны.
 * После подключения все юниты в курсе закрыты — учитель открывает их в «Учебниках курса».
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore, useCoursesStore } from '@/store';
import { spacing, borderRadius } from '@/constants';

interface Props {
  visible: boolean;
  bookTitle: string;
  attachedCourseIds: string[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (courseIds: string[]) => void;
  onCreateCourse: () => void;
}

export function AttachToCoursesSheet({
  visible,
  bookTitle,
  attachedCourseIds,
  isSubmitting,
  onClose,
  onSubmit,
  onCreateCourse,
}: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();
  const allCourses = useCoursesStore((s) => s.courses);
  // Только свои курсы: в курс, где пользователь ученик, книгу подключить нельзя.
  const ownCourses = useMemo(() => allCourses.filter((c) => !c.isStudentCourse), [allCourses]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (visible) setSelected([]);
  }, [visible]);

  const toggle = (courseId: string) => {
    setSelected((prev) => (prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]));
  };

  const optionBg = isDark ? 'rgba(255,255,255,0.06)' : '#F8F7FF';
  const optionBorder = isDark ? 'rgba(99,102,241,0.2)' : '#E0DDFB';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: isDark ? '#1E2030' : '#FFFFFF', paddingBottom: insets.bottom + 16 }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            Подключить «{bookTitle}» к курсам
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Юниты будут закрыты — откройте их в «Учебниках курса», когда группа дойдёт до них.
          </Text>

          {ownCourses.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                У вас пока нет курсов
              </Text>
              <Pressable style={[styles.submit, { backgroundColor: colors.primary }]} onPress={onCreateCourse}>
                <Text style={styles.submitText}>Создать курс</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {ownCourses.map((course) => {
                  const attached = attachedCourseIds.includes(course.id);
                  const checked = attached || selected.includes(course.id);
                  return (
                    <Pressable
                      key={course.id}
                      disabled={attached || isSubmitting}
                      onPress={() => toggle(course.id)}
                      style={({ pressed }) => [
                        styles.option,
                        { backgroundColor: optionBg, borderColor: checked && !attached ? colors.primary : optionBorder },
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          checked
                            ? { backgroundColor: attached ? colors.textTertiary : colors.primary, borderColor: 'transparent' }
                            : { borderColor: colors.border },
                        ]}
                      >
                        {checked && <Check size={14} color="#FFFFFF" />}
                      </View>
                      <Text style={[styles.optionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {course.title}
                      </Text>
                      {attached && (
                        <Text style={[styles.optionHint, { color: colors.textTertiary }]}>уже подключена</Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                disabled={selected.length === 0 || isSubmitting}
                onPress={() => onSubmit(selected)}
                style={[
                  styles.submit,
                  { backgroundColor: colors.primary },
                  (selected.length === 0 || isSubmitting) && { opacity: 0.5 },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>
                    Подключить{selected.length > 0 ? ` (${selected.length})` : ''}
                  </Text>
                )}
              </Pressable>
            </>
          )}
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
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, marginBottom: 6 },
  subtitle: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 16 },
  list: { flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: borderRadius.l, borderWidth: 1, marginBottom: 10, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  optionHint: { fontSize: 12, fontWeight: '500' },
  empty: { alignItems: 'center', gap: spacing.s, paddingVertical: spacing.m },
  submit: { height: 48, borderRadius: borderRadius.l, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
