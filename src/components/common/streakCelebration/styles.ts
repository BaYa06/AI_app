/**
 * Стили празднования серии
 * (Clean 8 — перенесено из StreakCelebration.tsx без изменений.)
 */
import { StyleSheet } from 'react-native';
import { borderRadius, screenPadding, spacing } from '@/constants';
import { BOLT, DAY_SIZE, FLAME, K } from './anim';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  abs: {
    position: 'absolute',
  },
  ambient: {
    position: 'absolute',
    left: '50%',
  },
  content: {
    flex: 1,
    paddingHorizontal: screenPadding,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flame: {
    width: FLAME,
    height: FLAME,
    zIndex: 2,
  },
  flameGlow: {
    position: 'absolute',
    left: (FLAME - 168 * K) / 2,
    top: 104 * K - 84 * K,
  },
  burst: {
    position: 'absolute',
    borderRadius: borderRadius.full,
  },
  bolt: {
    position: 'absolute',
    left: BOLT.left,
    top: BOLT.top,
  },
  shock: {
    position: 'absolute',
    left: FLAME / 2 - 75,
    top: FLAME / 2 - 75 + 10,
    width: 150,
    height: 150,
    borderRadius: borderRadius.full,
    borderWidth: 3,
  },
  spark: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  idleSpark: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    marginTop: spacing.xs,
  },
  digits: {
    flexDirection: 'row',
  },
  dayBadge: {
    minWidth: 72,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.l,
    alignSelf: 'stretch',
  },
  dayCol: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  dayCell: {
    width: DAY_SIZE,
    height: DAY_SIZE,
  },
  dayFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.full,
  },
  dayRing: {
    borderWidth: 2,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 16,
    height: 16,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.xs,
    maxWidth: 320,
  },
});
