/**
 * CourseDropdown — элемент формы редактора набора
 * (Clean 8 — перенесено из SetEditorScreen.tsx без изменений.)
 */
import { View, ScrollView, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha } from '@/constants';
import { Check } from 'lucide-react-native';
import { styles } from './styles';

export function CourseDropdown({
  courses,
  selectedCourseId,
  onSelect,
  colors,
}: {
  courses: Array<{ id: string; title: string }>;
  selectedCourseId: string | null;
  onSelect: (value: string | null) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const items = [{ id: null, title: 'Без курса' }, ...courses];

  return (
    <View
      style={[
        styles.courseDropdown,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <ScrollView
        style={styles.courseDropdownScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {items.map((course, index) => {
          const isActive = course.id === selectedCourseId;
          const isFirst = index === 0;
          const isLast = index === items.length - 1;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              key={course.id ?? 'none'}
              onPress={() => onSelect(course.id)}
              style={({ pressed }) => [
                styles.courseDropdownOption,
                {
                  backgroundColor:
                    pressed && !isActive
                      ? colors.surfaceVariant
                      : isActive
                        ? alpha(colors.primary, 10)
                        : colors.surface,
                  borderBottomColor: colors.border,
                },
                isFirst && styles.courseDropdownOptionFirst,
                isLast && styles.courseDropdownOptionLast,
              ]}
            >
              <Text
                variant="body"
                style={{
                  color: isActive ? colors.primary : colors.textPrimary,
                  fontWeight: isActive ? '700' : '600',
                  fontSize: 16,
                }}
              >
                {course.title}
              </Text>
              {isActive && (
                <View style={[styles.checkmark, { backgroundColor: colors.primaryFill }]}>
                  <Check size={iconSize.xs} color={colors.onPrimary} strokeWidth={3} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
