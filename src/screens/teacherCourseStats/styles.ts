/**
 * Стили статистики курса (учитель)
 * (Clean 8 — перенесено из TeacherCourseStatsScreen.tsx без изменений.)
 */
import { StyleSheet, Platform } from 'react-native';
import { spacing, borderRadius } from '@/constants';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
    ...(Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any),
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginLeft: spacing.m,
    flex: 1,
  },
  scroll: {
    padding: spacing.m,
    gap: spacing.xl,
  },

  // Test Lobby
  actionList: {
    gap: spacing.s,
  },
  testLobbyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    gap: 12,
  },
  testLobbyIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testLobbyText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    flex: 1,
  },

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    minHeight: 100,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },

  // Section
  section: {
    gap: spacing.m,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  viewAll: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Toggle
  togglePill: {
    flexDirection: 'row',
    borderRadius: borderRadius.m,
    padding: 4,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: spacing.m,
    paddingVertical: 4,
    borderRadius: borderRadius.s,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chart
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.s,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    height: '100%',
  },
  bar: {
    width: 18,
    borderRadius: borderRadius.full,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartTooltip: {
    position: 'absolute',
    bottom: 22,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 5,
  },
  chartTooltipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartTooltipArrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // Students
  studentsRow: {
    gap: spacing.l,
    paddingVertical: spacing.xs,
  },
  studentItem: {
    alignItems: 'center',
    gap: 6,
    minWidth: 56,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: borderRadius.s,
    borderWidth: 2,
  },
  studentName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 56,
  },
  studentLastActive: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },
  emptyMembers: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Sets
  setsList: {
    gap: spacing.m,
  },
  setCard: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
    borderWidth: 1,
    gap: spacing.s,
  },
  setCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  setCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.s,
  },
  setCardWords: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBg: {
    height: 4,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  unitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  unitTagText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  setCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  setCardMetaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  setCardAccuracy: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: borderRadius.l,
    padding: spacing.l,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  modalList: {
    flexGrow: 0,
  },
  modalStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  modalAvatarWrap: {
    position: 'relative',
  },
  modalStudentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalStreakBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.s,
  },
  modalStreakText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    paddingHorizontal: spacing.l,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  sheetOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sheetOptionDesc: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
});
