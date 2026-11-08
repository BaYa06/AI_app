/**
 * Секция «Поделиться набором» в редакторе: ссылка, просмотры, отключение
 * (Clean 8 — вынесено из SetEditorScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha } from '@/constants';
import { Button } from '@/components/ui';
import { Link2, Share2 } from 'lucide-react-native';
import { pluralize } from '@/utils';
import { styles } from './styles';
import type { CardSet } from '@/types';

type Props = {
  existingSet: CardSet;
  colors: ReturnType<typeof useThemeColors>;
  share: (set: CardSet) => void;
  isSharing: boolean;
  shareLink: { views: number; imports: number } | null;
  handleDisableShare: () => void;
  isDisablingShare: boolean;
};

export function ShareSection({
  existingSet,
  colors,
  share,
  isSharing,
  shareLink,
  handleDisableShare,
  isDisablingShare,
}: Props) {
  return (
    <View style={styles.field}>
      <Text variant="label" color="primary" style={styles.fieldLabel}>
        Поделиться набором
      </Text>
      <Button
        variant="secondary"
        title="Поделиться"
        icon={Share2}
        loading={isSharing}
        onPress={() => share(existingSet)}
        fullWidth
      />
      {shareLink && (
        <View
          style={[styles.shareRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.shareIcon, { backgroundColor: alpha(colors.primary, 10) }]}>
            <Link2 size={iconSize.s} color={colors.primary} />
          </View>
          <View style={styles.flex1}>
            <Text variant="body" color="primary">
              Ссылка действует
            </Text>
            <Text variant="caption" color="secondary">
              {`Открыли ${shareLink.views} · добавили ${shareLink.imports} ${pluralize(shareLink.imports, 'раз', 'раза', 'раз')}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleDisableShare}
            disabled={isDisablingShare}
            hitSlop={10}
            style={({ pressed }) => [
              styles.shareDisable,
              (pressed || isDisablingShare) && { opacity: 0.5 },
            ]}
          >
            <Text variant="label" style={{ color: colors.errorText }}>
              Закрыть доступ
            </Text>
          </Pressable>
        </View>
      )}
      <Text variant="caption" color="tertiary" style={styles.helperText}>
        Отправь ссылку — друг сможет добавить все карточки себе. Набор видят только те, у кого есть
        ссылка
      </Text>
    </View>
  );
}
