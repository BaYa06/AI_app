/**
 * ImportStatus
 * @description Полноэкранное состояние ИИ-импорта (plan/done/ai_import.md, AI 5–6): «ИИ перегружен»,
 * «лимит на сегодня», «нет связи», «слов не найдено» и т.п. Иконка, заголовок, объяснение,
 * необязательный блок-подсказка и до двух действий.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/common';
import { Button } from '@/components/ui';
import type { IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, screenPadding, spacing } from '@/constants';

export interface ImportStatusAction {
  title: string;
  onPress: () => void;
}

interface Props {
  icon: IconComponent;
  tone: 'warning' | 'error' | 'primary';
  title: string;
  text: string;
  /** Дополнительный блок под текстом: советы, очередь, отсчёт */
  children?: React.ReactNode;
  primary?: ImportStatusAction;
  secondary?: ImportStatusAction;
}

export const ImportStatus = memo(function ImportStatus({ icon: Icon, tone, title, text, children, primary, secondary }: Props) {
  const colors = useThemeColors();
  const toneColor = tone === 'warning' ? colors.warningText : tone === 'error' ? colors.errorText : colors.primary;
  const toneBg = tone === 'warning' ? colors.warning : tone === 'error' ? colors.error : colors.primary;

  return (
    <View style={styles.root}>
      <View style={styles.body} accessibilityLiveRegion="polite">
        <View style={[styles.icon, { backgroundColor: alpha(toneBg, 10) }]}>
          <Icon size={iconSize.xl} color={toneColor} />
        </View>
        <Text variant="h2" align="center" style={{ color: colors.textPrimary }}>{title}</Text>
        <Text variant="body" align="center" color="secondary">{text}</Text>
        {children}
      </View>
      <View style={styles.actions}>
        {primary && <Button title={primary.title} onPress={primary.onPress} fullWidth />}
        {secondary && <Button variant="secondary" title={secondary.title} onPress={secondary.onPress} fullWidth />}
      </View>
    </View>
  );
});

export const statusStyles = StyleSheet.create({
  box: { alignSelf: 'stretch', borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.xs },
});

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: screenPadding, paddingBottom: spacing.l },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s },
  icon: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actions: { gap: spacing.s },
});
