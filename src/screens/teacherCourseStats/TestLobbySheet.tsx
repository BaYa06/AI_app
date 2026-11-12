/**
 * Шторка запуска теста: живой тест или устный
 * (Clean 8 — вынесено из TeacherCourseStatsScreen.tsx без изменений разметки.)
 * Teacher 3 (plan/new/teacher_cabinet.md): шторка только сообщает выбор (`onSelect`), переход делает
 * тот, кто её открыл, — главная учителя или страница курса.
 * Teacher 11: на iOS — нативный лист (TestTypeSheet.swift, nativeTestTypeSheet.ts), здесь — Android и веб.
 */
import React from 'react';
import { View, Pressable, Modal } from 'react-native';
import { ArrowLeft, FileText, Mic } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { alpha } from '@/constants';
import { styles } from './styles';
import { isNativeTestTypeSheet, useNativeTestTypeSheet } from './nativeTestTypeSheet';
import { TEST_TYPE_TEXTS, type TestKind } from './testType';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  insets: EdgeInsets;
  lobbyModal: boolean;
  setLobbyModal: React.Dispatch<React.SetStateAction<boolean>>;
  onSelect: (kind: TestKind) => void;
};

export type { TestKind };

export function TestLobbySheet(props: Props) {
  useNativeTestTypeSheet({
    visible: props.lobbyModal,
    onClose: () => props.setLobbyModal(false),
    onSelect: props.onSelect,
  });
  if (isNativeTestTypeSheet) return null;
  return <TestLobbySheetRN {...props} />;
}

function TestLobbySheetRN({ colors, insets, lobbyModal, setLobbyModal, onSelect }: Props) {
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
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
            {TEST_TYPE_TEXTS.title}
          </Text>

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
              onSelect('exam');
            }}
          >
            <View style={[styles.sheetOptionIcon, { backgroundColor: colors.primaryFill }]}>
              <FileText size={20} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetOptionTitle, { color: colors.textPrimary }]}>
                {TEST_TYPE_TEXTS.examTitle}
              </Text>
              <Text style={[styles.sheetOptionDesc, { color: colors.textSecondary }]}>
                {TEST_TYPE_TEXTS.examDescription}
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
              onSelect('oral');
            }}
          >
            <View style={[styles.sheetOptionIcon, { backgroundColor: colors.streak }]}>
              <Mic size={20} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetOptionTitle, { color: colors.textPrimary }]}>
                {TEST_TYPE_TEXTS.oralTitle}
              </Text>
              <Text style={[styles.sheetOptionDesc, { color: colors.textSecondary }]}>
                {TEST_TYPE_TEXTS.oralDescription}
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
