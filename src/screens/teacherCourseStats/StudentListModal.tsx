/**
 * Окно списка учеников (активны сегодня / не заходили 7д+)
 * (Clean 8 — вынесено из TeacherCourseStatsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, ScrollView, Pressable, Modal } from 'react-native';
import { X, Flame } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, alpha, iconSize } from '@/constants';
import { styles } from './styles';
import { type CourseMember, formatLastActive } from './helpers';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  modalStudents: CourseMember[];
  modalTitle: string;
  studentModal: 'active' | 'inactive' | null;
  setStudentModal: React.Dispatch<React.SetStateAction<'active' | 'inactive' | null>>;
};

export function StudentListModal({
  colors,
  modalStudents,
  modalTitle,
  studentModal,
  setStudentModal,
}: Props) {
  return (
    <Modal
      visible={studentModal !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setStudentModal(null)}
    >
      <Pressable
        accessible={false}
        style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        onPress={() => setStudentModal(null)}
      >
        <Pressable
          accessible={false}
          style={[styles.modalContent, { backgroundColor: colors.surface }]}
          onPress={() => {}}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{modalTitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={() => setStudentModal(null)}
              hitSlop={8}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {modalStudents.length === 0 ? (
              <Text
                style={[
                  styles.emptyMembers,
                  { color: colors.textSecondary, paddingVertical: spacing.l },
                ]}
              >
                Нет учеников
              </Text>
            ) : (
              modalStudents.map((s) => {
                const dotColor =
                  s.status === 'online'
                    ? colors.success
                    : s.status === 'away'
                      ? colors.warning
                      : s.status === 'offline'
                        ? colors.error
                        : colors.textTertiary;
                const lastActive = formatLastActive(s.lastActiveDate, colors);
                return (
                  <View
                    key={s.id}
                    style={[styles.modalStudentRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.modalAvatarWrap}>
                      <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, 20) }]}>
                        <Text style={[styles.avatarInitials, { color: colors.primary }]}>
                          {s.initials}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.onlineDot,
                          {
                            backgroundColor: dotColor,
                            borderColor: colors.border,
                          },
                        ]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalStudentName, { color: colors.textPrimary }]}>
                        {s.name}
                      </Text>
                      {lastActive && (
                        <Text style={{ fontSize: 12, color: lastActive.color, marginTop: 1 }}>
                          {lastActive.text}
                        </Text>
                      )}
                    </View>
                    {s.streak > 0 && (
                      <View
                        style={[
                          styles.modalStreakBadge,
                          { backgroundColor: alpha(colors.streak, 10) },
                        ]}
                      >
                        <Flame size={iconSize.xs} color={colors.streak} />
                        <Text style={[styles.modalStreakText, { color: colors.warningText }]}>
                          {s.streak}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
