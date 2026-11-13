/** Стили главной (Clean 8a — вынесено из HomeScreen). */
import { StyleSheet } from 'react-native';
import { borderRadius, heights, screenPadding, spacing, typography } from '@/constants';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
  },
  flex1: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  semibold: {
    fontWeight: '600',
  },
  bold: {
    fontWeight: '700',
  },
  // Второстепенный текст на цветной заливке
  onFillMuted: {
    opacity: 0.85,
  },
  pressed: {
    opacity: 0.85,
  },

  // Header
  header: {
    height: heights.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: heights.touch,
    paddingHorizontal: spacing.xs,
  },
  headerStatText: {
    ...typography.button,
    fontWeight: '700',
    letterSpacing: 0,
  },
  // Ширина как у кнопки меню слева — серия и алмазы по центру, даже когда справа пусто
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  headerRight: {
    minWidth: heights.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xxs,
  },

  // Search
  body: {
    flex: 1,
  },

  // Content
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },

  // Challenges Section
  challengesSection: {
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },
  // Точка «есть новости» на значке рейтинга в шапке — у верхнего правого края иконки
  ratingDot: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  // Урок дня: 16 сверху (как баннер учителя), до мини-игр — 24 вместе с их отступом сверху
  pushNudge: {
    marginHorizontal: screenPadding,
    marginBottom: spacing.xs,
  },
  skeletonTiles: {
    paddingHorizontal: screenPadding,
    gap: spacing.xs,
  },
  skeletonTilesRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  lessonCard: {
    marginHorizontal: screenPadding,
    marginTop: spacing.m,
    marginBottom: spacing.xs,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: 1,
  },

  // Teacher Mode Banner
  teacherBannerWrap: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },
  teacherBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  teacherBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flexShrink: 1,
  },
  teacherBannerIcon: {
    padding: spacing.xs,
    borderRadius: borderRadius.m,
  },
  teacherBannerButton: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: screenPadding,
    marginTop: spacing.l,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: screenPadding,
    marginTop: spacing.s,
  },
  noResults: {
    paddingVertical: spacing.l,
  },
  newSetRow: {
    minHeight: heights.listRow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.l,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: heights.listRow,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },

  // Empty State
  tipCard: {
    flexDirection: 'row',
    gap: spacing.s,
    marginHorizontal: screenPadding,
    alignItems: 'flex-start',
  },
  tipTitle: {
    marginBottom: spacing.xxs,
  },

  // Sets List
  setsList: {
    flex: 1,
    padding: screenPadding,
    gap: spacing.s,
  },

  // Card Header
  setCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.s,
  },
  setTitle: {
    fontWeight: '600',
    flexShrink: 1,
  },
  setBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  setProgress: {
    marginTop: spacing.s,
  },
  setHomeworkDue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.s,
    paddingTop: spacing.s,
    borderTopWidth: 1,
  },
  setStatusCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    marginTop: spacing.xs,
  },
  setStatusCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  setStatusDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },

  // Sheets
  sheetRow: {
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },

  // Dialogs
  dialogButtons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  dialogNote: {
    marginTop: spacing.s,
  },
  deleteConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.m,
    minHeight: 44,
  },
  deleteConfirmBox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.s,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteDescription: {
    marginBottom: spacing.m,
  },
  inviteSpinner: {
    marginVertical: spacing.m,
  },
  inviteCodeBlock: {
    marginBottom: spacing.m,
  },
  inviteCodeLabel: {
    marginBottom: spacing.xs,
  },
  inviteBox: {
    borderRadius: borderRadius.m,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  inviteCodeBox: {
    alignItems: 'center',
    marginBottom: 0,
  },
  inviteCode: {
    letterSpacing: 8,
  },
  inviteRegenerate: {
    marginTop: spacing.s,
  },

  // Streak modal
  streakCard: {
    maxWidth: 360,
  },
  streakTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.l,
  },
  streakTopIcon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  streakTopText: {
    flex: 1,
    gap: spacing.xxs,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  weekItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weekCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  goalCard: {
    padding: spacing.m,
    marginBottom: spacing.xs,
    gap: spacing.s,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
});
