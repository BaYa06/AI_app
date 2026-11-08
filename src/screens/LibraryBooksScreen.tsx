/**
 * Все учебники (plan/new/library_catalog.md, Catalog 9) — полка с экрана «Библиотека» целиком.
 *
 * Один ряд фильтра — язык книги (только языки, у которых есть книги; одна — ряда нет).
 * Учебники живут в своих таблицах (books → юниты → официальные наборы), библиотека только показывает.
 * Список — api/books.js?action=list-books (ученику — только книги, открытые ученикам).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookOpen, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/common';
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Screen,
  ScreenHeader,
  SkeletonCard,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { getLanguageLabel } from '@/constants/languages';
import { BookService } from '@/services/BookService';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import { pluralize } from '@/utils';
import type { BookListItem } from '@/types/books';
import type { RootStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ALL = 'all';

export function LibraryBooksScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useThemeColors();
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [lang, setLang] = useState<string>(ALL);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const list = await BookService.listBooks();
    // listBooks при ошибке сети отдаёт [] — отличить сбой от пустого каталога нельзя,
    // поэтому пустой список показываем как «Учебников пока нет».
    setBooks(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => setFailed(true));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const langs = useMemo(
    () => [...new Set((books ?? []).map((b) => b.languageFrom).filter(Boolean))],
    [books]
  );
  const visible = useMemo(
    () => (books ?? []).filter((b) => lang === ALL || b.languageFrom === lang),
    [books, lang]
  );

  const header = <ScreenHeader title="Учебники" onBack={() => navigation.goBack()} bordered />;

  let body: React.ReactNode;
  if (failed && !books) {
    body = (
      <ErrorState
        title="Не удалось загрузить учебники"
        description="Проверьте интернет и попробуйте ещё раз."
        onRetry={onRefresh}
      />
    );
  } else if (!books) {
    body = (
      <View style={s.list} accessibilityLabel="Загрузка" accessibilityRole="progressbar">
        <SkeletonCard height={84} />
        <SkeletonCard height={84} />
        <SkeletonCard height={84} />
      </View>
    );
  } else if (books.length === 0) {
    body = (
      <EmptyState
        icon={BookOpen}
        title="Учебников пока нет"
        description="Скоро здесь появятся учебники с готовыми наборами по юнитам."
      />
    );
  } else {
    body = (
      <View style={s.body}>
        {langs.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.chipsBleed}
            contentContainerStyle={s.chips}
          >
            <Chip label="Все" selected={lang === ALL} onPress={() => setLang(ALL)} />
            {langs.map((code) => (
              <Chip
                key={code}
                label={getLanguageLabel(code)}
                selected={lang === code}
                onPress={() => setLang(code)}
              />
            ))}
          </ScrollView>
        )}
        <View style={s.list}>
          {visible.map((b) => {
            const cover = getBookCover(b.subject);
            const meta = [
              formatBookMeta(b),
              `${b.unitsCount} ${pluralize(b.unitsCount, 'юнит', 'юнита', 'юнитов')}`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Card
                key={b.id}
                padding="s"
                onPress={() => navigation.navigate('BookDetail', { bookId: b.id })}
                accessibilityLabel={`Учебник ${b.title}. ${meta}`}
              >
                <View style={s.row}>
                  <View style={[s.cover, { backgroundColor: alpha(cover.color, 10) }]}>
                    <cover.icon size={iconSize.m} color={cover.color} />
                  </View>
                  <View style={s.rowBody}>
                    <Text
                      variant="body"
                      style={[s.semibold, { color: colors.textPrimary }]}
                      numberOfLines={2}
                    >
                      {b.title}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {meta}
                    </Text>
                  </View>
                  <ChevronRight size={iconSize.s} color={colors.textTertiary} />
                </View>
              </Card>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <Screen
      header={header}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentStyle={s.content}
    >
      {body}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingTop: spacing.s, paddingBottom: spacing.l },
  body: { gap: spacing.m },
  chipsBleed: { marginHorizontal: -spacing.m, flexGrow: 0 },
  chips: { paddingHorizontal: spacing.m, gap: spacing.xs },
  list: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  rowBody: { flex: 1, gap: 2 },
  semibold: { fontWeight: '600' },
  cover: {
    width: 48,
    height: 60,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
