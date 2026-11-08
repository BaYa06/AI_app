/**
 * Баннер учителя на главной: создать курс / добавить наборы
 * (Clean 8 — вынесено из HomeScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha } from '@/constants';
import { toast } from '@/components/ui';
import { GraduationCap } from 'lucide-react-native';
import { styles } from '../styles';
import type { Course } from '@/types';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  activeCourseId: string | null;
  courses: Course[];
  navigation: any;
};

export function TeacherBanner({ colors, activeCourseId, courses, navigation }: Props) {
  return (
    <View style={styles.teacherBannerWrap}>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.teacherBanner,
          { backgroundColor: pressed ? colors.primaryPressed : colors.primaryFill },
        ]}
        onPress={() => {
          const ownCourses = courses.filter((c) => !c.isStudentCourse);
          const targetCourse = ownCourses.find((c) => c.id === activeCourseId) ?? ownCourses[0];

          if (!targetCourse) {
            toast.info('Нет курсов — сначала создай курс, чтобы открыть статистику учителя');
            return;
          }

          const rootNav = navigation?.getParent?.() ?? navigation;
          rootNav?.navigate('TeacherCourseStats', {
            courseId: targetCourse.id,
            courseTitle: targetCourse.title || 'Курс',
          });
        }}
      >
        <View style={styles.teacherBannerLeft}>
          <View
            style={[styles.teacherBannerIcon, { backgroundColor: alpha(colors.onPrimary, 20) }]}
          >
            <GraduationCap size={iconSize.s} color={colors.onPrimary} />
          </View>
          <View style={styles.flexShrink}>
            <Text variant="label" style={{ color: colors.onPrimary }}>
              Режим учителя
            </Text>
            <Text variant="caption" style={[styles.onFillMuted, { color: colors.onPrimary }]}>
              Ученики, наборы и тесты
            </Text>
          </View>
        </View>
        <View style={[styles.teacherBannerButton, { backgroundColor: colors.onPrimary }]}>
          <Text variant="caption" style={[styles.semibold, { color: colors.primaryFill }]}>
            Мои курсы →
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
