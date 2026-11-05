/**
 * Стили списка учеников курса
 * (Clean 8 — перенесено из TeacherStudentsScreen.tsx без изменений.)
 */
import { StyleSheet, Platform } from 'react-native';
import { spacing, borderRadius } from '@/constants';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flex: 1,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Search + Filters
  searchSection: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
    gap: spacing.m,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    gap: spacing.s,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    padding: 0,
    margin: 0,
  },
  pillsRow: {
    gap: spacing.s,
    paddingBottom: 4,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // List row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.m,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: borderRadius.s,
    borderWidth: 2,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  streakBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.s,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.s,
  },
  cardsBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.s,
  },

  // Empty
  empty: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  remindBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
  },
  remindText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  remindBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    justifyContent: 'center',
  },
  remindBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Invite modal
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  inviteCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.l,
    padding: spacing.l,
    gap: spacing.s,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  inviteDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  inviteCodeBox: {
    borderRadius: borderRadius.m,
    paddingVertical: spacing.l,
    alignItems: 'center',
    marginTop: spacing.s,
  },
  inviteCodeText: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 6,
  },
  inviteActionBtn: {
    marginTop: spacing.s,
    paddingVertical: 12,
    borderRadius: borderRadius.m,
    alignItems: 'center',
  },
  inviteActionBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  inviteRegenerateText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
