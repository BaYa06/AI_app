/**
 * Стили теста с вариантами ответа
 * (Clean 8 — перенесено из MultipleChoiceScreen.tsx без изменений.)
 */
import { StyleSheet } from 'react-native';
import { spacing, borderRadius, heights, iconSize, screenPadding } from '@/constants';

export const styles = StyleSheet.create({
  semibold: {
    fontWeight: '600',
  },
  progressSection: {
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.s,
    gap: spacing.xs,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    gap: spacing.m,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xxl,
  },
  // Рамка без тени (брендбук, 7.3)
  card: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.s,
  },
  cardChip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
  },
  word: {
    textAlign: 'center',
  },
  listenRow: {
    alignItems: 'center',
    gap: spacing.s,
  },
  listenButton: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioButton: {
    marginTop: spacing.m,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionsBlock: {
    gap: spacing.s,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
  optionBadge: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionText: {
    flex: 1,
    fontWeight: '600',
  },
  optionMarkPlaceholder: {
    width: iconSize.s,
  },
  timerText: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  // Challenge result
  challengeResultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  challengeResultIcon: {
    marginBottom: spacing.m,
  },
  challengeResultTitle: {
    marginBottom: spacing.xs,
  },
  challengeResultSubtitle: {
    marginBottom: spacing.xl,
  },
  challengeResultButtons: {
    width: '100%',
    gap: spacing.s,
  },
});
