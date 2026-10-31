/**
 * WhatsNewSheet — окно «Что нового» (plan/new/whats_new.md, News 2.1)
 * @description На iOS — нативная шторка на Swift (nativeWhatsNewSheet.ts, News 2). На Android, вебе
 * и в сборках без нативного модуля — общий нижний лист `Sheet` со страницами, которые листаются
 * свайпом. Страницы те же (toSheetPages), события те же: onPage, onClose({ index, tryItem }).
 * Кнопка «Назад» на Android закрывает окно (onRequestClose у Modal внутри Sheet).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Sheet } from '@/components/ui';
import { alpha, borderRadius, screenPadding, spacing } from '@/constants';
import { toSheetPages, type WhatsNewSheetPage } from '@/services/whatsNew';
import { hasArtImage, WhatsNewArt } from './WhatsNewArt';
import { isNativeWhatsNewSheet, useNativeWhatsNewSheet, type WhatsNewSheetProps } from './nativeWhatsNewSheet';

export function WhatsNewSheet(props: WhatsNewSheetProps) {
  useNativeWhatsNewSheet(props);
  if (isNativeWhatsNewSheet) return null;
  return <WhatsNewSheetRN {...props} />;
}

/** Ширина листа ограничена в Sheet (maxWidth 640) — на вебе страницы не растягиваются */
const SHEET_MAX_WIDTH = 640;

function WhatsNewSheetRN({ visible, version, pages, onPage, onClose }: WhatsNewSheetProps) {
  const colors = useThemeColors();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sheetPages = useMemo(() => toSheetPages(pages), [pages]);
  const [index, setIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(Math.min(windowWidth, SHEET_MAX_WIDTH));
  const list = useRef<FlatList<WhatsNewSheetPage>>(null);
  const indexRef = useRef(0);
  // Высота страниц одинаковая, длинный текст прокручивается внутри страницы
  const pageHeight = Math.min(windowHeight * 0.6, 520);
  const isLast = index >= sheetPages.length - 1;

  useEffect(() => {
    if (!visible) return;
    indexRef.current = 0;
    setIndex(0);
    onPage?.(0);
  }, [visible]);

  const changeIndex = useCallback(
    (next: number) => {
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
      onPage?.(next);
    },
    [onPage],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      changeIndex(Math.max(0, Math.min(sheetPages.length - 1, next)));
    },
    [pageWidth, sheetPages.length, changeIndex],
  );

  const goTo = useCallback(
    (next: number) => {
      list.current?.scrollToOffset({ offset: next * pageWidth, animated: true });
      changeIndex(next);
    },
    [pageWidth, changeIndex],
  );

  const close = useCallback(() => onClose({ index: indexRef.current }), [onClose]);

  const handleNext = useCallback(() => {
    if (isLast) close();
    else goTo(index + 1);
  }, [isLast, close, goTo, index]);

  const handleTry = useCallback(
    (pageIndex: number) => {
      const page = pages[pageIndex];
      onClose({ index: pageIndex, tryItem: page?.kind === 'item' ? page.item : undefined });
    },
    [pages, onClose],
  );

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setPageWidth(w);
  }, []);

  return (
    <Sheet
      visible={visible}
      onClose={close}
      scroll={false}
      footer={
        <View style={styles.footer}>
          {sheetPages.length > 1 && (
            <View
              style={styles.dots}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`Страница ${index + 1} из ${sheetPages.length}`}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'increment' && !isLast) goTo(index + 1);
                if (e.nativeEvent.actionName === 'decrement' && index > 0) goTo(index - 1);
              }}
            >
              {sheetPages.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === index ? styles.dotActive : null,
                    { backgroundColor: i === index ? colors.primary : colors.border },
                  ]}
                />
              ))}
            </View>
          )}
          <Button title={isLast ? 'Понятно' : 'Дальше'} onPress={handleNext} fullWidth />
        </View>
      }
    >
      <View style={styles.header}>
        <Text variant="overline" accessibilityRole="header" style={{ color: colors.textSecondary }}>
          {version ? `ЧТО НОВОГО · ${version}` : 'ЧТО НОВОГО'}
        </Text>
        <Button variant="icon" icon={X} accessibilityLabel="Закрыть" onPress={close} />
      </View>
      {/* Страницы — от края до края листа, чтобы свайп шёл по всей ширине */}
      <View onLayout={handleLayout} style={styles.pages}>
        <FlatList
          ref={list}
          data={sheetPages}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
          style={{ height: pageHeight }}
          renderItem={({ item, index: i }) => (
            <PageView page={item} width={pageWidth} height={pageHeight} onTry={() => handleTry(i)} />
          )}
        />
      </View>
    </Sheet>
  );
}

function PageView({
  page,
  width,
  height,
  onTry,
}: {
  page: WhatsNewSheetPage;
  width: number;
  height: number;
  onTry: () => void;
}) {
  const colors = useThemeColors();
  return (
    <ScrollView style={{ width, height }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      {page.items.length > 0 ? (
        <View style={styles.summary}>
          {page.items.map((title, i) => (
            <View key={i} style={[styles.summaryRow, { backgroundColor: colors.surfaceVariant }]}>
              <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
              <Text variant="body" style={[styles.flex1, { color: colors.textPrimary }]}>{title}</Text>
            </View>
          ))}
        </View>
      ) : hasArtImage(page.art) ? (
        <WhatsNewArt art={page.art} />
      ) : null}

      <View style={styles.texts}>
        {!!page.tag && (
          <Text variant="caption" style={[styles.tag, { color: colors.primary, backgroundColor: alpha(colors.primary, 20) }]}>
            {page.tag}
          </Text>
        )}
        <Text variant="h2" accessibilityRole="header" style={{ color: colors.textPrimary }}>{page.title}</Text>
        {!!page.text && <Text variant="body" style={{ color: colors.textSecondary }}>{page.text}</Text>}
      </View>

      {!!page.actionLabel && (
        <Button variant="quiet" title={`${page.actionLabel} →`} onPress={onTry} style={styles.try} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pages: {
    marginHorizontal: -screenPadding,
  },
  page: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    paddingBottom: spacing.m,
    gap: spacing.m,
  },
  texts: {
    gap: spacing.xs,
  },
  tag: {
    alignSelf: 'flex-start',
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  try: {
    alignSelf: 'flex-start',
  },
  summary: {
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.s,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  flex1: {
    flex: 1,
  },
  footer: {
    gap: spacing.m,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  dotActive: {
    width: 22,
  },
});
