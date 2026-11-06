/**
 * ChooseCourseSheet
 * @description Куда добавить набор из библиотеки: «Без курса» или один из своих курсов (одиночный выбор).
 * План: plan/book_catalog_plan.md, часть 9. Оформление — общий нижний лист Sheet (брендбук, 7.6).
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/common';
import { Button, Sheet } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, alpha } from '@/constants';
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
  /** Вариант «Без курса» (по умолчанию есть). Подборку целиком кладут только в курс — там его нет. */
  allowNoCourse?: boolean;
  /** Заголовок листа; по умолчанию «Добавить «название»». */
  title?: string;
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
  allowNoCourse = true,
  title,
}: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string | null>(initialCourseId);

  useEffect(() => {
    if (visible) setSelected(initialCourseId);
  }, [visible, initialCourseId]);

  const options: Array<{ id: string | null; title: string }> = [
    ...(allowNoCourse ? [{ id: null, title: 'Без курса' }] : []),
    ...courses.map((c) => ({ id: c.id, title: c.title })),
  ];
  // Без «Без курса» ничего не выбрано быть не может — берём первый курс.
  const effective = !allowNoCourse && selected === null ? (courses[0]?.id ?? null) : selected;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title ?? `Добавить «${setTitle}»`}
      footer={
        <>
          {showStudentsHint && effective !== null && (
            <Text variant="caption" color="secondary">
              Если в курсе есть ученики, они сразу увидят этот набор. Скрыть его можно в меню
              набора.
            </Text>
          )}
          <Button
            title="Добавить"
            onPress={() => onSubmit(effective)}
            disabled={effective === null && !allowNoCourse}
            loading={isSubmitting}
            fullWidth
          />
        </>
      }
    >
      <View style={styles.list} accessibilityRole="radiogroup">
        {options.map((option) => {
          const isSelected = effective === option.id;
          return (
            <Pressable
              key={option.id ?? 'none'}
              disabled={isSubmitting}
              onPress={() => setSelected(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: isSubmitting }}
              style={({ pressed }) => [
                styles.option,
                isSelected
                  ? { backgroundColor: alpha(colors.primary, 10), borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[styles.radio, { borderColor: isSelected ? colors.primary : colors.border }]}
              >
                {isSelected && (
                  <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                )}
              </View>
              <Text
                variant="body"
                style={[styles.optionTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {option.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
  radio: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: borderRadius.full },
  optionTitle: { flex: 1, fontWeight: '600' },
});
