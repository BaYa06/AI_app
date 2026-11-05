/**
 * Стили экрана «Карточки»
 * (Clean 8 — перенесено из StudyScreen.tsx без изменений.)
 */
import { StyleSheet } from 'react-native';
import { spacing, borderRadius, heights, screenPadding } from '@/constants';
import { CARD_WIDTH, CARD_HEIGHT } from './layout';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  semibold: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },

  // Main content
  // Боковой отступ даёт StageLayout
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Card
  cardWrapper: {
    width: CARD_WIDTH,
    height: Math.min(CARD_HEIGHT, 420),
    position: 'relative',
  },
  cardAnim: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  cardInner: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.l,
    // Без overflow:'hidden': фон и рамка сами скругляются через borderRadius,
    // а маска слоя (masksToBounds) в связке с 3D-трансформом на iOS
    // рендерится offscreen и может срезать верх глифов.
  },
  // Подпись свайпа поверх карточки: рамка и лёгкая заливка цветом оценки, плашка сверху
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    alignItems: 'center',
    paddingTop: spacing.l,
  },
  swipeLabel: {
    borderWidth: 2,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xxs,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPlaceholder: {
    width: 40,
    height: 32,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },

  audioButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.m,
  },
  cardWord: {
    textAlign: 'center',
    // Высота строки ×1.5 и отступ сверху: запас под умлауты и диакритику
    // над заглавными (Ä, Ö, Ü, É), иначе iOS срезает их по рамке Text
    lineHeight: 36,
    paddingTop: spacing.xxs,
  },
  divider: {
    width: 48,
    height: 2,
    borderRadius: borderRadius.full,
  },
  cardBottom: {
    paddingTop: spacing.l,
  },

  // Bottom panel
  rateHint: {
    marginBottom: spacing.s,
  },
  ratingGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: 448,
    alignSelf: 'center',
    width: '100%',
  },
  ratingButton: {
    flex: 1,
    height: heights.button,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxs,
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTint: {
    flex: 1,
  },
  // Без тени — панель отделяет затемнение
  settingsSheet: {
    position: 'absolute',
    left: screenPadding,
    right: screenPadding,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  settingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTexts: {
    flex: 1,
  },
});
