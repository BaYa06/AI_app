/**
 * Library Screen
 * @description Public library with trending, top-rated, and recent sets
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { Search, SlidersHorizontal, X, Check } from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// ---- Mock data ----

const CATEGORIES = ['Все', 'Грамматика', 'Лексика', 'Фразы', 'Путешествия'];

const LANGUAGES = [
  { flag: '🇩🇪→🇷🇺', label: 'Немецкий' },
  { flag: '🇬🇧→🇷🇺', label: 'Английский' },
  { flag: '🇫🇷→🇷🇺', label: 'Французский' },
];

const TRENDING = [
  {
    id: '1',
    emoji: '✈️',
    title: 'Путешествие в Берлин',
    author: '@travel_master',
    lang: '🇩🇪 Немецкий',
    cards: 42,
    downloads: '1.2k',
    likes: 248,
    rating: 4.9,
  },
  {
    id: '2',
    emoji: '🧠',
    title: 'Неправильные глаголы',
    author: '@grammarnazi',
    lang: '🇬🇧 Английский',
    cards: 120,
    downloads: '3.5k',
    likes: 812,
    rating: 4.8,
  },
];

const TOP_RATED = [
  {
    id: '3',
    emoji: '🍔',
    title: 'Ресторанная лексика',
    author: '@polyglot',
    lang: '🇬🇧 Английский',
    cards: 35,
    downloads: '890',
    likes: 156,
    rating: 5.0,
  },
  {
    id: '4',
    emoji: '💼',
    title: 'Деловой немецкий B2',
    author: '@pro_lingua',
    lang: '🇩🇪 Немецкий',
    cards: 64,
    downloads: '540',
    likes: 92,
    rating: 4.9,
  },
];

const RECENT = [
  {
    id: '5',
    emoji: '🏥',
    title: 'Медицинские термины',
    category: 'Лексика',
    author: '@doc_mike',
    cards: 18,
    time: '2 мин. назад',
  },
  {
    id: '6',
    emoji: '🍿',
    title: 'Кино и ТВ шоу',
    category: 'Фразы',
    author: '@netflix_fan',
    cards: 55,
    time: '15 мин. назад',
  },
  {
    id: '7',
    emoji: '👗',
    title: 'Мода и шоппинг',
    category: 'Лексика',
    author: '@style_guru',
    cards: 30,
    time: '1 час назад',
  },
];

// ---- Filter data ----

const FILTER_CATEGORIES = [
  { key: 'grammar', label: 'Grammar', icon: 'text-outline' },
  { key: 'vocab', label: 'Vocab', icon: 'book-outline' },
  { key: 'phrases', label: 'Phrases', icon: 'chatbubble-outline' },
  { key: 'travel', label: 'Travel', icon: 'airplane-outline' },
];

const FILTER_LANGS = [
  { key: 'de-ru', label: 'DE-RU' },
  { key: 'en-ru', label: 'EN-RU' },
  { key: 'es-ru', label: 'ES-RU' },
];

const CARD_COUNTS = ['1-50', '51-100', '101-200', '200+'];

const RATINGS = ['4+', '3+'];

// ---- Components ----

function HorizontalCard({
  item,
  colors,
  onPress,
}: {
  item: (typeof TRENDING)[0];
  colors: ReturnType<typeof useThemeColors>;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.hCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.hCardTop}>
        <View style={[s.hCardIcon, { backgroundColor: colors.primary + '15' }]}>
          <Text style={s.hCardEmoji}>{item.emoji}</Text>
        </View>
        <View style={s.ratingBadge}>
          <Ionicons name="star" size={12} color="#CA8A04" />
          <Text style={s.ratingText}>{item.rating}</Text>
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={[s.hCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[s.hCardMeta, { color: colors.textTertiary }]}>
          {item.author} • {item.lang}
        </Text>
      </View>

      <View style={s.hCardStats}>
        <View style={s.statItem}>
          <Ionicons name="layers-outline" size={14} color={colors.textTertiary} />
          <Text style={[s.statText, { color: colors.textTertiary }]}>{item.cards} карт</Text>
        </View>
        <View style={s.statItem}>
          <Ionicons name="download-outline" size={14} color={colors.textTertiary} />
          <Text style={[s.statText, { color: colors.textTertiary }]}>{item.downloads}</Text>
        </View>
        <View style={[s.statItem, { marginLeft: 'auto' }]}>
          <Ionicons name="heart" size={14} color="#EC4899" />
          <Text style={[s.statText, { color: colors.textTertiary }]}>{item.likes}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function RecentCard({
  item,
  colors,
  onPress,
}: {
  item: (typeof RECENT)[0];
  colors: ReturnType<typeof useThemeColors>;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.rCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.rCardIcon, { backgroundColor: colors.primary + '15' }]}>
        <Text style={s.rCardEmoji}>{item.emoji}</Text>
      </View>
      <View style={s.rCardBody}>
        <Text style={[s.rCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={s.rCardMetaRow}>
          <View style={[s.categoryBadge, { backgroundColor: colors.primary + '0D' }]}>
            <Text style={[s.categoryText, { color: colors.primary }]}>{item.category}</Text>
          </View>
          <Text style={[s.rCardAuthor, { color: colors.textTertiary }]}>{item.author}</Text>
        </View>
      </View>
      <View style={s.rCardRight}>
        <Text style={[s.rCardCards, { color: colors.textSecondary }]}>{item.cards} карт</Text>
        <Text style={[s.rCardTime, { color: colors.textTertiary }]}>{item.time}</Text>
      </View>
    </Pressable>
  );
}

// ---- Main Screen ----

export function LibraryScreen() {
  const navigation = useNavigation();
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const [activeCategory, setActiveCategory] = useState(0);
  const [activeLang, setActiveLang] = useState<number | null>(null);

  // Filter bottom sheet state
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>('grammar');
  const [filterLang, setFilterLang] = useState<string | null>('en-ru');
  const [filterCardCounts, setFilterCardCounts] = useState<Set<string>>(new Set(['1-50']));
  const [filterRating, setFilterRating] = useState<string | null>('3+');

  const toggleCardCount = useCallback((value: string) => {
    setFilterCardCounts((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilterCategory(null);
    setFilterLang(null);
    setFilterCardCounts(new Set());
    setFilterRating(null);
  }, []);

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
                Platform.OS === 'web' && { outlineStyle: 'none' },
              ]}
              placeholder="Поиск наборов..."
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <Pressable style={[s.filterBtn, { backgroundColor: colors.primary + '15' }]} onPress={() => setFilterVisible(true)}>
            <SlidersHorizontal size={20} color={colors.primary} />
          </Pressable>
        </View>

        {/* Category Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
        >
          {CATEGORIES.map((cat, i) => {
            const isActive = activeCategory === i;
            return (
              <Pressable
                key={cat}
                style={[
                  s.chip,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                ]}
                onPress={() => setActiveCategory(i)}
              >
                <Text
                  style={[
                    s.chipText,
                    { color: isActive ? '#FFFFFF' : colors.textPrimary },
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Language Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
        >
          {LANGUAGES.map((lang, i) => {
            const isActive = activeLang === i;
            return (
              <Pressable
                key={lang.label}
                style={[
                  s.langChip,
                  isActive
                    ? { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setActiveLang(isActive ? null : i)}
              >
                <Text style={s.langFlag}>{lang.flag}</Text>
                <Text style={[s.langLabel, { color: isActive ? colors.primary : colors.textPrimary }]}>
                  {lang.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        style={s.content}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Trending Section */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              🔥 Популярные наборы
            </Text>
            <Pressable>
              <Text style={[s.seeAll, { color: colors.primary }]}>Все</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.hScroll}
          >
            {TRENDING.map((item) => (
              <HorizontalCard key={item.id} item={item} colors={colors} onPress={() => navigation.navigate('SharedSetDetail', { setId: item.id })} />
            ))}
          </ScrollView>
        </View>

        {/* Top Rated Section */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              ⭐ Лучшие по рейтингу
            </Text>
            <Pressable>
              <Text style={[s.seeAll, { color: colors.primary }]}>Все</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.hScroll}
          >
            {TOP_RATED.map((item) => (
              <HorizontalCard key={item.id} item={item} colors={colors} onPress={() => navigation.navigate('SharedSetDetail', { setId: item.id })} />
            ))}
          </ScrollView>
        </View>

        {/* Recently Added Section */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              ✨ Недавно добавленные
            </Text>
          </View>
          <View style={s.recentList}>
            {RECENT.map((item) => (
              <RecentCard key={item.id} item={item} colors={colors} onPress={() => navigation.navigate('SharedSetDetail', { setId: item.id })} />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Filter Bottom Sheet */}
      <Modal
        visible={filterVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterVisible(false)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setFilterVisible(false)} />
        <View style={s.bottomSheet}>
          <View style={[s.sheetContainer, { backgroundColor: isDark ? colors.background : '#FFFFFF' }]}>
            {/* Handle */}
            <View style={s.sheetHandle}>
              <View style={[s.handleBar, { backgroundColor: isDark ? '#4B5563' : '#D1D5DB' }]} />
            </View>

            {/* Header */}
            <View style={[s.sheetHeader, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}>
              <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Фильтры</Text>
              <Pressable onPress={() => setFilterVisible(false)}>
                <X size={24} color={colors.textTertiary} />
              </Pressable>
            </View>

            {/* Scrollable Content */}
            <ScrollView
              style={s.sheetScroll}
              contentContainerStyle={s.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Category Section */}
              <View style={s.filterSection}>
                <Text style={[s.filterLabel, { color: colors.textTertiary }]}>Категория</Text>
                <View style={s.filterChipsWrap}>
                  {FILTER_CATEGORIES.map((cat) => {
                    const isActive = filterCategory === cat.key;
                    return (
                      <Pressable
                        key={cat.key}
                        style={[
                          s.filterChip,
                          isActive
                            ? { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                            : { borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB' },
                        ]}
                        onPress={() => setFilterCategory(isActive ? null : cat.key)}
                      >
                        <Ionicons
                          name={cat.icon as any}
                          size={16}
                          color={isActive ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[s.filterChipText, { color: isActive ? colors.primary : colors.textSecondary }]}>
                          {cat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Language Pair Section */}
              <View style={s.filterSection}>
                <Text style={[s.filterLabel, { color: colors.textTertiary }]}>Языковая пара</Text>
                <View style={s.filterChipsWrap}>
                  {FILTER_LANGS.map((lang) => {
                    const isActive = filterLang === lang.key;
                    return (
                      <Pressable
                        key={lang.key}
                        style={[
                          s.filterChip,
                          isActive
                            ? { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                            : { borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB' },
                        ]}
                        onPress={() => setFilterLang(isActive ? null : lang.key)}
                      >
                        <Text style={[s.filterChipText, { color: isActive ? colors.primary : colors.textSecondary }]}>
                          {lang.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Card Count Section */}
              <View style={s.filterSection}>
                <Text style={[s.filterLabel, { color: colors.textTertiary }]}>Количество карточек</Text>
                <View style={s.cardCountGrid}>
                  {CARD_COUNTS.map((range) => {
                    const isActive = filterCardCounts.has(range);
                    return (
                      <Pressable
                        key={range}
                        style={[
                          s.cardCountItem,
                          isActive
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB' },
                        ]}
                        onPress={() => toggleCardCount(range)}
                      >
                        <Text style={[s.cardCountText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>
                          {range}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Rating Section */}
              <View style={[s.filterSection, { paddingBottom: spacing.l }]}>
                <Text style={[s.filterLabel, { color: colors.textTertiary }]}>Рейтинг</Text>
                <View style={s.ratingRow}>
                  {RATINGS.map((r) => {
                    const isActive = filterRating === r;
                    return (
                      <Pressable
                        key={r}
                        style={s.ratingOption}
                        onPress={() => setFilterRating(isActive ? null : r)}
                      >
                        <View
                          style={[
                            s.radioOuter,
                            isActive
                              ? { borderColor: colors.primary, backgroundColor: colors.primary }
                              : { borderColor: isDark ? '#4B5563' : '#D1D5DB' },
                          ]}
                        >
                          {isActive && <Check size={14} color="#FFFFFF" />}
                        </View>
                        <Text style={[s.ratingLabel, { color: colors.textPrimary }]}>{r}</Text>
                        <Ionicons name="star" size={16} color="#FACC15" />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={[s.sheetFooter, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', backgroundColor: isDark ? colors.background : '#FFFFFF' }]}>
              <Pressable
                style={[s.resetBtn, { borderColor: colors.primary + '33' }]}
                onPress={resetFilters}
              >
                <Text style={[s.resetBtnText, { color: colors.primary }]}>Сбросить</Text>
              </Pressable>
              <Pressable
                style={[s.applyBtn, { backgroundColor: colors.primary }]}
                onPress={() => setFilterVisible(false)}
              >
                <Text style={s.applyBtnText}>Применить (12)</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---- Styles ----

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.xs,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
    margin: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  langFlag: {
    fontSize: 12,
  },
  langLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Content
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.m,
    paddingBottom: spacing.xxl,
  },

  // Section
  section: {
    marginBottom: spacing.l,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    marginBottom: spacing.s,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Horizontal Scroll
  hScroll: {
    paddingHorizontal: spacing.m,
    gap: spacing.s,
  },

  // Horizontal Card
  hCard: {
    width: 260,
    padding: spacing.m,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    gap: spacing.s,
  },
  hCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hCardIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hCardEmoji: {
    fontSize: 24,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: borderRadius.s,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#CA8A04',
  },
  hCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  hCardMeta: {
    fontSize: 11,
    fontWeight: '500',
  },
  hCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.xxs,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Recent Card
  recentList: {
    paddingHorizontal: spacing.m,
    gap: spacing.s,
  },
  rCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  rCardIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rCardEmoji: {
    fontSize: 24,
  },
  rCardBody: {
    flex: 1,
    gap: 4,
  },
  rCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rCardAuthor: {
    fontSize: 11,
    fontWeight: '500',
  },
  rCardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rCardCards: {
    fontSize: 12,
    fontWeight: '700',
  },
  rCardTime: {
    fontSize: 10,
    fontWeight: '500',
  },

  // Filter Bottom Sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '92%',
  },
  sheetContainer: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingTop: spacing.s,
    paddingBottom: spacing.xs,
  },
  handleBar: {
    width: 48,
    height: 5,
    borderRadius: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
  },

  // Filter sections
  filterSection: {
    marginBottom: spacing.l,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.s,
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Card Count grid
  cardCountGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cardCountItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  cardCountText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Rating
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.l,
  },
  ratingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Footer
  sheetFooter: {
    flexDirection: 'row',
    gap: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.l,
    borderTopWidth: 1,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 2,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6467f2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
