/**
 * Шапка списка учеников: назад, название курса, число, «Пригласить»
 * (Clean 8 — вынесено из TeacherStudentsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { styles } from './styles';
import { type Student } from './helpers';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  filtered: Student[];
  navigation: NativeStackScreenProps<RootStackParamList, 'TeacherStudents'>['navigation'];
  route: NativeStackScreenProps<RootStackParamList, 'TeacherStudents'>['route'];
  openInviteModal: () => void;
};

export function StudentsHeader({ colors, filtered, navigation, route, openInviteModal }: Props) {
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: 12,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          ...(Platform.select({ web: { backdropFilter: 'blur(12px)' } }) as any),
        },
      ]}
    >
      {/* Left: back + title */}
      <View style={styles.headerLeft}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
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
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>
              {filtered.length}
            </Text>
          </View>
        </View>
      </View>

      {/* Right: add button */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.6 }]}
        hitSlop={8}
        onPress={openInviteModal}
      >
        <Plus size={20} color={colors.primary} />
        <Text style={[styles.addBtnText, { color: colors.primary }]}>Добавить</Text>
      </Pressable>
    </View>
  );
}
