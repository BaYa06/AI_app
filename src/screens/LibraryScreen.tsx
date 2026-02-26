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
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore, useLibraryStore } from '@/store';
import {
  spacing,
  borderRadius,
  LIBRARY_CATEGORIES,
  LIBRARY_LANGUAGES,
  CARD_COUNT_RANGES,
  LIBRARY_SORT_OPTIONS,
  getCategoryLabel,
  getLanguageDef,
  formatCount,
  formatRelativeTime,
} from '@/constants';
import { Search, ArrowDownUp } from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/services/supabaseClient';
import type { LibrarySet } from '@/types/library';

// ---- Memoized Card Components ----

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
    <Pressable onPress={onPress} style={[s.hCard, fullWidth && { width: '100%' }, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.hCardTop}>
        <View style={[s.hCardIcon, { backgroundColor: colors.primary + '15' }]}>
          <Text style={s.hCardEmoji}>{item.cover_emoji || '📚'}</Text>
        </View>
        {avgRating !== null && (
          <View style={s.ratingBadge}>
            <Ionicons name="star" size={12} color="#CA8A04" />
            <Text style={s.ratingText}>{avgRating}</Text>
          </View>
        )}
      </View>

      <View style={{ gap: 2 }}>
        <Text style={[s.hCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[s.hCardMeta, { color: colors.textTertiary }]} numberOfLines={1}>
          {item.author_name || 'Unknown'}{langDef ? ` • ${langDef.flag} ${langDef.label}` : ''}
        </Text>
      </View>

      <View style={s.hCardStats}>
        <View style={s.statItem}>
          <Ionicons name="layers-outline" size={14} color={colors.textTertiary} />
          <Text style={[s.statText, { color: colors.textTertiary }]}>{item.cards_count} карт</Text>
        </View>
        <View style={s.statItem}>
          <Ionicons name="download-outline" size={14} color={colors.textTertiary} />
          <Text style={[s.statText, { color: colors.textTertiary }]}>{formatCount(item.imports_count)}</Text>
        </View>
        <View style={[s.statItem, { marginLeft: 'auto' }]}>
          <Ionicons name="heart" size={14} color="#EC4899" />
          <Text style={[s.statText, { color: colors.textTertiary }]}>{formatCount(item.likes_count)}</Text>
        </View>
      </View>

      {item.is_imported && (
        <View style={[s.importedBadge, { backgroundColor: '#10B981' + '15' }]}>
          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
          <Text style={[s.importedText, { color: '#10B981' }]}>Импортировано</Text>
        </View>
      )}
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
    <Pressable onPress={onPress} style={[s.rCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.rCardIcon, { backgroundColor: colors.primary + '15' }]}>
        <Text style={s.rCardEmoji}>{item.cover_emoji || '📚'}</Text>
      </View>
      <View style={s.rCardBody}>
        <Text style={[s.rCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={s.rCardMetaRow}>
          {item.category && (
            <View style={[s.categoryBadge, { backgroundColor: colors.primary + '0D' }]}>
              <Text style={[s.categoryText, { color: colors.primary }]}>{getCategoryLabel(item.category)}</Text>
            </View>
          )}
          <Text style={[s.rCardAuthor, { color: colors.textTertiary }]}>{item.author_name || 'Unknown'}</Text>
        </View>
      </View>
      <View style={s.rCardRight}>
        <Text style={[s.rCardCards, { color: colors.textSecondary }]}>{item.cards_count} карт</Text>
        <Text style={[s.rCardTime, { color: colors.textTertiary }]}>{formatRelativeTime(item.published_at)}</Text>
        {item.is_imported && (
          <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginTop: 2 }} />
        )}
      </View>
    </Pressable>
  );
});

// ---- Main Screen ----

export function LibraryScreen() {
  const navigation = useNavigation();
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

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

  const isEmpty = trendingSets.length === 0 && topRatedSets.length === 0 && recentSets.length === 0;
  const isSearchActive = searchText.trim().length > 0 || activeCategory !== null || activeLang !== null || activeCardCount !== null;

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
      {/* Sticky Header */}
      <View style={[s.header, { backgroundColor: isDark ? colors.background : '#FFFFFF', borderBottomColor: colors.border }]}>
        {/* Search Row */}
        <View style={s.searchRow}>
          <View style={[s.searchWrap, { backgroundColor: colors.primary + '0A' }]}>
            <Search size={18} color={colors.primary} />
            <TextInput
              style={[
                s.searchInput,
                { color: colors.textPrimary },
                Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
              ]}
              placeholder="Поиск наборов или @username..."
              placeholderTextColor={colors.textTertiary}
              value={searchText}
              onChangeText={onSearchChange}
            />
          </View>
          <Pressable
            style={[s.sortBtn, { backgroundColor: colors.primary + '15' }]}
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
            <ArrowDownUp size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* Category Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {LIBRARY_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                style={[
                  s.chip,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
                onPress={() => onCategoryPress(cat.key)}
              >
                <Text style={[s.chipText, { color: isActive ? '#FFFFFF' : colors.textPrimary }]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Language + Card count Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {LIBRARY_LANGUAGES.map((lang) => {
            const isActive = activeLang === lang.key;
            return (
              <Pressable
                key={lang.key}
                style={[
                  s.langChip,
                  isActive
                    ? { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => onLangPress(lang.key)}
              >
                <Text style={s.langFlag}>{lang.flag}</Text>
                <Text style={[s.langLabel, { color: isActive ? colors.primary : colors.textPrimary }]}>{lang.label}</Text>
              </Pressable>
            );
          })}
          <View style={s.chipSeparator} />
          {CARD_COUNT_RANGES.map((range) => {
            const isActive = activeCardCount === range.key;
            return (
              <Pressable
                key={range.key}
                style={[
                  s.langChip,
                  isActive
                    ? { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => onCardCountPress(range.key)}
              >
                <Ionicons name="layers-outline" size={14} color={isActive ? colors.primary : colors.textSecondary} />
                <Text style={[s.langLabel, { color: isActive ? colors.primary : colors.textPrimary }]}>{range.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {isLoading && isEmpty ? (
        <View style={s.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.loadingText, { color: colors.textTertiary }]}>Загрузка библиотеки...</Text>
        </View>
      ) : error && isEmpty ? (
        <View style={s.centerContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Ошибка загрузки</Text>
          <Text style={[s.emptySubtitle, { color: colors.textTertiary }]}>{error}</Text>
          <Pressable style={[s.retryBtn, { backgroundColor: colors.primary }]} onPress={() => fetchAllSections(userId)}>
            <Text style={s.retryBtnText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : isEmpty ? (
        <View style={s.centerContainer}>
          <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Ничего не найдено</Text>
          <Text style={[s.emptySubtitle, { color: colors.textTertiary }]}>Попробуйте изменить фильтры или поисковый запрос</Text>
        </View>
      ) : isSearchActive ? (
        /* Search Results - vertical grid with HorizontalCard design */
        <ScrollView style={s.content} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>🔍 Результаты поиска</Text>
              <Text style={[s.searchCount, { color: colors.textTertiary }]}>{searchResults.length}</Text>
            </View>
            <View style={s.searchGrid}>
              {searchResults.map((item) => (
                <HorizontalCard key={item.id} item={item} colors={colors} fullWidth onPress={() => navigateToDetail(item.id)} />
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={s.content} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Trending */}
          {trendingSets.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>🔥 Популярные наборы</Text>
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
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>⭐ Лучшие по рейтингу</Text>
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
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>✨ Недавно добавленные</Text>
              </View>
              <View style={s.recentList}>
                {recentSets.map((item) => (
                  <RecentCard key={item.id} item={item} colors={colors} onPress={() => navigateToDetail(item.id)} />
                ))}
              </View>
              {hasMoreRecent && (
                <Pressable
                  style={[s.loadMoreBtn, { borderColor: colors.primary + '33' }]}
                  onPress={() => fetchMoreRecent(userId)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[s.loadMoreText, { color: colors.primary }]}>Показать ещё</Text>
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
  header: { paddingHorizontal: spacing.m, paddingTop: spacing.m, paddingBottom: spacing.xs, borderBottomWidth: 1, gap: spacing.xs },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginBottom: spacing.xs },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.s, paddingVertical: spacing.s, borderRadius: borderRadius.l },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', padding: 0, margin: 0 },
  sortBtn: { width: 44, height: 44, borderRadius: borderRadius.l, alignItems: 'center', justifyContent: 'center' },
  chipsRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xxs },
  chip: { paddingHorizontal: 18, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  chipText: { fontSize: 13, fontWeight: '600' },
  langChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.s, paddingVertical: 6, borderRadius: borderRadius.full, borderWidth: 1 },
  langFlag: { fontSize: 12 },
  langLabel: { fontSize: 12, fontWeight: '600' },
  chipSeparator: { width: 1, height: 24, backgroundColor: '#D1D5DB', marginHorizontal: spacing.xs, alignSelf: 'center', opacity: 0.4 },
  content: { flex: 1 },
  scrollContent: { paddingTop: spacing.m, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.l },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.m, marginBottom: spacing.s },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  hScroll: { paddingHorizontal: spacing.m, gap: spacing.s },
  searchGrid: { paddingHorizontal: spacing.m, gap: spacing.s },
  searchCount: { fontSize: 14, fontWeight: '600' },
  hCard: { width: 260, padding: spacing.m, borderRadius: borderRadius.xl, borderWidth: 1, gap: spacing.s },
  hCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hCardIcon: { width: 48, height: 48, borderRadius: borderRadius.l, alignItems: 'center', justifyContent: 'center' },
  hCardEmoji: { fontSize: 24 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(250, 204, 21, 0.1)', paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: borderRadius.s },
  ratingText: { fontSize: 11, fontWeight: '800', color: '#CA8A04' },
  hCardTitle: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  hCardMeta: { fontSize: 11, fontWeight: '500' },
  hCardStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.xxs },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 11, fontWeight: '500' },
  importedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.s },
  importedText: { fontSize: 10, fontWeight: '700' },
  recentList: { paddingHorizontal: spacing.m, gap: spacing.s },
  rCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, padding: spacing.m, borderRadius: borderRadius.xl, borderWidth: 1 },
  rCardIcon: { width: 52, height: 52, borderRadius: borderRadius.l, alignItems: 'center', justifyContent: 'center' },
  rCardEmoji: { fontSize: 24 },
  rCardBody: { flex: 1, gap: 4 },
  rCardTitle: { fontSize: 15, fontWeight: '700' },
  rCardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  categoryBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.xs },
  categoryText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  rCardAuthor: { fontSize: 11, fontWeight: '500' },
  rCardRight: { alignItems: 'flex-end', gap: 2 },
  rCardCards: { fontSize: 12, fontWeight: '700' },
  rCardTime: { fontSize: 10, fontWeight: '500' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s, paddingHorizontal: spacing.xl },
  loadingText: { fontSize: 14, fontWeight: '500', marginTop: spacing.s },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  retryBtn: { paddingHorizontal: spacing.l, paddingVertical: spacing.s, borderRadius: borderRadius.l, marginTop: spacing.s },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  loadMoreBtn: { marginHorizontal: spacing.m, marginTop: spacing.m, paddingVertical: spacing.m, borderRadius: borderRadius.l, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  loadMoreText: { fontSize: 14, fontWeight: '700' },
});
