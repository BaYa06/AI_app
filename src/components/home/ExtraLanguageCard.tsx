/**
 * «Хочешь начать и немецкий?» (plan/new/new_user_activation.md, Start 4.3): в онбординге выбрано
 * 2–3 языка, а стартовый набор — только на первом. На 3-й день с уроком — одна кнопка.
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { useThemeColors } from '@/store';
import {
  alpha,
  borderRadius,
  getLanguageDefByCode,
  iconSize,
  languageAccusative,
  spacing,
} from '@/constants';

export const ExtraLanguageCard = memo(function ExtraLanguageCard({
  language,
  onAdd,
  onClose,
}: {
  language: string;
  /** Может быть асинхронной — кнопка покажет загрузку */
  onAdd: () => unknown;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);
  const lang = getLanguageDefByCode(language);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.flag, { backgroundColor: alpha(colors.primary, 10) }]}>
        <Text variant="h2">{lang?.flag}</Text>
      </View>
      <View style={styles.text}>
        <Text variant="body" style={[styles.title, { color: colors.textPrimary }]}>
          Хочешь начать и {languageAccusative(language)}?
        </Text>
        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
          Добавим стартовый набор «Первые слова» — 20 слов
        </Text>
        <Button
          title="Добавить набор"
          variant="secondary"
          size="s"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onAdd();
            } finally {
              setBusy(false);
            }
          }}
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
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  flag: {
    width: 44,
    height: 44,
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
