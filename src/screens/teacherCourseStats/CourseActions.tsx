/**
 * Действия курса: тест, код подключения, история, рейтинг, расписание, учебники
 * (Clean 8 — вынесено из TeacherCourseStatsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import {
  ArrowLeft,
  GraduationCap,
  Clock,
  BookOpen,
  Trophy,
  CalendarClock,
  UserPlus,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { alpha } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { styles } from './styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  navigation: NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>['navigation'];
  route: NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>['route'];
  setJoinCodeDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setLobbyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setScheduleSheet: React.Dispatch<React.SetStateAction<boolean>>;
};

export function CourseActions({
  colors,
  navigation,
  route,
  setJoinCodeDialog,
  setLobbyModal,
  setScheduleSheet,
}: Props) {
  return (
    <View style={styles.actionList}>
      {/* Test Lobby Button */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.testLobbyBtn,
          {
            backgroundColor: alpha(colors.primary, 10),
            borderColor: alpha(colors.primary, 10),
          },
          pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() => setLobbyModal(true)}
      >
        <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
          <GraduationCap size={18} color={colors.onPrimary} />
        </View>
        <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>Живой тест</Text>
        <ArrowLeft
          size={16}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: '180deg' }] }}
        />
      </Pressable>

      {/* Код подключения к курсу — тот же код, что в «Пригласить учеников» */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.testLobbyBtn,
          {
            backgroundColor: alpha(colors.primary, 10),
            borderColor: alpha(colors.primary, 10),
          },
          pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() => setJoinCodeDialog(true)}
      >
        <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
          <UserPlus size={18} color={colors.onPrimary} />
        </View>
        <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
          Код подключения к курсу
        </Text>
        <ArrowLeft
          size={16}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: '180deg' }] }}
        />
      </Pressable>

      {/* История тестов */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.testLobbyBtn,
          {
            backgroundColor: alpha(colors.primary, 10),
            borderColor: alpha(colors.primary, 10),
          },
          pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() =>
          navigation.navigate('TestHistory', {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          })
        }
      >
        <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
          <Clock size={18} color={colors.onPrimary} />
        </View>
        <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>История тестов</Text>
        <ArrowLeft
          size={16}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: '180deg' }] }}
        />
      </Pressable>

      {/* Рейтинг недели (план, этап 4): места учеников, награды, включение рейтинга */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.testLobbyBtn,
          {
            backgroundColor: alpha(colors.primary, 10),
            borderColor: alpha(colors.primary, 10),
          },
          pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() =>
          navigation.navigate('CourseLeaderboard', {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          })
        }
      >
        <View style={[styles.testLobbyIcon, { backgroundColor: colors.warning }]}>
          <Trophy size={18} color={colors.onPrimary} />
        </View>
        <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>Рейтинг недели</Text>
        <ArrowLeft
          size={16}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: '180deg' }] }}
        />
      </Pressable>

      {/* Расписание занятий (plan/new/push_notifications.md, 2.8): ученикам — «Скоро занятие» за 1–2 часа */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.testLobbyBtn,
          {
            backgroundColor: alpha(colors.primary, 10),
            borderColor: alpha(colors.primary, 10),
          },
          pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() => setScheduleSheet(true)}
      >
        <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
          <CalendarClock size={18} color={colors.onPrimary} />
        </View>
        <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>
          Расписание занятий
        </Text>
        <ArrowLeft
          size={16}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: '180deg' }] }}
        />
      </Pressable>

      {/* Учебники курса (каталог книг): план юнитов этой группы */}
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.testLobbyBtn,
          {
            backgroundColor: alpha(colors.primary, 10),
            borderColor: alpha(colors.primary, 10),
          },
          pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        ]}
        onPress={() =>
          navigation.navigate('CourseBooks', {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          })
        }
      >
        <View style={[styles.testLobbyIcon, { backgroundColor: colors.primaryFill }]}>
          <BookOpen size={18} color={colors.onPrimary} />
        </View>
        <Text style={[styles.testLobbyText, { color: colors.textPrimary }]}>Учебники курса</Text>
        <ArrowLeft
          size={16}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: '180deg' }] }}
        />
      </Pressable>
    </View>
  );
}
