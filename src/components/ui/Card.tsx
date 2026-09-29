/**
 * Card, ListRow, ListGroup — карточки и списки (брендбук, 7.3).
 *
 * Card: surface, скругление 16, рамка 1 border (без тени), отступ 16.
 * ListRow: высота ≥ 52, иконка 20 слева, текст body, справа шеврон 16 / значение / переключатель.
 * ListGroup: строки в одной карточке, над группой — overline-подпись, разделители 1 px с отступом 16.
 */
import React, { Children, Fragment, isValidElement, memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { alpha, borderRadius, heights, iconSize, spacing } from '@/constants';
import type { IconComponent } from './types';

// ==================== Card ====================

export interface CardProps {
  children?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Внутренний отступ: m — 16 (по умолчанию), s — 12, none — 0 (для списков). */
  padding?: 'none' | 's' | 'm';
  /** default — surface; muted — surfaceMuted без рамки; selected — подложка primary 10 % и рамка 40 %. */
  tone?: 'default' | 'muted' | 'selected';
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const Card = memo(function Card({
  children,
  onPress,
  onLongPress,
  padding = 'm',
  tone = 'default',
  disabled,
  accessibilityLabel,
  style,
}: CardProps) {
  const colors = useThemeColors();

  const toneStyle: ViewStyle =
    tone === 'muted'
      ? { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted }
      : tone === 'selected'
        ? { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 40) }
        : { backgroundColor: colors.surface, borderColor: colors.border };

  const cardStyle = [styles.card, toneStyle, paddingStyles[padding], disabled && styles.disabled];

  if (!onPress && !onLongPress) {
    return <View style={[cardStyle, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, selected: tone === 'selected' }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [cardStyle, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
});

// ==================== ListRow ====================

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconComponent;
  /** Цвет иконки (по умолчанию textSecondary). */
  iconColor?: string;
  /** Короткое значение справа: «Системная», «20 слов». */
  value?: string;
  /** Свой элемент справа (переключатель, бейдж). Заменяет value и шеврон. */
  right?: React.ReactNode;
  /** Шеврон справа; по умолчанию — если строка нажимается и нет right. */
  chevron?: boolean;
  /** Опасное действие: «Выйти», «Удалить» — текст и иконка errorText. */
  destructive?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ListRow = memo(function ListRow({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  value,
  right,
  chevron,
  destructive = false,
  onPress,
  disabled,
  style,
}: ListRowProps) {
  const colors = useThemeColors();
  const showChevron = chevron ?? (!!onPress && !right);
  const titleColor = destructive ? colors.errorText : colors.textPrimary;

  const content = (
    <>
      {Icon ? <Icon size={iconSize.s} color={destructive ? colors.errorText : iconColor ?? colors.textSecondary} /> : null}
      <View style={styles.rowText}>
        <Text variant="body" numberOfLines={2} style={{ color: titleColor }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" numberOfLines={2} style={{ color: colors.textSecondary }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (value ? (
        <Text variant="bodySmall" numberOfLines={1} style={[styles.value, { color: colors.textSecondary }]}>
          {value}
        </Text>
      ) : null)}
      {showChevron ? <ChevronRight size={iconSize.xs} color={colors.textTertiary} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, disabled && styles.disabled, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.surfaceMuted },
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
});

// ==================== ListGroup ====================

export interface ListGroupProps {
  /** Подпись над группой — overline («АККАУНТ»). */
  title?: string;
  /** Пояснение под группой — caption. */
  footer?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const ListGroup = memo(function ListGroup({ title, footer, children, style }: ListGroupProps) {
  const colors = useThemeColors();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={style}>
      {title ? (
        <Text variant="overline" style={[styles.groupTitle, { color: colors.textSecondary }]}>
          {title}
        </Text>
      ) : null}
      <Card padding="none" style={styles.groupCard}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
            {row}
          </Fragment>
        ))}
      </Card>
      {footer ? (
        <Text variant="caption" style={[styles.groupFooter, { color: colors.textSecondary }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
});

const paddingStyles = StyleSheet.create({
  none: { padding: 0 },
  s: { padding: spacing.s },
  m: { padding: spacing.m },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  row: {
    minHeight: heights.listRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  rowText: {
    flex: 1,
  },
  value: {
    maxWidth: '45%',
  },
  groupTitle: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xxs,
  },
  groupCard: {
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    marginLeft: spacing.m,
  },
  groupFooter: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.xxs,
  },
});
