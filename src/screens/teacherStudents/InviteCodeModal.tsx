/**
 * Окно кода приглашения в курс: копировать, обновить
 * (Clean 8 — вынесено из TeacherStudentsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, ActivityIndicator, Modal } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { styles } from './styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  inviteModalOpen: boolean;
  setInviteModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  inviteJoinCode: string | null;
  inviteLoading: boolean;
  inviteCopied: boolean;
  handleCopyInviteCode: () => void;
  handleRegenerateInvite: () => void;
};

export function InviteCodeModal({
  colors,
  inviteModalOpen,
  setInviteModalOpen,
  inviteJoinCode,
  inviteLoading,
  inviteCopied,
  handleCopyInviteCode,
  handleRegenerateInvite,
}: Props) {
  return (
    <Modal
      visible={inviteModalOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setInviteModalOpen(false)}
    >
      <Pressable
        accessible={false}
        style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        onPress={() => setInviteModalOpen(false)}
      >
        <Pressable
          accessible={false}
          style={[styles.inviteCard, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.inviteHeader}>
            <Text style={[styles.inviteTitle, { color: colors.textPrimary }]}>
              Пригласить ученика
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={() => setInviteModalOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={[styles.inviteDescription, { color: colors.textSecondary }]}>
            Отправь код ученику — он введёт его в приложении, чтобы присоединиться к курсу
          </Text>
          {inviteLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.l }} />
          ) : inviteJoinCode ? (
            <>
              <View style={[styles.inviteCodeBox, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.inviteCodeText, { color: colors.primary }]}>
                  {inviteJoinCode}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                style={[styles.inviteActionBtn, { backgroundColor: colors.primaryFill }]}
                onPress={handleCopyInviteCode}
              >
                <Text style={[styles.inviteActionBtnText, { color: colors.onPrimary }]}>
                  {inviteCopied ? '✓ Скопировано' : 'Копировать код'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleRegenerateInvite}
                style={{ marginTop: spacing.s }}
              >
                <Text style={[styles.inviteRegenerateText, { color: colors.textSecondary }]}>
                  Обновить код приглашения
                </Text>
              </Pressable>
            </>
          ) : (
            <Text
              style={[
                styles.inviteDescription,
                { color: colors.textSecondary, marginVertical: spacing.m },
              ]}
            >
              Не удалось создать приглашение
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
