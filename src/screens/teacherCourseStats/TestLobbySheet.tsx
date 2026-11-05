/**
 * Шторка запуска теста: живой тест или устный
 * (Clean 8 — вынесено из TeacherCourseStatsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, Modal } from 'react-native';
import { ArrowLeft, FileText, Mic } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { alpha } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { styles } from './styles';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  insets: EdgeInsets;
  lobbyModal: boolean;
  setLobbyModal: React.Dispatch<React.SetStateAction<boolean>>;
  navigation: NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>['navigation'];
  route: NativeStackScreenProps<RootStackParamList, 'TeacherCourseStats'>['route'];
};

export function TestLobbySheet({
  colors,
  insets,
  lobbyModal,
  setLobbyModal,
  navigation,
  route,
}: Props) {
  return (
    <Modal
      visible={lobbyModal}
      transparent
      animationType="slide"
      onRequestClose={() => setLobbyModal(false)}
    >
      <Pressable
        accessible={false}
        style={styles.sheetOverlay}
        onPress={() => setLobbyModal(false)}
      >
        <Pressable
          accessible={false}
          style={[
            styles.sheetContent,
            {
              backgroundColor: colors.surface,
              paddingBottom: insets.bottom + 16,
            },
          ]}
          onPress={() => {}}
        >
          <View style={[styles.sheetHandle, { backgroundColor: alpha(colors.textTertiary, 40) }]} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Выбери тип теста</Text>

          {/* Exam option */}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.sheetOption,
              {
                backgroundColor: alpha(colors.primary, 10),
                borderColor: alpha(colors.primary, 10),
              },
              pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => {
              setLobbyModal(false);
              navigation.navigate('ExamLobby', {
                courseId: route.params.courseId,
                courseTitle: route.params.courseTitle,
              });
            }}
          >
            <View style={[styles.sheetOptionIcon, { backgroundColor: colors.primaryFill }]}>
              <FileText size={20} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetOptionTitle, { color: colors.textPrimary }]}>Экзамен</Text>
              <Text style={[styles.sheetOptionDesc, { color: colors.textSecondary }]}>
                Письменный тест с вопросами
              </Text>
            </View>
            <ArrowLeft
              size={16}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </Pressable>

          {/* Oral test option */}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.sheetOption,
              {
                backgroundColor: alpha(colors.streak, 10),
                borderColor: alpha(colors.streak, 10),
              },
              pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => {
              setLobbyModal(false);
              navigation.navigate('OralTestLobby', {
                courseId: route.params.courseId,
                courseTitle: route.params.courseTitle,
              });
            }}
          >
            <View style={[styles.sheetOptionIcon, { backgroundColor: colors.streak }]}>
              <Mic size={20} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetOptionTitle, { color: colors.textPrimary }]}>
                Устный тренажёр
              </Text>
              <Text style={[styles.sheetOptionDesc, { color: colors.textSecondary }]}>
                Тренировка произношения — результат не сохраняется
              </Text>
            </View>
            <ArrowLeft
              size={16}
              color={colors.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
