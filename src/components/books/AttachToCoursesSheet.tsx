/**
 * AttachToCoursesSheet
 * @description «Подключить книгу к курсу»: мультивыбор своих курсов. Уже подключённые — отмечены и недоступны.
 * После подключения все юниты в курсе закрыты — учитель открывает их в «Учебниках курса».
 * Оформление — общий нижний лист Sheet (брендбук, 7.6).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Sheet } from '@/components/ui';
import { useThemeColors, useCoursesStore } from '@/store';
import { spacing, borderRadius, heights, iconSize, alpha } from '@/constants';

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

  const hasCourses = ownCourses.length > 0;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Подключить «${bookTitle}» к курсам`}
      footer={
        hasCourses ? (
          <Button
            title={`Подключить${selected.length > 0 ? ` (${selected.length})` : ''}`}
            onPress={() => onSubmit(selected)}
            disabled={selected.length === 0}
            loading={isSubmitting}
            fullWidth
          />
        ) : undefined
      }
    >
      <Text variant="bodySmall" color="secondary" style={styles.subtitle}>
        Юниты будут закрыты — открой их в «Учебниках курса», когда группа дойдёт до них.
      </Text>

      {!hasCourses ? (
        <View style={styles.empty}>
          <Text variant="bodySmall" color="secondary" align="center">
            У тебя пока нет курсов
          </Text>
          <Button title="Создать курс" onPress={onCreateCourse} fullWidth />
        </View>
      ) : (
        <View style={styles.list}>
          {ownCourses.map((course) => {
            const attached = attachedCourseIds.includes(course.id);
            const checked = attached || selected.includes(course.id);
            return (
              <Pressable
                key={course.id}
                disabled={attached || isSubmitting}
                onPress={() => toggle(course.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: attached || isSubmitting }}
                accessibilityLabel={attached ? `${course.title}, уже подключена` : course.title}
                style={({ pressed }) => [
                  styles.option,
                  checked && !attached
                    ? { backgroundColor: alpha(colors.primary, 10), borderColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    checked
                      ? { backgroundColor: attached ? colors.textTertiary : colors.primaryFill, borderColor: 'transparent' }
                      : { borderColor: colors.border },
                  ]}
                >
                  {checked && <Check size={iconSize.xs} color={colors.onPrimary} strokeWidth={3} />}
                </View>
                <Text variant="body" style={[styles.optionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {course.title}
                </Text>
                {attached && (
                  <Text variant="caption" style={{ color: colors.textTertiary }}>уже подключена</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: -spacing.xs, marginBottom: spacing.m },
  list: { gap: spacing.s, paddingBottom: spacing.xs },
  pressed: { opacity: 0.85 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: heights.listRow,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: spacing.s,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.s,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { flex: 1, fontWeight: '600' },
  empty: { alignItems: 'center', gap: spacing.s, paddingVertical: spacing.m },
});
