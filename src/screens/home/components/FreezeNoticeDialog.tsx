/**
 * «Заморозка спасла серию» — один раз после того, как она сработала
 * (plan/new/streak_freeze_display.md, Freeze 4).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Snowflake } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Dialog } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import { pluralize } from '@/utils';
import type { FreezeNotice } from '@/services/freezeNotice';

type Props = {
  notice: FreezeNotice | null;
  visible: boolean;
  onClose: () => void;
};

export function FreezeNoticeDialog({ notice, visible, onClose }: Props) {
  const colors = useThemeColors();
  if (!notice) return null;
  const days = `${notice.streak} ${pluralize(notice.streak, 'день', 'дня', 'дней')}`;
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      footer={<Button filled fullWidth title="Понятно" onPress={onClose} />}
    >
      <View style={local.body}>
        <View
          style={[
            local.icon,
            { backgroundColor: alpha(colors.info, 10), borderColor: alpha(colors.info, 40) },
          ]}
        >
          <Snowflake size={32} color={colors.info} />
        </View>
        <Text variant="h3" align="center" style={{ color: colors.textPrimary }}>
          Заморозка спасла серию
        </Text>
        <Text variant="body" align="center" style={{ color: colors.textSecondary }}>
          {`Вчера ты пропустил день — серия ${days} сохранена. Заморозок осталось: ${notice.freezesLeft}`}
        </Text>
      </View>
    </Dialog>
  );
}

const local = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.s },
  icon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
