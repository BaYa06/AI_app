/**
 * Библиотека-каталог (plan/new/library_catalog.md, Catalog 6) — вкладка «Библиотека».
 *
 * Одно решение на экране: продолжить начатое или выбрать предмет.
 *  - поиск: подборки, наборы, учебники с путём («Английский · A2 · Путешествия»);
 *  - «Продолжить подборку» (последняя, куда добавлял, и следующий набор по порядку)
 *    или «С чего начать» — если ещё ничего не добавлял;
 *  - плитки предметов (только непустые; больше 8 — 6 плиток и «Все предметы»);
 *  - полка учебников.
 * Без лайков, оценок, скачиваний, «Популярных» и баннера Premium. Алмазов и серии в шапке нет.
 * Данные — useCatalogStore (кэш), «добавлено» — только личные добавления.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BookOpen, ChevronRight, Library, Search } from 'lucide-react-native';
import { Text } from '@/components/common';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonCard,
  TextField,
  type IconComponent,
} from '@/components/ui';
import { useCatalogStore, useThemeColors } from '@/store';
import { MIN_SEARCH_LENGTH } from '@/store/catalogStore';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { getCatalogIcon } from '@/constants/catalogIcons';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import { pluralize } from '@/utils';
import { addedLabel, cardsCountLabel, collectionPath, setsCountLabel } from '@/utils/catalog';
import type { RootStackParamList } from '@/types/navigation';
import type { CatalogBook, CatalogCollection, CatalogSubjectTile } from '@/types/library';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Colors = ReturnType<typeof useThemeColors>;

/** Больше предметов — показываем 6 и «Все предметы» (план, правила показа, п. 8). */
const MAX_TILES = 8;
const COLLAPSED_TILES = 6;
const SEARCH_DEBOUNCE_MS = 300;

// ── Блок «Продолжить» / «С чего начать» ──────────────────────────────────────

const EntryCard = memo(function EntryCard({
  overline,
  collection,
  note,
  action,
  onPress,
  colors,
}: {
  overline: string;
  collection: CatalogCollection;
  note: string;
  action: string;
  onPress: () => void;
  colors: Colors;
}) {
  const path = collectionPath(collection);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${overline}: ${collection.title}. ${note}`}
      style={({ pressed }) => [
        s.entry,
        { backgroundColor: colors.primaryFill },
        pressed && s.pressed,
      ]}
    >
      <Text variant="overline" style={[s.dim, { color: colors.onPrimary }]}>
        {overline}
      </Text>
      <Text variant="h3" style={{ color: colors.onPrimary }} numberOfLines={2}>
        {collection.title}
      </Text>
      <Text variant="bodySmall" style={[s.dim, { color: colors.onPrimary }]} numberOfLines={1}>
        {[path, addedLabel(collection.addedCount, collection.setsCount)]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {collection.addedCount > 0 && (
        <View style={s.entryBar}>
          {Array.from({ length: collection.setsCount }, (_, i) => (
            <View
              key={i}
              style={[
                s.entrySeg,
                {
                  backgroundColor:
                    i < collection.addedCount ? colors.onPrimary : alpha(colors.onPrimary, 40),
                },
              ]}
            />
          ))}
        </View>
      )}
      <View style={s.entryRow}>
        <Text
          variant="bodySmall"
          style={[s.flex1, s.dim, { color: colors.onPrimary }]}
          numberOfLines={1}
        >
          {note}
        </Text>
        <View style={[s.entryGo, { backgroundColor: colors.onPrimary }]}>
          <Text variant="label" style={{ color: colors.primaryFill }}>
            {action}
          </Text>
          <ChevronRight size={iconSize.xs} color={colors.primaryFill} />
        </View>
      </View>
    </Pressable>
  );
});

// ── Плитка предмета ──────────────────────────────────────────────────────────

const SubjectTile = memo(function SubjectTile({
  subject,
  onPress,
  colors,
}: {
  subject: CatalogSubjectTile;
  onPress: () => void;
  colors: Colors;
}) {
  const Icon = getCatalogIcon(subject.icon);
  return (
    <Card onPress={onPress} accessibilityLabel={subject.title} style={s.tile}>
      <View style={[s.iconBox, { backgroundColor: alpha(colors.primary, 10) }]}>
        <Icon size={iconSize.s} color={colors.primary} />
      </View>
      <Text variant="body" style={[s.semibold, { color: colors.textPrimary }]} numberOfLines={1}>
        {subject.title}
      </Text>
      {subject.subtitle ? (
        <Text variant="caption" color="secondary" numberOfLines={2}>
          {subject.subtitle}
        </Text>
      ) : null}
    </Card>
  );
});

// ── Учебник на полке ─────────────────────────────────────────────────────────

const ShelfBook = memo(function ShelfBook({
  book,
  onPress,
  colors,
}: {
  book: CatalogBook;
  onPress: () => void;
  colors: Colors;
}) {
  const cover = getBookCover(book.subject);
  const meta = formatBookMeta(book);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Учебник ${book.title}`}
      style={({ pressed }) => [s.book, pressed && s.pressed]}
    >
      <View style={[s.bookCover, { backgroundColor: alpha(cover.color, 10) }]}>
        <cover.icon size={iconSize.l} color={cover.color} />
      </View>
      <Text variant="label" style={{ color: colors.textPrimary }} numberOfLines={2}>
        {book.title}
      </Text>
      <Text variant="caption" color="secondary" numberOfLines={1}>
        {book.addedCount > 0
          ? `добавлено ${book.addedCount} из ${book.unitsCount}`
          : meta || `${book.unitsCount} ${pluralize(book.unitsCount, 'юнит', 'юнита', 'юнитов')}`}
      </Text>
    </Pressable>
  );
});

// ── Строки поиска ────────────────────────────────────────────────────────────

function ResultRow({
  title,
  path,
  icon: Icon,
  iconColor,
  added,
  onPress,
  colors,
}: {
  title: string;
  path: string;
  icon: IconComponent;
  iconColor: string;
  added?: boolean;
  onPress: () => void;
  colors: Colors;
}) {
  return (
    <Card onPress={onPress} padding="s" accessibilityLabel={`${title}. ${path}`}>
      <View style={s.resultRow}>
        <View style={[s.iconBoxSmall, { backgroundColor: alpha(iconColor, 10) }]}>
          <Icon size={iconSize.s} color={iconColor} />
        </View>
        <View style={s.flex1}>
          <Text
            variant="body"
            style={[s.semibold, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {path}
          </Text>
        </View>
        {added ? (
          <Badge label="Добавлен" tone="success" />
        ) : (
          <ChevronRight size={iconSize.s} color={colors.textTertiary} />
        )}
      </View>
    </Card>
  );
}

// ── Экран ────────────────────────────────────────────────────────────────────

export function LibraryCatalogScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useThemeColors();

  const catalog = useCatalogStore((st) => st.catalog?.data ?? null);
  const catalogError = useCatalogStore((st) => st.catalogError);
  const fetchCatalog = useCatalogStore((st) => st.fetchCatalog);
  const searchResult = useCatalogStore((st) => st.searchResult);
  const searchLoading = useCatalogStore((st) => st.searchLoading);
  const searchError = useCatalogStore((st) => st.searchError);
  const runSearch = useCatalogStore((st) => st.search);
  const clearSearch = useCatalogStore((st) => st.clearSearch);

  const [query, setQuery] = useState('');
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // На каждом заходе на вкладку: из кэша сразу, с сервера — если устарело (вернулся после добавления).
  useFocusEffect(
    useCallback(() => {
      fetchCatalog();
    }, [fetchCatalog])
  );

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
      clearSearch();
    },
    [clearSearch]
  );

  const onQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounce.current) clearTimeout(debounce.current);
      if (text.trim().length < MIN_SEARCH_LENGTH) {
        runSearch(text);
        return;
      }
      debounce.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
    },
    [runSearch]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchCatalog({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchCatalog]);

  const openSubject = useCallback(
    (sub: { slug: string; title: string }) =>
      navigation.navigate('LibrarySubject', { slug: sub.slug, title: sub.title }),
    [navigation]
  );
  const openCollection = useCallback(
    (c: CatalogCollection) =>
      navigation.navigate('LibraryCollection', { collectionId: c.id, title: c.title }),
    [navigation]
  );
  const openSet = useCallback(
    (setId: string) => navigation.navigate('LibrarySetDetail', { setId }),
    [navigation]
  );
  const openBook = useCallback(
    (bookId: string) => navigation.navigate('BookDetail', { bookId }),
    [navigation]
  );

  const subjects = useMemo(() => catalog?.subjects ?? [], [catalog]);
  const visibleSubjects = useMemo(
    () =>
      subjects.length > MAX_TILES && !showAllSubjects
        ? subjects.slice(0, COLLAPSED_TILES)
        : subjects,
    [subjects, showAllSubjects]
  );

  const searching = query.trim().length >= MIN_SEARCH_LENGTH;

  const header = (
    <View style={s.header}>
      <Text variant="h2" accessibilityRole="header" style={{ color: colors.textPrimary }}>
        Библиотека
      </Text>
      <TextField
        variant="search"
        icon={Search}
        placeholder="Найти подборку, набор или учебник"
        accessibilityLabel="Поиск в библиотеке"
        value={query}
        onChangeText={onQueryChange}
        returnKeyType="search"
        autoCorrect={false}
      />
    </View>
  );

  // ── Поиск ──
  const renderSearch = () => {
    if (searchError && !searchResult) {
      return <ErrorState compact description={searchError} onRetry={() => runSearch(query)} />;
    }
    if (!searchResult) {
      return <ActivityIndicator style={s.searchSpinner} color={colors.primary} />;
    }
    const { collections, sets, books } = searchResult;
    if (collections.length + sets.length + books.length === 0) {
      return (
        <EmptyState
          compact
          icon={Search}
          title="Ничего не нашли"
          description="Попробуйте другое слово или откройте предмет."
          action={{
            label: 'Показать предметы',
            onPress: () => onQueryChange(''),
          }}
        />
      );
    }
    return (
      <View style={s.sections}>
        {searchLoading && <ActivityIndicator color={colors.primary} />}
        {collections.length > 0 && (
          <View style={s.section}>
            <Text variant="overline" color="secondary">
              Подборки
            </Text>
            {collections.map((c) => (
              <ResultRow
                key={c.id}
                title={c.title}
                path={[collectionPath(c), setsCountLabel(c.setsCount)].filter(Boolean).join(' · ')}
                icon={getCatalogIcon(c.icon)}
                iconColor={colors.primary}
                onPress={() => openCollection(c)}
                colors={colors}
              />
            ))}
          </View>
        )}
        {sets.length > 0 && (
          <View style={s.section}>
            <Text variant="overline" color="secondary">
              Наборы
            </Text>
            {sets.map((set) => (
              <ResultRow
                key={set.id}
                title={set.title}
                path={[
                  set.collection ? collectionPath(set.collection) : '',
                  set.collection?.title ?? '',
                  cardsCountLabel(set.cardsCount),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                icon={getCatalogIcon(set.collection?.icon)}
                iconColor={colors.primary}
                added={set.isImported}
                onPress={() => openSet(set.id)}
                colors={colors}
              />
            ))}
          </View>
        )}
        {books.length > 0 && (
          <View style={s.section}>
            <Text variant="overline" color="secondary">
              Учебники
            </Text>
            {books.map((b) => {
              const cover = getBookCover(b.subject);
              return (
                <ResultRow
                  key={b.id}
                  title={b.title}
                  path={[
                    formatBookMeta(b),
                    `${b.unitsCount} ${pluralize(b.unitsCount, 'юнит', 'юнита', 'юнитов')}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon={cover.icon}
                  iconColor={cover.color}
                  onPress={() => openBook(b.id)}
                  colors={colors}
                />
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // ── Каталог ──
  const renderCatalog = () => {
    if (!catalog) {
      if (catalogError) {
        return (
          <ErrorState
            title="Не удалось загрузить библиотеку"
            description="Проверьте интернет и попробуйте ещё раз."
            onRetry={() => fetchCatalog({ force: true })}
          />
        );
      }
      // Заготовки в форме блоков вместо спиннера (брендбук, 7.8)
      return (
        <View
          style={s.sections}
          accessibilityLabel="Загрузка библиотеки"
          accessibilityRole="progressbar"
        >
          <SkeletonCard height={150} />
          <View style={s.grid}>
            <SkeletonCard height={112} style={s.tile} />
            <SkeletonCard height={112} style={s.tile} />
          </View>
          <SkeletonCard height={180} />
        </View>
      );
    }
    if (subjects.length === 0 && catalog.books.length === 0) {
      return (
        <EmptyState
          icon={Library}
          title="Библиотека скоро наполнится"
          description="Мы готовим подборки наборов. Загляните чуть позже."
        />
      );
    }
    const next = catalog.continue;
    return (
      <View style={s.sections}>
        {next ? (
          <EntryCard
            overline="Продолжить подборку"
            collection={next.collection}
            note={`Следующий: ${next.next.title}`}
            action="Дальше"
            onPress={() => openCollection(next.collection)}
            colors={colors}
          />
        ) : catalog.start ? (
          <EntryCard
            overline="С чего начать"
            collection={catalog.start}
            note={`${setsCountLabel(catalog.start.setsCount)} от простого к сложному`}
            action="Открыть"
            onPress={() => openCollection(catalog.start!)}
            colors={colors}
          />
        ) : null}

        {subjects.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHead}>
              <Text variant="h3" style={{ color: colors.textPrimary }}>
                Предметы
              </Text>
              {subjects.length > MAX_TILES && (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={spacing.xs}
                  onPress={() => setShowAllSubjects((v) => !v)}
                >
                  <Text variant="label" style={{ color: colors.primary }}>
                    {showAllSubjects ? 'Свернуть' : 'Все предметы'}
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={s.grid}>
              {visibleSubjects.map((sub) => (
                <SubjectTile
                  key={sub.slug}
                  subject={sub}
                  onPress={() => openSubject(sub)}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        )}

        {catalog.books.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHead}>
              <Text variant="h3" style={{ color: colors.textPrimary }}>
                Учебники
              </Text>
              <BookOpen size={iconSize.s} color={colors.textTertiary} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.shelf}
              style={s.shelfBleed}
            >
              {catalog.books.map((b) => (
                <ShelfBook key={b.id} book={b} onPress={() => openBook(b.id)} colors={colors} />
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <Screen
      header={header}
      keyboard
      refreshControl={
        searching ? undefined : (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        )
      }
      scrollProps={{ keyboardShouldPersistTaps: 'handled', keyboardDismissMode: 'on-drag' }}
      contentStyle={s.content}
    >
      {searching ? renderSearch() : renderCatalog()}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    paddingBottom: spacing.s,
    gap: spacing.s,
  },
  content: { paddingTop: spacing.xs, paddingBottom: spacing.l },
  sections: { gap: spacing.l },
  section: { gap: spacing.s },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex1: { flex: 1 },
  semibold: { fontWeight: '600' },
  pressed: { opacity: 0.85 },
  /** Второстепенный текст на заливке primary: альфа-шаги брендбука — только 10/20/40. */
  dim: { opacity: 0.85 },

  entry: { borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.xs },
  entryBar: { flexDirection: 'row', gap: 3, height: 6, marginTop: spacing.xxs },
  entrySeg: { flex: 1, borderRadius: borderRadius.full },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.xxs },
  entryGo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  tile: { flexBasis: '47%', flexGrow: 1, gap: spacing.xxs },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconBoxSmall: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },

  shelfBleed: { marginHorizontal: -spacing.m },
  shelf: { paddingHorizontal: spacing.m, gap: spacing.s },
  book: { width: 116, gap: spacing.xxs },
  bookCover: {
    height: 148,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  searchSpinner: { marginTop: spacing.xl },
});
