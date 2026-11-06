/**
 * Предмет каталога (plan/new/library_catalog.md, Catalog 7): «Языки», «История», «География»…
 *
 * Не больше двух рядов выбора, под ними подборки:
 *  - L2 — чипы языка / раздела (если у предмета есть trackLabel и вариантов больше одного);
 *  - L3 — переключатель уровней (только непустые; один уровень — бейдж под заголовком вместо ряда);
 *  - подборки с «N наборов · добавлено k» и сегментной полоской добавленных;
 *  - у языков — «Учебники этого уровня» (книги с тем же языком и уровнем).
 * Последний выбор (раздел и уровень) запоминается на устройстве отдельно для каждого предмета и раздела.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/common';
import {
  Badge,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Screen,
  ScreenHeader,
  SegmentedProgressBar,
  SkeletonCard,
} from '@/components/ui';
import { useCatalogStore, useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { getCatalogIcon } from '@/constants/catalogIcons';
import { TOP_LANGUAGES } from '@/constants/languages';
import { StorageService, STORAGE_KEYS } from '@/services/StorageService';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import { BookService } from '@/services/BookService';
import { pluralize } from '@/utils';
import {
  addedLabel,
  bookMatchesLevel,
  levelLabel,
  setsCountLabel,
  trackName,
} from '@/utils/catalog';
import type { RootStackParamList } from '@/types/navigation';
import type { CatalogCollection, CatalogTrack } from '@/types/library';
import type { BookListItem } from '@/types/books';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'LibrarySubject'>;
type Colors = ReturnType<typeof useThemeColors>;

/** { [предмет]: { track, levels: { [track|'-']: level } } } */
type Selection = Record<string, { track: string | null; levels: Record<string, string> }>;
const trackKey = (track: string | null) => track ?? '-';

function readSelection(): Selection {
  try {
    return StorageService.getObject<Selection>(STORAGE_KEYS.LIBRARY_SELECTION) ?? {};
  } catch {
    return {};
  }
}

function saveSelection(subject: string, track: string | null, level: string | null) {
  const all = readSelection();
  const entry = all[subject] ?? { track: null, levels: {} };
  entry.track = track;
  if (level) entry.levels[trackKey(track)] = level;
  all[subject] = entry;
  StorageService.setObject(STORAGE_KEYS.LIBRARY_SELECTION, all);
}

const CollectionRow = memo(function CollectionRow({
  collection,
  current,
  onPress,
  colors,
}: {
  collection: CatalogCollection;
  current: boolean;
  onPress: () => void;
  colors: Colors;
}) {
  const Icon = getCatalogIcon(collection.icon);
  const { setsCount, addedCount } = collection;
  const meta =
    addedCount > 0
      ? `${setsCountLabel(setsCount)} · ${addedLabel(addedCount, setsCount)}`
      : setsCountLabel(setsCount);
  return (
    <Card
      onPress={onPress}
      tone={current ? 'selected' : 'default'}
      padding="s"
      accessibilityLabel={`${collection.title}. ${meta}`}
    >
      <View style={s.row}>
        <View style={[s.iconBox, { backgroundColor: alpha(colors.primary, 10) }]}>
          <Icon size={iconSize.s} color={colors.primary} />
        </View>
        <View style={s.rowBody}>
          <Text
            variant="body"
            style={[s.semibold, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {collection.title}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {meta}
          </Text>
          {addedCount > 0 && (
            <SegmentedProgressBar
              segments={[{ value: addedCount, color: colors.success }]}
              total={setsCount}
              accessibilityLabel={addedLabel(addedCount, setsCount)}
            />
          )}
        </View>
        <ChevronRight size={iconSize.s} color={colors.textTertiary} />
      </View>
    </Card>
  );
});

export function LibrarySubjectScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const colors = useThemeColors();
  const slug = params.slug;

  const entry = useCatalogStore((st) => st.subjects[slug]?.data ?? null);
  const error = useCatalogStore((st) => st.subjectError[slug] ?? null);
  const fetchSubject = useCatalogStore((st) => st.fetchSubject);
  const currentId = useCatalogStore((st) => st.catalog?.data.continue?.collection.id ?? null);

  const [track, setTrack] = useState<string | null | undefined>(undefined);
  const [level, setLevel] = useState<string | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchSubject(slug);
    }, [fetchSubject, slug])
  );

  // Все видимые учебники (а не 6 с полки) — для «Учебники этого уровня». Только у языков.
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const isLanguage = entry?.subject.setKind === 'language';
  useEffect(() => {
    if (!isLanguage || books) return;
    BookService.listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, [isLanguage, books]);

  // Языки — в привычном порядке приложения (английский, немецкий…): сервер сортирует их по коду.
  const tracks = useMemo<CatalogTrack[]>(() => {
    const list = entry?.tracks ?? [];
    if (entry?.subject.setKind !== 'language') return list;
    const rank = (code: string | null) => {
      const i = TOP_LANGUAGES.findIndex((l) => l.code === code);
      return i < 0 ? TOP_LANGUAGES.length : i;
    };
    return [...list].sort((a, b) => rank(a.key) - rank(b.key));
  }, [entry]);
  const subject = entry?.subject ?? null;

  // Раздел: выбранный → сохранённый → первый. Если сохранённого больше нет (подборки убрали) — первый.
  const activeTrack = useMemo<CatalogTrack | null>(() => {
    if (tracks.length === 0) return null;
    const wanted = track !== undefined ? track : readSelection()[slug]?.track;
    return tracks.find((t) => t.key === wanted) ?? tracks[0];
  }, [tracks, track, slug]);

  const levels = useMemo(() => activeTrack?.levels ?? [], [activeTrack]);
  const activeLevel = useMemo<string | null>(() => {
    if (levels.length === 0) return null;
    const wanted =
      level !== undefined && level !== null
        ? level
        : readSelection()[slug]?.levels[trackKey(activeTrack?.key ?? null)];
    return wanted && levels.includes(wanted) ? wanted : levels[0];
  }, [levels, level, slug, activeTrack]);

  // Запоминаем то, что реально показано, — в следующий раз откроется там же.
  useEffect(() => {
    if (!entry || !activeTrack) return;
    saveSelection(slug, activeTrack.key, activeLevel);
  }, [entry, slug, activeTrack, activeLevel]);

  const collections = useMemo(
    () =>
      (entry?.collections ?? []).filter(
        (c) =>
          c.track === (activeTrack?.key ?? null) &&
          (activeLevel === null || c.level === activeLevel)
      ),
    [entry, activeTrack, activeLevel]
  );

  const levelBooks = useMemo(() => {
    if (!books || subject?.setKind !== 'language' || !activeTrack?.key || !activeLevel) return [];
    return books.filter(
      (b) => b.languageFrom === activeTrack.key && bookMatchesLevel(b, activeLevel)
    );
  }, [books, subject, activeTrack, activeLevel]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSubject(slug, { force: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchSubject, slug]);

  const showTrackChips = !!subject?.trackLabel && tracks.length > 1;
  const showLevels = levels.length > 1;
  // Один вариант — ряд не рисуем, а говорим, что выбрано («Турецкий · уровень A1»).
  const badge = [
    subject?.trackLabel && tracks.length === 1 && activeTrack
      ? trackName({ track: activeTrack.key, trackTitle: activeTrack.title })
      : '',
    levels.length === 1 && activeLevel
      ? subject?.levelScale === 'cefr'
        ? `уровень ${activeLevel}`
        : levelLabel(activeLevel)
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const title = subject?.title ?? params.title ?? '';
  const header = <ScreenHeader title={title} onBack={() => navigation.goBack()} bordered />;

  let body: React.ReactNode;
  if (!entry) {
    body = error ? (
      <ErrorState
        title="Не удалось загрузить предмет"
        description="Проверьте интернет и попробуйте ещё раз."
        onRetry={() => fetchSubject(slug, { force: true })}
      />
    ) : (
      <View style={s.list} accessibilityLabel="Загрузка" accessibilityRole="progressbar">
        <SkeletonCard height={44} />
        <SkeletonCard height={76} />
        <SkeletonCard height={76} />
        <SkeletonCard height={76} />
      </View>
    );
  } else if (entry.collections.length === 0) {
    // Сервер прячет пустые предметы (404) — сюда попадём, только если всё убрали между загрузками.
    body = (
      <EmptyState
        icon={getCatalogIcon(subject?.icon)}
        title="Здесь пока пусто"
        description="Подборки по этому предмету скоро появятся."
      />
    );
  } else {
    body = (
      <View style={s.body}>
        {badge ? <Badge label={badge} tone="primary" style={s.badge} /> : null}

        {showTrackChips && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.chipsBleed}
            contentContainerStyle={s.chips}
            accessibilityLabel={subject?.trackLabel ?? undefined}
          >
            {tracks.map((t) => (
              <Chip
                key={trackKey(t.key)}
                label={trackName({ track: t.key, trackTitle: t.title })}
                selected={t.key === activeTrack?.key}
                onPress={() => {
                  setTrack(t.key);
                  setLevel(undefined);
                }}
              />
            ))}
          </ScrollView>
        )}

        {showLevels && (
          <View
            style={[s.levels, { backgroundColor: colors.surfaceMuted }]}
            accessibilityRole="tablist"
            accessibilityLabel="Уровень"
          >
            {levels.map((lv) => {
              const on = lv === activeLevel;
              return (
                <Pressable
                  key={lv}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => setLevel(lv)}
                  style={[s.level, on && { backgroundColor: colors.surface }]}
                >
                  <Text
                    variant="label"
                    numberOfLines={1}
                    style={{ color: on ? colors.primary : colors.textSecondary }}
                  >
                    {levelLabel(lv)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text variant="bodySmall" color="secondary">
          Выберите подборку. Внутри наборы идут от простого к сложному.
        </Text>

        <View style={s.list}>
          {collections.map((c) => (
            <CollectionRow
              key={c.id}
              collection={c}
              current={c.id === currentId}
              onPress={() =>
                navigation.navigate('LibraryCollection', { collectionId: c.id, title: c.title })
              }
              colors={colors}
            />
          ))}
        </View>

        {levelBooks.length > 0 && (
          <View style={s.list}>
            <Text variant="h3" style={{ color: colors.textPrimary }}>
              Учебники {levelLabel(activeLevel)}
            </Text>
            {levelBooks.map((b) => {
              const cover = getBookCover(b.subject);
              return (
                <Card
                  key={b.id}
                  padding="s"
                  onPress={() => navigation.navigate('BookDetail', { bookId: b.id })}
                  accessibilityLabel={`Учебник ${b.title}`}
                >
                  <View style={s.row}>
                    <View style={[s.iconBox, { backgroundColor: alpha(cover.color, 10) }]}>
                      <cover.icon size={iconSize.s} color={cover.color} />
                    </View>
                    <View style={s.rowBody}>
                      <Text
                        variant="body"
                        style={[s.semibold, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {b.title}
                      </Text>
                      <Text variant="caption" color="secondary" numberOfLines={1}>
                        {[
                          formatBookMeta(b),
                          `${b.unitsCount} ${pluralize(b.unitsCount, 'юнит', 'юнита', 'юнитов')}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <ChevronRight size={iconSize.s} color={colors.textTertiary} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
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
  badge: { alignSelf: 'flex-start' },
  chipsBleed: { marginHorizontal: -spacing.m, flexGrow: 0 },
  chips: { paddingHorizontal: spacing.m, gap: spacing.xs },
  levels: { flexDirection: 'row', borderRadius: borderRadius.m, padding: spacing.xxs, gap: 2 },
  level: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: borderRadius.s,
  },
  list: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  rowBody: { flex: 1, gap: spacing.xxs },
  semibold: { fontWeight: '600' },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
