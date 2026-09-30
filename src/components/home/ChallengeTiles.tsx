/**
 * ChallengeTiles — мини-игры «Разминка» (plan/home_redesign.md, шаг 3.1)
 * @description Второй уровень главной: три равные плитки в ряд (все видны сразу, без карусели).
 * Фон нейтральный, цвет игры — только в иконке: единственное цветное пятно главной — урок дня.
 * Статусы: «Играть» → «Выполнено, забрать» (пульсирует; алмаз летит в шапку) → «Получено, снова через N ч».
 */
import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Check, Gem } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import type { ChallengeId, ChallengeStatus } from '@/store';
import { Text } from '@/components/common/Text';
import type { IconComponent } from '@/components/ui';
import { alpha, borderRadius, heights, iconSize, screenPadding, spacing, typography } from '@/constants';

export interface ChallengeTile {
  id: ChallengeId;
  title: string;
  /** «2 минуты», «5 подряд», «7+ дней» */
  badge: string;
  icon: IconComponent;
  /** Цвет игры (gameViolet / gameRose / gameTeal) — только для иконки */
  accent: string;
  onPlay: () => void;
}

interface Props {
  tiles: ChallengeTile[];
  statuses: Record<ChallengeId, ChallengeStatus>;
  hoursUntilTomorrow: number;
  onClaim: (id: ChallengeId) => void;
  /** Кнопка «Забрать» — главная измеряет её, чтобы алмаз летел из неё в шапку */
  claimRef: (id: ChallengeId, el: View | null) => void;
}

const REWARD = 10;
const ICON_BOX = 36;

/** «Забрать» на выполненной мини-игре — мягко пульсирует, пока награду не забрали */
function ClaimButton({ onPress, buttonRef }: { onPress: () => void; buttonRef: (el: View | null) => void }) {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Pressable
        ref={buttonRef}
        hitSlop={{ top: spacing.xxs, bottom: spacing.xxs }}
        style={[styles.claim, { backgroundColor: colors.gameGreen }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Забрать ${REWARD} алмазов`}
      >
        <Text variant="caption" style={[styles.bold, { color: colors.onPrimary }]}>Забрать</Text>
        <Gem size={iconSize.xs} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

export const ChallengeTiles = memo(function ChallengeTiles({ tiles, statuses, hoursUntilTomorrow, onClaim, claimRef }: Props) {
  const colors = useThemeColors();

  return (
    <View style={styles.section}>
      <Text variant="overline" color="secondary" style={styles.label}>Разминка</Text>
      <View style={styles.row}>
        {tiles.map(({ id, title, badge, icon: Icon, accent, onPlay }) => {
          const status = statuses[id];

          if (status === 'completed') {
            return (
              <View
                key={id}
                style={[styles.tile, { backgroundColor: alpha(colors.success, 10), borderColor: alpha(colors.success, 40) }]}
              >
                <View style={[styles.iconBox, { backgroundColor: alpha(colors.success, 20) }]}>
                  <Check size={iconSize.s} color={colors.successText} />
                </View>
                <Text variant="label" numberOfLines={2} style={styles.title}>{title}</Text>
                <Text variant="caption" style={{ color: colors.successText }}>Выполнено</Text>
                <View style={styles.bottom}>
                  <ClaimButton buttonRef={(el) => claimRef(id, el)} onPress={() => onClaim(id)} />
                </View>
              </View>
            );
          }

          if (status === 'claimed') {
            return (
              <View
                key={id}
                accessible
                accessibilityLabel={`${title}: награда получена, снова через ${hoursUntilTomorrow} ч`}
                style={[styles.tile, { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted }]}
              >
                <View style={[styles.iconBox, { backgroundColor: alpha(colors.success, 10) }]}>
                  <Check size={iconSize.s} color={colors.successText} />
                </View>
                <Text variant="label" numberOfLines={2} style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
                <View style={styles.bottom}>
                  <Text variant="caption" color="tertiary">Снова через {hoursUntilTomorrow} ч</Text>
                </View>
              </View>
            );
          }

          return (
            <Pressable
              key={id}
              onPress={onPlay}
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${badge}. Награда ${REWARD} алмазов`}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconBox, { backgroundColor: alpha(accent, 10) }]}>
                <Icon size={iconSize.s} color={accent} />
              </View>
              <Text variant="label" numberOfLines={2} style={styles.title}>{title}</Text>
              <Text variant="caption" color="secondary">{badge}</Text>
              <View style={[styles.bottom, styles.reward]}>
                <Gem size={iconSize.xs} color={colors.diamond} />
                <Text variant="caption" style={styles.bold}>+{REWARD}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: screenPadding,
    gap: spacing.xs,
  },
  label: {
    marginLeft: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.s,
    gap: spacing.xxs,
  },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  title: {
    // Две строки label: у всех плиток название одной высоты, строки под ним на одной линии
    minHeight: (typography.label.lineHeight ?? 20) * 2,
  },
  // Прижимает последнюю строку книзу — у плиток с разным текстом «+10» и кнопки на одной линии
  bottom: {
    marginTop: 'auto',
    paddingTop: spacing.xxs,
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  claim: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    minHeight: heights.buttonSmall,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.xxs,
  },
  bold: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
