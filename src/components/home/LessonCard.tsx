/**
 * LessonCard — главная карточка «Урок дня» (plan/home_redesign.md, шаг 2.1)
 * @description Единственный залитый элемент главной: надзаголовок, заголовок, состав и время,
 * одна причина начать, кольцо прогресса дня и кнопка во всю ширину — всё это одна кнопка.
 * Под ней — тихое «Сменить набор» (отдельно: вложенную кнопку VoiceOver на iOS не видит).
 * Спокойный вид (урок пройден): surface + рамка, иконка вместо кольца, контурная кнопка.
 * Содержимое готовит lessonCardContent (lessonText.ts), действие по kind выбирает главная.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Check, Trophy } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { Button, Card } from '@/components/ui';
import { alpha, borderRadius, heights, iconSize, spacing } from '@/constants';
import type { LessonCardContent } from './lessonText';

const RING_SIZE = 56;
const RING_STROKE = 6;

interface Props {
  content: LessonCardContent;
  onPress: () => void;
  /** Тихое действие под кнопкой (content.secondary) — «Сменить набор» */
  onSecondaryPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Кольцо прогресса дня: «6/20» в центре */
const ProgressRing = memo(function ProgressRing({ done, total, color, track }: {
  done: number;
  total: number;
  color: string;
  track: string;
}) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const length = 2 * Math.PI * r;
  const part = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View style={styles.ring} accessible={false}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} stroke={track} strokeWidth={RING_STROKE} fill="none" />
        {part > 0 && (
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={r}
            stroke={color}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${length} ${length}`}
            strokeDashoffset={length * (1 - part)}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        )}
      </Svg>
      <View style={styles.ringLabel}>
        <Text variant="caption" style={[styles.bold, { color }]}>
          {done}/{total}
        </Text>
      </View>
    </View>
  );
});

export const LessonCard = memo(function LessonCard({ content, onPress, onSecondaryPress, style }: Props) {
  const colors = useThemeColors();
  const { calm, overline, title, meta, hint, action, kind, progress, secondary } = content;
  const a11yLabel = [title, meta, hint, action].filter(Boolean).join('. ');

  if (calm) {
    const Icon = kind === 'findSet' ? Trophy : Check;
    const tint = kind === 'findSet' ? colors.star : colors.success;
    const iconColor = kind === 'findSet' ? colors.warningText : colors.successText;
    return (
      <Card style={[styles.gap, style]}>
        <View style={styles.row}>
          <View style={styles.texts}>
            <Text variant="overline" color="secondary">{overline}</Text>
            <Text variant="h3">{title}</Text>
            {meta ? <Text variant="body" style={styles.semibold}>{meta}</Text> : null}
            {hint ? <Text variant="bodySmall" color="secondary">{hint}</Text> : null}
          </View>
          <View style={[styles.badge, { backgroundColor: alpha(tint, 10) }]}>
            <Icon size={iconSize.m} color={iconColor} />
          </View>
        </View>
        <Button variant="secondary" title={action} fullWidth onPress={onPress} />
      </Card>
    );
  }

  const on = colors.onPrimary;
  return (
    <View style={[styles.card, styles.gapS, { backgroundColor: colors.primaryFill }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.gap, pressed && styles.pressed]}
      >
        <View style={styles.row}>
          <View style={styles.texts}>
            <Text variant="overline" style={[styles.muted, { color: on }]}>{overline}</Text>
            <Text variant="h3" style={{ color: on }}>{title}</Text>
            {meta ? <Text variant="body" style={[styles.semibold, { color: on }]}>{meta}</Text> : null}
            {hint ? <Text variant="bodySmall" style={[styles.muted, { color: on }]}>{hint}</Text> : null}
          </View>
          {progress ? <ProgressRing done={progress.done} total={progress.total} color={on} track={alpha(on, 20)} /> : null}
        </View>
        {/* Вид кнопки; нажимается вся верхняя часть карточки */}
        <View style={[styles.action, { backgroundColor: on }]}>
          <Text variant="button" style={[styles.noLetterSpacing, { color: colors.primaryFill }]}>{action}</Text>
        </View>
      </Pressable>
      {secondary && onSecondaryPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondary}
          onPress={onSecondaryPress}
          hitSlop={spacing.s}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text variant="label" align="center" style={{ color: on }}>{secondary}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  gap: {
    gap: spacing.m,
  },
  gapS: {
    gap: spacing.s,
  },
  secondary: {
    alignSelf: 'center',
    paddingHorizontal: spacing.s,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
  },
  texts: {
    flex: 1,
    gap: spacing.xxs,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    height: heights.button,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Второстепенный текст на цветной заливке
  muted: {
    opacity: 0.85,
  },
  semibold: {
    fontWeight: '600',
  },
  bold: {
    fontWeight: '700',
  },
  noLetterSpacing: {
    letterSpacing: 0,
  },
  pressed: {
    opacity: 0.85,
  },
});
