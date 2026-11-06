/**
 * Подборка каталога (plan/new/library_catalog.md, Catalog 8): «Английский · A2 · Путешествия».
 *
 * Наборы по порядку от простого к сложному, замков нет — добавить можно любой:
 *  - галочка у добавленных, рамка и главная кнопка — у следующего недобавленного;
 *  - «Добавить» в строке копирует набор в «Мои наборы» (личный импорт), нажатие на строку — превью;
 *  - у кого есть свои курсы (учитель) — «Подборку в мой курс»: всё одной транзакцией, уже лежащие
 *    в курсе наборы сервер пропускает.
 * Гость (анонимный вход) сохраняет набор только на устройстве — это делает экран набора, поэтому
 * его «Добавить» открывает экран набора.
 * Прогресс обучения не считаем — только «добавлено k из N».
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Check, Plus, Users } from 'lucide-react-native';
import { Text } from '@/components/common';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Screen,
  ScreenHeader,
  SegmentedProgressBar,
  SkeletonCard,
  toast,
} from '@/components/ui';
import { ChooseCourseSheet } from '@/components/library/ChooseCourseSheet';
import { useCatalogStore, useCoursesStore, useSettingsStore, useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { getSession } from '@/services/auth/session';
import { DatabaseService } from '@/services/DatabaseService';
import { describeError } from '@/utils/userErrors';
import { addedLabel, cardsCountLabel, collectionPath } from '@/utils/catalog';
import type { RootStackParamList } from '@/types/navigation';
import type { CatalogSet } from '@/types/library';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'LibraryCollection'>;
type Colors = ReturnType<typeof useThemeColors>;

const SetRow = memo(function SetRow({
  set,
  index,
  isNext,
  adding,
  onOpen,
  onAdd,
  colors,
}: {
  set: CatalogSet;
  index: number;
  isNext: boolean;
  adding: boolean;
  onOpen: () => void;
  onAdd: () => void;
  colors: Colors;
}) {
  const done = set.isImported;
  return (
    <Card
      onPress={onOpen}
      padding="s"
      tone={isNext ? 'selected' : 'default'}
      accessibilityLabel={`${index + 1}. ${set.title}. ${cardsCountLabel(set.cardsCount)}${done ? '. Добавлен' : ''}`}
    >
      <View style={s.row}>
        <View
          style={[
            s.num,
            {
              backgroundColor: done
                ? colors.success
                : isNext
                  ? alpha(colors.primary, 10)
                  : colors.surfaceMuted,
            },
          ]}
        >
          {done ? (
            <Check size={18} color={colors.onPrimary} strokeWidth={3} />
          ) : (
            <Text variant="label" style={{ color: isNext ? colors.primary : colors.textSecondary }}>
              {index + 1}
            </Text>
          )}
        </View>
        <View style={s.rowBody}>
          <Text
            variant="body"
            style={[s.semibold, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {set.title}
          </Text>
          <Text variant="caption" color="secondary">
            {cardsCountLabel(set.cardsCount)}
          </Text>
        </View>
        {done ? (
          <Badge label="Добавлен" tone="success" />
        ) : (
          <Button
            title="Добавить"
            size="s"
            variant={isNext ? 'primary' : 'secondary'}
            loading={adding}
            onPress={onAdd}
            accessibilityLabel={`Добавить «${set.title}»`}
          />
        )}
      </View>
    </Card>
  );
});

export function LibraryCollectionScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const colors = useThemeColors();
  const id = params.collectionId;

  const entry = useCatalogStore((st) => st.collections[id]?.data ?? null);
  const error = useCatalogStore((st) => st.collectionError[id] ?? null);
  const fetchCollection = useCatalogStore((st) => st.fetchCollection);
  const importSet = useCatalogStore((st) => st.importSet);
  const importCollection = useCatalogStore((st) => st.importCollection);

  const isTeacher = useSettingsStore((st) => st.isTeacher) === true;
  const allCourses = useCoursesStore((st) => st.courses);
  const activeCourseId = useCoursesStore((st) => st.activeCourseId);
  // Класть можно только в свой курс (не туда, где пользователь ученик).
  const ownCourses = useMemo(() => allCourses.filter((c) => !c.isStudentCourse), [allCourses]);
  const defaultCourseId = ownCourses.some((c) => c.id === activeCourseId)
    ? activeCourseId
    : (ownCourses[0]?.id ?? null);

  const [isGuest, setIsGuest] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [courseSheet, setCourseSheet] = useState(false);
  const [toCourse, setToCourse] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getSession().then((session) => {
      setIsGuest((session?.user as { is_anonymous?: boolean } | undefined)?.is_anonymous === true);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCollection(id);
    }, [fetchCollection, id])
  );

  const sets = useMemo(() => entry?.sets ?? [], [entry]);
  const total = sets.length;
  const added = sets.filter((x) => x.isImported).length;
  const next = sets.find((x) => !x.isImported) ?? null;
  const cards = sets.reduce((sum, x) => sum + x.cardsCount, 0);

  const openSet = useCallback(
    (setId: string) => navigation.navigate('LibrarySetDetail', { setId }),
    [navigation]
  );

  const addSet = useCallback(
    async (set: CatalogSet) => {
      if (isGuest) {
        openSet(set.id);
        return;
      }
      setAddingId(set.id);
      try {
        await importSet(set.id);
        toast.success(`«${set.title}» в «Моих наборах»`);
        // Подтянуть новый набор в «Мои наборы» (как при импорте с экрана набора)
        DatabaseService.loadAll().catch(() => {});
      } catch (err) {
        toast.error(describeError(err, 'Не удалось добавить набор'));
      } finally {
        setAddingId(null);
      }
    },
    [isGuest, importSet, openSet]
  );

  const addToCourse = useCallback(
    async (courseId: string | null) => {
      if (!courseId || !entry) return;
      setToCourse(true);
      try {
        const res = await importCollection(entry.collection.id, courseId);
        setCourseSheet(false);
        const course = ownCourses.find((c) => c.id === courseId);
        const where = course ? `«${course.title}»` : 'курс';
        toast.success(
          res.imported.length === 0
            ? `Все наборы уже есть в ${where}`
            : `В ${where} добавлено наборов: ${res.imported.length}`
        );
        DatabaseService.loadAll().catch(() => {});
      } catch (err) {
        toast.error(describeError(err, 'Не удалось добавить подборку'));
      } finally {
        setToCourse(false);
      }
    },
    [entry, importCollection, ownCourses]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchCollection(id, { force: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchCollection, id]);

  const title = entry?.collection.title ?? params.title ?? '';
  const path = entry ? collectionPath(entry.collection) : '';

  const header = <ScreenHeader title={title} onBack={() => navigation.goBack()} bordered />;

  const footer = entry ? (
    <View style={s.footer}>
      {next ? (
        <Button
          title={`Добавить следующий: ${next.title}`}
          icon={Plus}
          fullWidth
          loading={addingId === next.id}
          onPress={() => addSet(next)}
        />
      ) : (
        <Button
          title="Все наборы подборки добавлены"
          icon={Check}
          variant="secondary"
          fullWidth
          disabled
        />
      )}
      {ownCourses.length > 0 && !isGuest && (
        <Button
          title="Подборку в мой курс"
          icon={Users}
          variant="quiet"
          fullWidth
          onPress={() => setCourseSheet(true)}
        />
      )}
    </View>
  ) : undefined;

  let body: React.ReactNode;
  if (!entry) {
    body = error ? (
      <ErrorState
        title="Не удалось загрузить подборку"
        description="Проверьте интернет и попробуйте ещё раз."
        onRetry={() => fetchCollection(id, { force: true })}
      />
    ) : (
      <View style={s.list} accessibilityLabel="Загрузка" accessibilityRole="progressbar">
        <SkeletonCard height={96} />
        <SkeletonCard height={64} />
        <SkeletonCard height={64} />
        <SkeletonCard height={64} />
      </View>
    );
  } else {
    body = (
      <View style={s.body}>
        {path ? (
          <Text variant="bodySmall" color="secondary">
            {[entry.collection.subjectTitle, path].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        <Card>
          <View style={s.summaryHead}>
            <Text variant="body" style={[s.semibold, { color: colors.textPrimary }]}>
              Добавлено {added} из {total}
            </Text>
            <Text variant="caption" color="secondary">
              {cardsCountLabel(cards)}
            </Text>
          </View>
          <SegmentedProgressBar
            segments={[{ value: added, color: colors.success }]}
            total={Math.max(total, 1)}
            accessibilityLabel={addedLabel(added, total)}
            style={s.summaryBar}
          />
          <Text variant="caption" color="secondary">
            Наборы идут от простого к сложному. Начать можно с любого.
          </Text>
        </Card>

        <View style={s.list}>
          {sets.map((set, i) => (
            <SetRow
              key={set.id}
              set={set}
              index={i}
              isNext={next?.id === set.id}
              adding={addingId === set.id}
              onOpen={() => openSet(set.id)}
              onAdd={() => addSet(set)}
              colors={colors}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <>
      <Screen
        header={header}
        footer={footer}
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
      <ChooseCourseSheet
        visible={courseSheet}
        setTitle={title}
        title={`Подборку «${title}» в курс`}
        courses={ownCourses}
        initialCourseId={defaultCourseId}
        isSubmitting={toCourse}
        showStudentsHint={isTeacher}
        allowNoCourse={false}
        onClose={() => setCourseSheet(false)}
        onSubmit={addToCourse}
      />
    </>
  );
}

const s = StyleSheet.create({
  content: { paddingTop: spacing.s, paddingBottom: spacing.l },
  body: { gap: spacing.m },
  list: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  rowBody: { flex: 1, gap: 2 },
  semibold: { fontWeight: '600' },
  num: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  summaryBar: { marginVertical: spacing.xs },
  footer: { gap: spacing.xs },
});
