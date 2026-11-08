/**
 * Набор библиотеки (plan/new/library_catalog.md, Catalog 8).
 *
 * Короткое превью, чтобы понять, подходит ли набор, и одна главная кнопка:
 *  - путь подборки («Английский · A2 · Путешествия»), «Набор k из N», число карточек;
 *  - первые 5 карточек;
 *  - «Добавить в мои наборы» → после добавления «Добавлен» и «Открыть у себя»;
 *  - у кого есть свои курсы — «В мой курс» (выбор курса в нижнем листе);
 *  - «Дальше по порядку» — следующий набор подборки.
 * Автора, рейтинга, лайков, оценки, «Пожаловаться» и счётчика скачиваний нет (решение 8):
 * каталог ведёт команда. Сервер для старых версий эти действия ещё принимает.
 *
 * Гость (анонимный вход) сохраняет набор только на устройстве — без записи в базу.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ArrowRight, Check, ExternalLink, Plus, Users } from 'lucide-react-native';
import { v4 as uuid } from 'uuid';
import { Text } from '@/components/common';
import {
  Badge,
  Button,
  Card,
  CategoryIcon,
  ErrorState,
  Screen,
  ScreenHeader,
  toast,
} from '@/components/ui';
import { ChooseCourseSheet } from '@/components/library/ChooseCourseSheet';
import {
  useCardsStore,
  useCatalogStore,
  useCoursesStore,
  useLibraryStore,
  useSetsStore,
  useSettingsStore,
  useThemeColors,
} from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { getCatalogIcon } from '@/constants/catalogIcons';
import { LibraryService } from '@/services/LibraryService';
import { getSession } from '@/services/auth/session';
import { DatabaseService } from '@/services/DatabaseService';
import { describeError } from '@/utils/userErrors';
import { parseSetKind } from '@/utils/setKind';
import { cardsCountLabel, collectionPath, levelLabel } from '@/utils/catalog';
import type { CardSet } from '@/types';
import type { LibrarySet } from '@/types/library';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'LibrarySetDetail'>;

/** Превью: первые карточки — сколько показываем. Сервер отдаёт до 10. */
const PREVIEW_CARDS = 5;

/** Отметить «добавлен» в старом сторе: экран читает из него, старые списки — тоже. */
function markImportedInLibraryStore(librarySetId: string) {
  useLibraryStore.setState((st) => {
    const mark = (list: LibrarySet[]) =>
      list.forEach((x) => {
        if (x.id === librarySetId) x.is_imported = true;
      });
    mark(st.trendingSets);
    mark(st.topRatedSets);
    mark(st.recentSets);
    if (st.currentSet?.id === librarySetId) st.currentSet.is_imported = true;
  });
}

export function LibrarySetDetailScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();

  const currentSet = useLibraryStore((st) => st.currentSet);
  const isLoading = useLibraryStore((st) => st.isLoading);
  const loadError = useLibraryStore((st) => st.error);
  const fetchSetDetail = useLibraryStore((st) => st.fetchSetDetail);
  const importSet = useCatalogStore((st) => st.importSet);
  const fetchCollection = useCatalogStore((st) => st.fetchCollection);

  const set = currentSet?.id === setId ? currentSet : null;
  const collectionId = set?.collection_id ?? null;
  const collection = useCatalogStore((st) =>
    collectionId ? (st.collections[collectionId]?.data ?? null) : null
  );

  const [userId, setUserId] = useState<string | undefined>();
  const [isGuest, setIsGuest] = useState(false);
  const [importing, setImporting] = useState(false);
  const [courseSheet, setCourseSheet] = useState(false);

  const isTeacher = useSettingsStore((st) => st.isTeacher) === true;
  const allCourses = useCoursesStore((st) => st.courses);
  const activeCourseId = useCoursesStore((st) => st.activeCourseId);
  // Добавить набор можно только в свой курс (не в курс, где пользователь ученик).
  const ownCourses = useMemo(() => allCourses.filter((c) => !c.isStudentCourse), [allCourses]);
  const defaultCourseId = ownCourses.some((c) => c.id === activeCourseId)
    ? activeCourseId
    : (ownCourses[0]?.id ?? null);

  useEffect(() => {
    getSession().then((session) => {
      const uid = session?.user?.id;
      setUserId(uid);
      setIsGuest((session?.user as { is_anonymous?: boolean } | undefined)?.is_anonymous === true);
      fetchSetDetail(setId, uid);
    });
  }, [setId, fetchSetDetail]);

  // Подборка набора — для пути, «Набор k из N» и следующего набора (из кэша каталога, если есть).
  useEffect(() => {
    if (collectionId) fetchCollection(collectionId);
  }, [collectionId, fetchCollection]);

  const place = useMemo(() => {
    if (!collection) return null;
    const i = collection.sets.findIndex((x) => x.id === setId);
    if (i < 0) return null;
    return { index: i, total: collection.sets.length, next: collection.sets[i + 1] ?? null };
  }, [collection, setId]);

  // Гость — сохраняем набор локально, без записи в базу (у гостя её нет).
  const importAsGuest = useCallback(async () => {
    if (!userId || !set) return;
    setImporting(true);
    try {
      const libCards = await LibraryService.getLibraryCards(set.id);
      const now = Date.now();
      const newSetId = uuid();
      const newSet: CardSet = {
        id: newSetId,
        userId,
        courseId: null,
        title: set.title,
        description: set.description || '',
        // Категория библиотеки шире SetCategory — как и раньше, берём как есть (иконка найдёт или «общая»)
        category: (set.category || 'general') as CardSet['category'],
        tags: [],
        icon: undefined,
        color: undefined,
        languageFrom: set.language_from || 'en',
        languageTo: set.language_to || 'ru',
        kind: parseSetKind(set.kind),
        isPublic: false,
        createdAt: now,
        updatedAt: now,
        lastStudiedAt: undefined,
        cardCount: libCards.length,
        newCount: libCards.length,
        learningCount: 0,
        reviewCount: 0,
        masteredCount: 0,
        isFavorite: false,
        isArchived: false,
      };
      // Пишем в стор напрямую, минуя очередь синхронизации (у гостя нет записи в базе)
      const setsState = useSetsStore.getState();
      useSetsStore.setState({
        sets: { ...setsState.sets, [newSetId]: newSet },
        setsOrder: [newSetId, ...setsState.setsOrder],
      });
      DatabaseService.saveSets();

      const cardsState = useCardsStore.getState();
      const cards = { ...cardsState.cards };
      const bySet = { ...cardsState.cardsBySet, [newSetId]: [] as string[] };
      for (const c of libCards) {
        const id = uuid();
        cards[id] = {
          id,
          setId: newSetId,
          frontText: c.front,
          backText: c.back,
          example: c.hint ?? undefined,
          createdAt: now,
          updatedAt: now,
          learningStep: 0,
          nextReviewDate: now,
          lastReviewDate: 0,
          status: 'new' as const,
        };
        bySet[newSetId].push(id);
      }
      useCardsStore.setState({ cards, cardsBySet: bySet });
      DatabaseService.saveCards();

      markImportedInLibraryStore(set.id);
      toast.success('Набор сохранён на устройстве');
    } catch (err) {
      toast.error(describeError(err, 'Не удалось сохранить набор'));
    } finally {
      setImporting(false);
    }
  }, [userId, set]);

  /** courseId = null — себе в «Мои наборы», иначе — в свой курс. */
  const importInto = useCallback(
    async (courseId: string | null) => {
      if (!set) return;
      if (isGuest && !courseId) return importAsGuest();
      setImporting(true);
      try {
        await importSet(set.id, courseId);
        if (!courseId) markImportedInLibraryStore(set.id);
        setCourseSheet(false);
        const course = courseId ? ownCourses.find((c) => c.id === courseId) : undefined;
        toast.success(course ? `Набор добавлен в «${course.title}»` : 'Набор в «Моих наборах»');
        // Подтянуть новый набор в «Мои наборы»
        DatabaseService.loadAll().catch(() => {});
      } catch (err) {
        toast.error(describeError(err, 'Не удалось добавить набор'));
      } finally {
        setImporting(false);
      }
    },
    [set, isGuest, importAsGuest, importSet, ownCourses]
  );

  const header = <ScreenHeader onBack={() => navigation.goBack()} bordered />;

  if (!set) {
    return (
      <Screen header={header} scroll={false}>
        {isLoading || !loadError ? (
          <View style={s.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ErrorState
            title="Не удалось открыть набор"
            description="Возможно, его убрали из библиотеки. Проверьте интернет и попробуйте ещё раз."
            onRetry={() => fetchSetDetail(setId, userId)}
          />
        )}
      </Screen>
    );
  }

  const path = collection
    ? [collectionPath(collection.collection), collection.collection.title]
        .filter(Boolean)
        .join(' · ')
    : '';
  const Icon = collection ? getCatalogIcon(collection.collection.icon) : null;
  const preview = (set.preview_cards ?? []).slice(0, PREVIEW_CARDS);
  const level = collection?.collection.level;

  const footer = (
    <View style={s.footer}>
      {set.is_imported ? (
        <>
          <Button
            title="Добавлен в «Мои наборы»"
            icon={Check}
            variant="secondary"
            fullWidth
            disabled
          />
          <Button
            title="Открыть у себя"
            icon={ExternalLink}
            variant="quiet"
            fullWidth
            onPress={() => navigation.navigate('Main', { screen: 'Home' } as never)}
          />
        </>
      ) : (
        <Button
          title="Добавить в мои наборы"
          icon={Plus}
          fullWidth
          loading={importing && !courseSheet}
          onPress={() => importInto(null)}
        />
      )}
      {ownCourses.length > 0 && !isGuest && (
        <Button
          title="В мой курс"
          icon={Users}
          variant="quiet"
          fullWidth
          onPress={() => setCourseSheet(true)}
        />
      )}
    </View>
  );

  return (
    <>
      <Screen header={header} footer={footer} contentStyle={s.content}>
        <View style={s.hero}>
          <View style={[s.heroIcon, { backgroundColor: alpha(colors.primary, 10) }]}>
            {Icon ? (
              <Icon size={iconSize.l} color={colors.primary} />
            ) : (
              <CategoryIcon category={set.category} size="l" />
            )}
          </View>
          <Text variant="h2" style={{ color: colors.textPrimary }}>
            {set.title}
          </Text>
          {path ? (
            <Text variant="bodySmall" color="secondary">
              {path}
            </Text>
          ) : null}
          <View style={s.meta}>
            <Badge label={cardsCountLabel(set.cards_count)} tone="neutral" />
            {level ? <Badge label={levelLabel(level)} tone="primary" /> : null}
            {place ? (
              <Badge label={`Набор ${place.index + 1} из ${place.total}`} tone="neutral" />
            ) : null}
          </View>
          {set.description ? (
            <Text variant="body" color="secondary">
              {set.description}
            </Text>
          ) : null}
        </View>

        {preview.length > 0 && (
          <View style={s.section}>
            <Text variant="overline" color="secondary">
              Первые карточки
            </Text>
            <Card padding="none">
              {preview.map((card, i) => (
                <View
                  key={card.id || i}
                  style={[
                    s.previewRow,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    variant="body"
                    style={[s.previewFront, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {card.front}
                  </Text>
                  <Text
                    variant="body"
                    color="secondary"
                    style={s.previewBack}
                    numberOfLines={2}
                    align="right"
                  >
                    {card.back}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {place?.next && (
          <View style={s.section}>
            <Text variant="overline" color="secondary">
              Дальше по порядку
            </Text>
            <Card
              padding="s"
              onPress={() => navigation.push('LibrarySetDetail', { setId: place.next!.id })}
              accessibilityLabel={`Следующий набор: ${place.next.title}`}
            >
              <View style={s.nextRow}>
                <View style={[s.num, { backgroundColor: colors.surfaceMuted }]}>
                  <Text variant="label" color="secondary">
                    {place.index + 2}
                  </Text>
                </View>
                <View style={s.flex1}>
                  <Text
                    variant="body"
                    style={[s.semibold, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {place.next.title}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {cardsCountLabel(place.next.cardsCount)}
                  </Text>
                </View>
                {place.next.isImported ? (
                  <Badge label="Добавлен" tone="success" />
                ) : (
                  <ArrowRight size={iconSize.s} color={colors.textTertiary} />
                )}
              </View>
            </Card>
          </View>
        )}
      </Screen>

      <ChooseCourseSheet
        visible={courseSheet}
        setTitle={set.title}
        title={`«${set.title}» в курс`}
        courses={ownCourses}
        initialCourseId={defaultCourseId}
        isSubmitting={importing}
        showStudentsHint={isTeacher}
        allowNoCourse={false}
        onClose={() => setCourseSheet(false)}
        onSubmit={importInto}
      />
    </>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: spacing.m, paddingBottom: spacing.l, gap: spacing.l },
  hero: { gap: spacing.xs },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xxs },
  section: { gap: spacing.xs },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  previewFront: { flex: 1, fontWeight: '600' },
  previewBack: { flex: 1 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  num: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: { flex: 1 },
  semibold: { fontWeight: '600' },
  footer: { gap: spacing.xs },
});
