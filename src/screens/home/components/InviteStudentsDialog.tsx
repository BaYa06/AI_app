/**
 * Окно «Пригласить учеников»: код и ссылка курса
 * (Clean 8a — вынесено из HomeScreen без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, Share, ActivityIndicator } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { alpha } from '@/constants';
import { Button, Dialog } from '@/components/ui';
import { Check } from 'lucide-react-native';
import { styles } from '../styles';

type Props = {
  inviteModalCourseId: string | null;
  closeInviteModal: () => void;
  closeButton: (onPress: () => void, disabled?: boolean) => React.ReactNode;
  colors: ReturnType<typeof useThemeColors>;
  copyToClipboard: (text: string) => void;
  handleRegenerateInvite: () => void;
  inviteBaseUrl: string;
  inviteCopied: boolean;
  setInviteCopied: React.Dispatch<React.SetStateAction<boolean>>;
  inviteJoinCode: string | null;
  inviteLoading: boolean;
  inviteRegenerating: boolean;
  inviteToken: string | null;
};

export function InviteStudentsDialog({
  inviteModalCourseId,
  closeInviteModal,
  closeButton,
  colors,
  copyToClipboard,
  handleRegenerateInvite,
  inviteBaseUrl,
  inviteCopied,
  setInviteCopied,
  inviteJoinCode,
  inviteLoading,
  inviteRegenerating,
  inviteToken,
}: Props) {
  return (
    <Dialog
      visible={inviteModalCourseId !== null}
      onClose={closeInviteModal}
      title="Пригласить учеников"
      headerRight={closeButton(closeInviteModal)}
    >
      <Text variant="bodySmall" style={[styles.inviteDescription, { color: colors.textSecondary }]}>
        Поделись ссылкой или кодом — ученики смогут присоединиться к курсу.
      </Text>

      {inviteLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.inviteSpinner} />
      ) : inviteToken ? (
        <>
          {/* Код курса */}
          {inviteJoinCode && (
            <View style={styles.inviteCodeBlock}>
              <Text
                variant="label"
                style={[styles.inviteCodeLabel, { color: colors.textSecondary }]}
              >
                Код курса
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Код курса ${inviteJoinCode.split('').join(' ')}. Нажми, чтобы скопировать`}
                style={[
                  styles.inviteBox,
                  styles.inviteCodeBox,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: alpha(colors.primary, 40),
                  },
                ]}
                onPress={() => copyToClipboard(inviteJoinCode)}
              >
                <Text variant="h1" style={[styles.inviteCode, { color: colors.primary }]}>
                  {inviteJoinCode}
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityHint="Удерживай, чтобы скопировать ссылку"
            style={[
              styles.inviteBox,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ]}
            onLongPress={() => {
              copyToClipboard(`${inviteBaseUrl}/join/${inviteToken}`);
              setInviteCopied(true);
            }}
          >
            <Text variant="label" style={{ color: colors.primary }} numberOfLines={1} selectable>
              {`${inviteBaseUrl}/join/${inviteToken}`}
            </Text>
          </Pressable>

          <View style={styles.dialogButtons}>
            <Button
              title={inviteCopied ? 'Скопировано' : 'Копировать'}
              icon={inviteCopied ? Check : undefined}
              onPress={() => {
                copyToClipboard(`${inviteBaseUrl}/join/${inviteToken}`);
                setInviteCopied(true);
              }}
              style={styles.flex1}
            />
            <Button
              variant="secondary"
              title="Поделиться"
              onPress={async () => {
                try {
                  await Share.share({ message: `${inviteBaseUrl}/join/${inviteToken}` });
                } catch {}
              }}
              style={styles.flex1}
            />
          </View>

          <Button
            variant="quiet"
            tone="secondary"
            title="Обновить код приглашения"
            onPress={handleRegenerateInvite}
            loading={inviteRegenerating}
            fullWidth
            style={styles.inviteRegenerate}
          />
        </>
      ) : (
        <Text variant="bodySmall" style={{ color: colors.errorText }}>
          Не удалось создать ссылку
        </Text>
      )}
    </Dialog>
  );
}
