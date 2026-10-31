/**
 * Иллюстрации окна «Что нового» для Android и веба (plan/new/whats_new.md, News 2.1)
 * @description Повторяют SwiftUI-иллюстрации из ios/FlashcardsApp/WhatsNewSheet.swift, но без
 * анимации. Только токены темы.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Copy } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import type { WhatsNewArt as ArtName } from '@/types/whatsNew';

export const WHATS_NEW_ART_HEIGHT = 228;

/** Пример набора на картинке — содержимое карточек, а не надпись интерфейса (как в WhatsNewSheet.swift) */
const SAMPLE_SET_TITLE = 'Irregular verbs';

export function WhatsNewArt({ art }: { art: ArtName }) {
  const colors = useThemeColors();
  return (
    <View
      style={[styles.box, { backgroundColor: colors.surfaceVariant }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {art === 'swipe' && <SwipeArt />}
      {art === 'share' && <ShareArt />}
      {art === 'books' && <BooksArt />}
      {art === 'glass' && <GlassArt />}
      {art === 'xp' && <XpArt />}
    </View>
  );
}

/** Есть ли у иллюстрации картинка (у 'more' — нет, это страница «И ещё») */
export function hasArtImage(art: ArtName | null): art is ArtName {
  return art !== null && art !== 'more';
}

function SwipeArt() {
  const colors = useThemeColors();
  return (
    <>
      <View style={styles.sideRow}>
        <Text variant="caption" style={[styles.side, { color: colors.errorText, backgroundColor: alpha(colors.error, 10) }]}>
          ← Не знаю
        </Text>
        <Text variant="caption" style={[styles.side, { color: colors.successText, backgroundColor: alpha(colors.success, 10) }]}>
          Уверенно →
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text variant="h3" style={{ color: colors.textPrimary }}>serendipity</Text>
        <Text variant="caption" style={{ color: colors.textTertiary }}>свайпни</Text>
      </View>
      <View style={styles.rateRow}>
        {[
          ['Не знаю', colors.errorText],
          ['Почти', colors.warningText],
          ['Уверенно', colors.successText],
        ].map(([label, color]) => (
          <Text key={label} variant="caption" style={[styles.rate, { color, backgroundColor: colors.surface }]}>
            {label}
          </Text>
        ))}
      </View>
    </>
  );
}

function ShareArt() {
  const colors = useThemeColors();
  return (
    <View style={styles.share}>
      <View style={[styles.setRow, { backgroundColor: colors.surface }]}>
        <View style={[styles.setIcon, { backgroundColor: colors.gameTeal }]} />
        <View>
          <Text variant="label" style={{ color: colors.textPrimary }}>{SAMPLE_SET_TITLE}</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>48 карточек</Text>
        </View>
      </View>
      <View style={[styles.link, { backgroundColor: colors.primaryFill }]}>
        <Text variant="label" style={{ color: colors.onPrimary }}>…/s/K7Q2MX</Text>
        <Copy size={iconSize.xs} color={colors.onPrimary} />
      </View>
      <Text variant="bodySmall" style={[styles.bubble, { color: colors.textPrimary, backgroundColor: colors.surface }]}>
        Держи, тут все глаголы к тесту
      </Text>
    </View>
  );
}

function BooksArt() {
  const colors = useThemeColors();
  const books: [string, string, number][] = [
    ['Academic words', colors.gameViolet, 150],
    ['Inside Reading', colors.gameTeal, 128],
    ['Navigate A2 · B1', colors.gameRose, 160],
    ['Solutions Pre-Int.', colors.gameGreen, 138],
  ];
  return (
    <View style={styles.books}>
      {books.map(([title, color, height]) => (
        <View key={title} style={[styles.book, { backgroundColor: color, height }]}>
          <View style={[styles.spine, { backgroundColor: alpha(colors.textPrimary, 20) }]} />
          <Text variant="caption" style={[styles.bookTitle, { color: colors.onPrimary }]}>{title}</Text>
        </View>
      ))}
    </View>
  );
}

function GlassArt() {
  const colors = useThemeColors();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }]}>
      <View style={[styles.glow, { backgroundColor: colors.streak }]} />
      <View style={[styles.capsule, { backgroundColor: alpha(colors.onPrimary, 20), borderColor: alpha(colors.onPrimary, 40) }]}>
        <Text variant="caption" style={[styles.capsuleActive, { color: colors.onPrimary, backgroundColor: alpha(colors.onPrimary, 40) }]}>
          Главная
        </Text>
        <Text variant="caption" style={{ color: colors.onPrimary }}>Наборы</Text>
        <Text variant="caption" style={{ color: colors.onPrimary }}>Профиль</Text>
      </View>
    </View>
  );
}

function XpArt() {
  const colors = useThemeColors();
  return (
    <View style={[styles.xp, { backgroundColor: colors.surface }]}>
      <View style={styles.xpHead}>
        <Text variant="label" style={{ color: colors.textPrimary }}>Уровень 7</Text>
        <Text variant="bodySmall" style={{ color: colors.textSecondary, fontVariant: ['tabular-nums'] }}>1 240 / 2 000</Text>
      </View>
      <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.barFill, { backgroundColor: colors.primary }]} />
      </View>
      <View style={styles.xpNote}>
        <Check size={iconSize.xs} color={colors.successText} />
        <Text variant="caption" style={{ color: colors.successText }}>Опыт только за честные ответы</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: WHATS_NEW_ART_HEIGHT,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideRow: {
    position: 'absolute',
    left: spacing.s,
    right: spacing.s,
    top: 80,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  side: {
    fontWeight: '600',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.s,
    overflow: 'hidden',
  },
  card: {
    width: 150,
    height: 150,
    marginTop: -36,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  rateRow: {
    position: 'absolute',
    left: spacing.s,
    right: spacing.s,
    bottom: spacing.s,
    flexDirection: 'row',
    gap: 6,
  },
  rate: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    paddingVertical: 7,
    borderRadius: borderRadius.s,
    overflow: 'hidden',
  },
  share: {
    width: 236,
    gap: 10,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.s,
    borderRadius: borderRadius.l,
  },
  setIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.s,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
  },
  bubble: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  books: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  book: {
    width: 62,
    borderRadius: borderRadius.s,
    padding: 6,
    paddingLeft: 10,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  bookTitle: {
    fontWeight: '600',
  },
  glow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: borderRadius.full,
    top: -30,
    left: -20,
    opacity: 0.8,
  },
  capsule: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    bottom: 22,
    height: 56,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  capsuleActive: {
    fontWeight: '600',
    paddingHorizontal: spacing.s,
    paddingVertical: 6,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  xp: {
    width: 236,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    gap: 10,
  },
  xpHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bar: {
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    width: '62%',
    height: '100%',
    borderRadius: borderRadius.full,
  },
  xpNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
});
