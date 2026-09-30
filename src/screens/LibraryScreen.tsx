/**
 * Library Screen
 * @description Public library with trending, top-rated, and recent sets
 */
import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text } from '@/components/common';
import { useThemeColors, useLibraryStore } from '@/store';
import { spacing, borderRadius, heights, iconSize, screenPadding, LIBRARY_CATEGORIES, LIBRARY_LANGUAGES, CARD_COUNT_RANGES, LIBRARY_SORT_OPTIONS, getCategoryLabel, getLanguageDef, formatCount, formatRelativeTime, alpha } from '@/constants';
import {
  Search,
  ArrowDownUp,
  Star,
  Layers,
  Download,
  Heart,
  CheckCircle2,
  BookOpen,
  Library,
  Flame,
  Sparkles,
} from 'lucide-react-native';
import { Badge, CategoryIcon, EmptyState, ErrorState, SkeletonCard, TextField, type IconComponent } from '@/components/ui';
import { pluralize } from '@/utils';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { supabase } from '@/services/supabaseClient';
import { BookService } from '@/services/BookService';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import type { LibrarySet } from '@/types/library';
import type { BookListItem } from '@/types/books';

// ---- Fade edge overlay for horizontal scroll ----
const FADE_WIDTH = 24;

function FadeEdge({ side, bgColor }: { side: 'left' | 'right'; bgColor: string }) {
  const isLeft = side === 'left';
  return (
    <View
      style={{
        position: 'absolute',
        [isLeft ? 'left' : 'right']: 0,
        top: 0,
        bottom: 0,
        width: FADE_WIDTH,
        zIndex: 1,
      }}
      pointerEvents="none"
    >
      <Svg width={FADE_WIDTH} height="100%">
        <Defs>
          <SvgLinearGradient id={`fade_${side}`} x1={isLeft ? '0' : '1'} y1="0" x2={isLeft ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={bgColor} stopOpacity="1" />
            <Stop offset="1" stopColor={bgColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width={FADE_WIDTH} height="100%" fill={`url(#fade_${side})`} />
      </Svg>
    </View>
  );
}

// ---- Memoized Card Components ----

/** Звезда «Рекомендуем» в углу иконки набора */
function FeaturedBadge({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View
      accessible
      accessibilityLabel="Рекомендуем"
      style={[s.verifiedBadge, { backgroundColor: colors.primaryFill, borderColor: colors.surface }]}
    >
      <Star size={10} color={colors.onPrimary} fill={colors.onPrimary} />
    </View>
  );
}

/** Заголовок раздела: иконка lucide вместо эмодзи (📚 🔍 🔥 ⭐ ✨) */
function SectionTitle({
  icon: Icon,
  title,
  color,
  colors,
}: {
  icon: IconComponent;
  title: string;
  color: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={s.sectionTitleRow}>
      <Icon size={iconSize.s} color={color} />
      <Text variant="h3" accessibilityRole="header" style={{ color: colors.textPrimary }}>{title}</Text>
    </View>
  );
}

const HorizontalCard = memo(function HorizontalCard({
  item,
  colors,
  onPress,
  fullWidth,
}: {
  item: LibrarySet;
  colors: ReturnType<typeof useThemeColors>;
  onPress?: () => void;
  fullWidth?: boolean;
}) {
  const avgRating = item.rating_count > 0
    ? Math.round((item.rating_sum / item.rating_count) * 10) / 10
    : null;
  const langDef = item.language_from && item.language_to
    ? getLanguageDef(item.language_from, item.language_to)
    : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.hCard,
        fullWidth && { width: '100%' },
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && s.pressed,
      ]}
    >
      <View style={s.hCardTop}>
        <View style={[s.hCardIcon, { backgroundColor: alpha(colors.primary, 10) }]}>
          {/* Иконка категории вместо эмодзи обложки (брендбук, раздел 6) */}
          <CategoryIcon category={item.category} size="m" />
          {item.is_featured && <FeaturedBadge colors={colors} />}
        </View>
        {avgRating !== null && (
          <View style={[s.ratingBadge, { backgroundColor: alpha(colors.star, 10) }]}>
            <Star size={iconSize.xs} color={colors.star} fill={colors.star} />
            <Text variant="caption" style={[s.bold, { color: colors.warningText }]}>{avgRating}</Text>
          </View>
        )}
      </View>

      <View style={s.hCardText}>
        <Text variant="body" style={[s.semibold, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {item.author_name || 'Автор неизвестен'}{langDef ? ` • ${langDef.flag} ${langDef.label}` : ''}
        </Text>
      </View>

      <View style={s.hCardStats}>
        <View style={s.statItem}>
          <Layers size={iconSize.xs} color={colors.textTertiary} />
          <Text variant="caption" color="secondary">
            {item.cards_count} {pluralize(item.cards_count, 'карточка', 'карточки', 'карточек')}
          </Text>
        </View>
        <View style={s.statItem}>
          <Download size={iconSize.xs} color={colors.textTertiary} />
          <Text variant="caption" color="secondary">{formatCount(item.imports_count)}</Text>
        </View>
        <View style={[s.statItem, s.statPushRight]}>
          <Heart size={iconSize.xs} color={colors.like} fill={colors.like} />
          <Text variant="caption" color="secondary">{formatCount(item.likes_count)}</Text>
        </View>
      </View>

      {item.is_imported && <Badge label="Импортировано" tone="success" icon={CheckCircle2} />}
    </Pressable>
  );
});

const RecentCard = memo(function RecentCard({
  item,
  colors,
  onPress,
}: {
  item: LibrarySet;
  colors: ReturnType<typeof useThemeColors>;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.rCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && s.pressed]}
    >
      <View style={[s.rCardIcon, { backgroundColor: alpha(colors.primary, 10) }]}>
        <CategoryIcon category={item.category} size="m" />
        {item.is_featured && <FeaturedBadge colors={colors} />}
      </View>
      <View style={s.rCardBody}>
        <Text variant="body" style={[s.semibold, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={s.rCardMetaRow}>
          {item.category && <Badge label={getCategoryLabel(item.category)} tone="primary" />}
          <Text variant="caption" color="secondary" numberOfLines={1} style={s.flexShrink}>
            {item.author_name || 'Автор неизвестен'}
          </Text>
        </View>
      </View>
      <View style={s.rCardRight}>
        <Text variant="caption" style={[s.bold, { color: colors.textSecondary }]}>
          {item.cards_count} {pluralize(item.cards_count, 'карточка', 'карточки', 'карточек')}
        </Text>
        <Text variant="caption" style={{ color: colors.textTertiary }}>{formatRelativeTime(item.published_at)}</Text>
        {item.is_imported && (
          <CheckCircle2 size={iconSize.xs} color={colors.successText} accessibilityLabel="Импортировано" />
        )}
      </View>
    </Pressable>
  );
});

const BookCard = memo(function BookCard({
  book,
  colors,
  onPress,
}: {
  book: BookListItem;
  colors: ReturnType<typeof useThemeColors>;
  onPress?: () => void;
}) {
  const cover = getBookCover(book.subject);
  const meta = formatBookMeta(book);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.bCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && s.pressed]}
    >
      <View style={[s.bCardCover, { backgroundColor: alpha(cover.color, 10) }]}>
        <cover.icon size={iconSize.xl} color={cover.color} />
      </View>
      <Text variant="label" style={[s.bCardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
        {book.title}
      </Text>
      {meta ? (
        <Text variant="caption" color="secondary" numberOfLines={1}>{meta}</Text>
      ) : null}
      <View style={s.statItem}>
        <BookOpen size={iconSize.xs} color={colors.textTertiary} />
        <Text variant="caption" color="secondary">
          {book.unitsCount} {pluralize(book.unitsCount, 'юнит', 'юнита', 'юнитов')}
        </Text>
      </View>
      {!book.isPublished && <Badge label="Черновик" tone="warning" />}
    </Pressable>
  );
});

// ---- Main Screen ----

export function LibraryScreen() {
  const navigation = useNavigation();
  const colors = useThemeColors();

  const {
    trendingSets,
    topRatedSets,
    recentSets,
    isLoading,
    isLoadingMore,
    hasMoreRecent,
    error,
    fetchAllSections,
    fetchMoreRecent,
    setFilters,
  } = useLibraryStore();

  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [activeCardCount, setActiveCardCount] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | undefined>();
  const [books, setBooks] = useState<BookListItem[]>([]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get user ID
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id);
    });
  }, []);

  // Initial load
  useEffect(() => {
    fetchAllSections(userId);
  }, [userId]);

  // Каталог книг (нужна сессия Supabase — грузим, когда известен пользователь)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    BookService.listBooks().then((list) => {
      if (!cancelled) setBooks(list);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Debounced search
  const onSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setFilters({ search: text || undefined }, userId);
    }, 400);
  }, [userId, setFilters]);

  // Category filter
  const onCategoryPress = useCallback((key: string) => {
    const newCat = activeCategory === key ? null : key;
    setActiveCategory(newCat);
    setFilters({ category: newCat || undefined }, userId);
  }, [activeCategory, userId, setFilters]);

  // Language filter
  const onLangPress = useCallback((key: string) => {
    const newLang = activeLang === key ? null : key;
    setActiveLang(newLang);
    setFilters({ language: newLang || undefined }, userId);
  }, [activeLang, userId, setFilters]);

  // Card count filter
  const onCardCountPress = useCallback((key: string) => {
    const range = CARD_COUNT_RANGES.find(r => r.key === key);
    if (!range) return;
    const newKey = activeCardCount === key ? null : key;
    setActiveCardCount(newKey);
    setFilters({
      cardsMin: newKey ? range.min : undefined,
      cardsMax: newKey && range.max ? range.max : undefined,
    }, userId);
  }, [activeCardCount, userId, setFilters]);

  // Sort
  const onSortSelect = useCallback((sortKey: string) => {
    setFilters({ sort: sortKey as 'popular' | 'newest' | 'top_rated' }, userId);
  }, [userId, setFilters]);

  const navigateToDetail = useCallback((setId: string) => {
    navigation.navigate('LibrarySetDetail' as any, { setId });
  }, [navigation]);

  const navigateToBook = useCallback((bookId: string) => {
    navigation.navigate('BookDetail' as any, { bookId });
  }, [navigation]);

  const isEmpty = trendingSets.length === 0 && topRatedSets.length === 0 && recentSets.length === 0;
  const isSearchActive = searchText.trim().length > 0 || activeCategory !== null || activeLang !== null || activeCardCount !== null;

  // Книги в режиме поиска — только по тексту запроса (название, издательство, предмет)
  const matchingBooks = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return [];
    return books.filter((b) =>
      [b.title, b.publisher, b.subject].some((field) => field?.toLowerCase().includes(q)));
  }, [books, searchText]);
  const nothingToShow = isEmpty && (isSearchActive ? matchingBooks.length === 0 : books.length === 0);

  // Combine all results for search mode (deduplicated)
  const searchResults = React.useMemo(() => {
    if (!isSearchActive) return [];
    const seen = new Set<string>();
    const combined: LibrarySet[] = [];
    for (const item of [...trendingSets, ...topRatedSets, ...recentSets]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }
    return combined;
  }, [isSearchActive, trendingSets, topRatedSets, recentSets]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Search Row */}
      <View style={[s.header, { backgroundColor: colors.background }]}>
        <View style={s.searchRow}>
          <TextField
            variant="search"
            icon={Search}
            placeholder="Поиск наборов или @ник автора..."
            accessibilityLabel="Поиск наборов"
            value={searchText}
            onChangeText={onSearchChange}
            style={s.flex1}
            inputStyle={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Сортировка"
            style={({ pressed }) => [s.sortBtn, { backgroundColor: colors.surfaceMuted }, pressed && s.pressed]}
            onPress={() => {
              Alert.alert(
                'Сортировка',
                undefined,
                [
                  ...LIBRARY_SORT_OPTIONS.map(opt => ({
                    text: opt.label,
                    onPress: () => onSortSelect(opt.key),
                  })),
                  { text: 'Отмена', style: 'cancel' as const },
                ]
              );
            }}
          >
            <ArrowDownUp size={iconSize.s} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={[s.filtersContainer, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {/* Category Chips */}
        <View style={{ position: 'relative' }}>
          <FadeEdge side="left" bgColor={colors.background} />
          <FadeEdge side="right" bgColor={colors.background} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
            {LIBRARY_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={[
                    s.chip,
                    isActive
                      ? { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => onCategoryPress(cat.key)}
                >
                  <Text variant="label" style={{ color: isActive ? colors.onPrimary : colors.textPrimary }}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Language + Card count Chips */}
        <View style={{ position: 'relative' }}>
          <FadeEdge side="left" bgColor={colors.background} />
          <FadeEdge side="right" bgColor={colors.background} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
            {LIBRARY_LANGUAGES.map((lang) => {
              const isActive = activeLang === lang.key;
              return (
                <Pressable
                  key={lang.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={[
                    s.langChip,
                    isActive
                      ? { backgroundColor: alpha(colors.primary, 10), borderColor: colors.primary }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => onLangPress(lang.key)}
                >
                  <Text variant="caption">{lang.flag}</Text>
                  <Text variant="caption" style={[s.semibold, { color: isActive ? colors.primary : colors.textPrimary }]}>{lang.label}</Text>
                </Pressable>
              );
            })}
            <View style={[s.chipSeparator, { backgroundColor: colors.border }]} />
            {CARD_COUNT_RANGES.map((range) => {
              const isActive = activeCardCount === range.key;
              return (
                <Pressable
                  key={range.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={[
                    s.langChip,
                    isActive
                      ? { backgroundColor: alpha(colors.primary, 10), borderColor: colors.primary }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => onCardCountPress(range.key)}
                >
                  <Layers size={iconSize.xs} color={isActive ? colors.primary : colors.textSecondary} />
                  <Text variant="caption" style={[s.semibold, { color: isActive ? colors.primary : colors.textPrimary }]}>{range.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Content */}
      {isLoading && nothingToShow ? (
        // Заготовки в форме карточек вместо спиннера (брендбук, 7.8)
        <View style={s.skeletons} accessibilityLabel="Загрузка библиотеки" accessibilityRole="progressbar">
          <SkeletonCard height={160} />
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
        </View>
      ) : error && nothingToShow ? (
        <ErrorState
          title="Ошибка загрузки"
          description={error}
          retryLabel="Попробовать снова"
          onRetry={() => fetchAllSections(userId)}
        />
      ) : nothingToShow ? (
        <EmptyState
          icon={Search}
          title="Ничего не найдено"
          description="Попробуй изменить фильтры или поисковый запрос"
        />
      ) : isSearchActive ? (
        /* Search Results - vertical grid with HorizontalCard design */
        <ScrollView style={s.content} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {matchingBooks.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <SectionTitle icon={Library} title="Учебники" color={colors.primary} colors={colors} />
                <Text variant="label" color="secondary">{matchingBooks.length}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {matchingBooks.map((book) => (
                  <BookCard key={book.id} book={book} colors={colors} onPress={() => navigateToBook(book.id)} />
                ))}
              </ScrollView>
            </View>
          )}
          {searchResults.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <SectionTitle icon={Search} title="Результаты поиска" color={colors.primary} colors={colors} />
                <Text variant="label" color="secondary">{searchResults.length}</Text>
              </View>
              <View style={s.searchGrid}>
                {searchResults.map((item) => (
                  <HorizontalCard key={item.id} item={item} colors={colors} fullWidth onPress={() => navigateToDetail(item.id)} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={s.content} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Books (каталог учебников) */}
          {books.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <SectionTitle icon={Library} title="Учебники" color={colors.primary} colors={colors} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {books.map((book) => (
                  <BookCard key={book.id} book={book} colors={colors} onPress={() => navigateToBook(book.id)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Trending */}
          {trendingSets.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <SectionTitle icon={Flame} title="Популярные наборы" color={colors.streak} colors={colors} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {trendingSets.map((item) => (
                  <HorizontalCard key={item.id} item={item} colors={colors} onPress={() => navigateToDetail(item.id)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Top Rated */}
          {topRatedSets.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <SectionTitle icon={Star} title="Лучшие по рейтингу" color={colors.star} colors={colors} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {topRatedSets.map((item) => (
                  <HorizontalCard key={item.id} item={item} colors={colors} onPress={() => navigateToDetail(item.id)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Recent */}
          {recentSets.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <SectionTitle icon={Sparkles} title="Недавно добавленные" color={colors.primary} colors={colors} />
              </View>
              <View style={s.recentList}>
                {recentSets.map((item) => (
                  <RecentCard key={item.id} item={item} colors={colors} onPress={() => navigateToDetail(item.id)} />
                ))}
              </View>
              {hasMoreRecent && (
                <Pressable
                  style={[s.loadMoreBtn, { borderColor: alpha(colors.primary, 20) }]}
                  onPress={() => fetchMoreRecent(userId)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text variant="label" style={{ color: colors.primary }}>Показать ещё</Text>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ---- Styles ----

const s = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  pressed: { opacity: 0.85 },
  header: { paddingHorizontal: screenPadding, paddingTop: spacing.m, paddingBottom: spacing.xs, gap: spacing.xs },
  filtersContainer: { paddingBottom: spacing.xs, borderBottomWidth: 1, gap: spacing.xs },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginBottom: spacing.xs },
  sortBtn: { width: heights.input, height: heights.input, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center' },
  chipsRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xxs, paddingHorizontal: screenPadding },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.m, borderRadius: borderRadius.full, borderWidth: 1 },
  langChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32, paddingHorizontal: spacing.s, borderRadius: borderRadius.full, borderWidth: 1 },
  chipSeparator: { width: 1, height: 24, marginHorizontal: spacing.xs, alignSelf: 'center' },
  content: { flex: 1 },
  scrollContent: { paddingTop: spacing.m, paddingBottom: spacing.xxl },
  skeletons: { padding: screenPadding, gap: spacing.s },
  section: { marginBottom: spacing.l },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: screenPadding, marginBottom: spacing.s },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hScroll: { paddingHorizontal: screenPadding, gap: spacing.s },
  searchGrid: { paddingHorizontal: screenPadding, gap: spacing.s },
  bCard: { width: 150, padding: spacing.m, borderRadius: borderRadius.l, borderWidth: 1, gap: spacing.xs },
  bCardCover: { width: '100%', height: 88, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xxs },
  bCardTitle: { minHeight: 40 },
  hCard: { width: 260, padding: spacing.m, borderRadius: borderRadius.l, borderWidth: 1, gap: spacing.s },
  hCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hCardIcon: { width: 48, height: 48, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  hCardText: { gap: spacing.xxs / 2 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs / 2, borderRadius: borderRadius.s },
  hCardStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.xxs },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  statPushRight: { marginLeft: 'auto' },
  verifiedBadge: { position: 'absolute', top: -spacing.xxs, right: -spacing.xxs, width: 18, height: 18, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  recentList: { paddingHorizontal: screenPadding, gap: spacing.s },
  rCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, padding: spacing.m, borderRadius: borderRadius.l, borderWidth: 1 },
  rCardIcon: { width: 52, height: 52, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  rCardBody: { flex: 1, gap: spacing.xxs },
  rCardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rCardRight: { alignItems: 'flex-end', gap: spacing.xxs / 2 },
  loadMoreBtn: { marginHorizontal: screenPadding, marginTop: spacing.m, minHeight: heights.button, borderRadius: borderRadius.m, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
