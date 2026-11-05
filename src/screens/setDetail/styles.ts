/**
 * Стили экрана набора
 * (Clean 8 — перенесено из SetDetailScreen.tsx без изменений.)
 */
import { StyleSheet, Platform, Dimensions } from 'react-native';
import { spacing, borderRadius } from '@/constants';

const EXPORT_BUTTON_HEIGHT = 42;

export const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.s,
    borderBottomWidth: 1,
  },
  topIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
  },
  warmupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    minHeight: 44,
  },
  warmupTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  warmupAction: {
    fontSize: 14,
    fontWeight: '700',
  },
  officialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: spacing.s,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    maxWidth: '100%',
  },
  officialBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  progressBlock: {
    marginTop: spacing.m,
    marginBottom: spacing.s,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.m,
  },
  filterPill: {
    flex: 1,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.m,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  sortButton: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.l,
    marginBottom: spacing.s,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  columns: {
    paddingHorizontal: spacing.m,
    gap: spacing.s,
  },
  cardItem: {
    flex: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    marginBottom: spacing.s,
    borderWidth: 1,
    minHeight: 140,
    position: 'relative',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  iconButton: {
    padding: spacing.xs,
  },
  cardFront: {
    marginBottom: spacing.xs,
  },
  cardBack: {
    marginBottom: spacing.m,
  },
  menuButton: {
    position: 'absolute',
    right: spacing.s,
    bottom: spacing.s,
    padding: spacing.xs,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.m,
    paddingBottom: spacing.m + 10,
    flexDirection: 'row',
    gap: spacing.m,
    borderTopWidth: 1,
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    paddingHorizontal: spacing.s,
  },
  primaryAction: {
    flex: 1.2,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    paddingHorizontal: spacing.s,
  },
  sheetWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.s,
  },
  sheetAction: {
    paddingVertical: spacing.m,
    alignItems: 'center',
  },
  wordChip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  startBlock: {
    marginTop: spacing.s,
  },
  startButton: {
    borderRadius: borderRadius.l,
    paddingVertical: spacing.m,
    alignItems: 'center',
  },
  addSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.m,
  },
  addSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  addField: {
    gap: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs / 2,
  },
  addInput: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s + 2,
    fontSize: 16,
  },
  exportButton: {
    height: EXPORT_BUTTON_HEIGHT,
    minWidth: 132,
    paddingHorizontal: spacing.m,
    borderRadius: Math.round(EXPORT_BUTTON_HEIGHT * 0.2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addActions: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.s,
  },
  importOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.m,
    zIndex: 45,
  },
  importCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.m,
  },
  importTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  importTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
  },
  importButton: {
    height: 56,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },

  // Card Preview Modal
  previewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  previewCard: {
    width: Math.min(340, Dimensions.get('window').width - 48),
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    // Без тени: карточку отделяет затемнение (брендбук, 10)
    ...(Platform.select({
      web: {
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
      },
    }) as any),
  },
  previewFrontSection: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  previewFrontText: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  previewDivider: {
    height: 1,
    marginHorizontal: 24,
  },
  previewBackSection: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    gap: 12,
  },
  previewBackText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewExample: {
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
