/**
 * «Подключиться к учителю» над стопкой «Начало пути» (plan/new/new_user_activation.md, Start 3.6):
 * ученик на онбординге сказал, что учится с учителем. Крестик закрывает карточку навсегда;
 * подключиться можно и потом — из бокового меню «Курсы».
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { UserPlus, X } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';

export const JoinTeacherCard = memo(function JoinTeacherCard({
  onJoin,
  onClose,
}: {
  onJoin: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 10) },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primaryFill }]}>
        <UserPlus size={iconSize.m} color={colors.onPrimary} />
      </View>
      <View style={styles.text}>
        <Text variant="body" style={[styles.title, { color: colors.textPrimary }]}>
          Подключиться к учителю
        </Text>
        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
          Попроси у учителя код курса и введи его здесь
        </Text>
        <Button
          title="Ввести код"
          variant="secondary"
          size="s"
          onPress={onJoin}
          style={styles.button}
        />
      </View>
      <Button
        variant="icon"
        icon={X}
        background="none"
        iconSize={iconSize.xs}
        iconColor={colors.textSecondary}
        accessibilityLabel="Закрыть"
        onPress={onClose}
        style={styles.close}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
    paddingRight: spacing.l,
  },
  title: {
    fontWeight: '600',
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  close: {
    position: 'absolute',
    top: spacing.xxs,
    right: spacing.xxs,
  },
});
