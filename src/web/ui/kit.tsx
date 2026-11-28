/**
 * Мелкие блоки кабинета поверх компонентов брендбука (DESIGN.md): аватар-инициалы, шапка страницы,
 * вкладки, плитка с числом, подпись раздела. Только токены из src/constants, один фиолетовый.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, Minus, Plus } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { initials, type ActivityTone } from '../teacherLogic';
import { navigate } from '../router';

/** Цвет подписи по смыслу: текстовые токены, не заливки (DESIGN.md — правило «Fill and Ink») */
export function toneColor(tone: ActivityTone, colors: ReturnType<typeof useThemeColors>): string {
  if (tone === 'success') return colors.successText;
  if (tone === 'warning') return colors.warningText;
  if (tone === 'error') return colors.errorText;
  return colors.textTertiary;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: borderRadius.full,
        backgroundColor: alpha(colors.primary, 10),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant={size >= 56 ? 'h3' : 'label'}
        style={{ color: colors.primary, fontSize: Math.round(size * 0.36) }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/** Подпись раздела: Overline, единственный вид заглавных букв */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="overline" color="secondary" accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  leading,
}: {
  title: string;
  subtitle?: string | null;
  /** Куда ведёт «назад»: подпись и путь */
  back?: { label: string; path: string };
  actions?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => navigate(back.path)}
          style={styles.back}
          hitSlop={spacing.xs}
        >
          <ChevronLeft size={16} color={colors.textSecondary} />
          <Text variant="bodySmall" color="secondary">
            {back.label}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.headerRow}>
        {leading}
        <View style={styles.headerText}>
          <Text variant="h2" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color="secondary" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );
}

export type TabItem<K extends string> = { key: K; label: string };

/** Вкладки страницы: подчёркнутая активная, управляются стрелками и Tab */
export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  const colors = useThemeColors();
  return (
    <View role="tablist" style={[styles.tabs, { borderBottomColor: colors.border }]}>
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            role="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, { borderBottomColor: selected ? colors.primary : 'transparent' }]}
          >
            <Text
              variant="label"
              style={{ color: selected ? colors.primary : colors.textSecondary }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Счётчик «− 12 +» для чисел в настройках (слова, форматы, минуты) */
export function Stepper({
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  label,
}: {
  value: number | string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  label: string;
}) {
  return (
    <View style={styles.stepper}>
      <Button
        variant="icon"
        icon={Minus}
        accessibilityLabel={`${label}: меньше`}
        onPress={onMinus}
        disabled={minusDisabled}
      />
      <Text variant="h3" align="center" style={styles.stepValue} accessibilityLiveRegion="polite">
        {String(value)}
      </Text>
      <Button
        variant="icon"
        icon={Plus}
        accessibilityLabel={`${label}: больше`}
        onPress={onPlus}
        disabled={plusDisabled}
      />
    </View>
  );
}

/** Плитка с одним числом: «Занимались сегодня 18» */
export function StatTile({
  value,
  label,
  tone = 'neutral',
}: {
  value: string | number;
  label: string;
  tone?: 'neutral' | 'warning' | 'success';
}) {
  const colors = useThemeColors();
  const color =
    tone === 'warning'
      ? colors.warningText
      : tone === 'success'
        ? colors.successText
        : colors.textPrimary;
  return (
    <Card style={styles.tile}>
      <Text variant="h1" style={{ color }}>
        {String(value)}
      </Text>
      <Text variant="bodySmall" color="secondary">
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.s, marginBottom: spacing.l },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  headerText: { flex: 1, gap: spacing.xxs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  tabs: { flexDirection: 'row', gap: spacing.l, borderBottomWidth: 1, marginBottom: spacing.l },
  tab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, marginBottom: -1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepValue: { minWidth: 40 },
  tile: { flex: 1, minWidth: 160, gap: spacing.xxs },
});
