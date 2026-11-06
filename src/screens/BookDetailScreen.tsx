/**
 * Учебник (plan/book_catalog_plan.md, часть 4; plan/new/library_catalog.md, Catalog 9).
 *
 * Устроен как подборка: юниты по порядку книги, «добавлено k из N».
 *  - «Добавить» кладёт юнит в «Мои наборы» без копии — это сам официальный набор книги (решение
 *    06.11.2026): прогресс личный (card_progress), исправления в книге доходят до ученика, дублей нет.
 *  - «Добавлен» — юнит уже в «Моих наборах»; «Есть в курсе» — юнит открыт ученику в его курсе
 *    (тот же набор, второй раз добавлять нечего).
 *  - Нажатие на юнит — открыть и учить (как раньше).
 *  - Учитель: «Подключить к курсу» (course_books), юниты затем открывают в «Учебниках курса».
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BookOpen, Check, Link2, Plus } from 'lucide-react-native';
import { Text } from '@/components/common';
import { AttachToCoursesSheet } from '@/components/books/AttachToCoursesSheet';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  ScreenHeader,
  SegmentedProgressBar,
  SkeletonCard,
  toast,
} from '@/components/ui';
import { useCoursesStore, useSetsStore, useSettingsStore, useThemeColors } from '@/store';
import { alpha, borderRadius, getLanguageDef, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { BookService } from '@/services/BookService';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import { confirmAction } from '@/utils/dialogs';
import { describeError } from '@/utils/userErrors';
import type { BookDetail, BookUnit } from '@/types/books';
import type { CardSet } from '@/types';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'BookDetail'>;
type Colors = ReturnType<typeof useThemeColors>;
type UnitState = 'none' | 'added' | 'course';

/** Где юнит у пользователя: набор юнита уже в сторе — сам или открыт через курс. */
function unitState(unit: BookUnit, sets: Record<string, CardSet>): UnitState {
  const set = unit.sets[0] ? sets[unit.sets[0].id] : undefined;
  if (!set) return 'none';
  if ((set.officialCourseIds?.length ?? 0) > 0 || set.courseId) return 'course';
  return 'added';
}

const UnitRow = memo(function UnitRow({
  unit,
  state,
  isNext,
  busy,
  onOpen,
  onAdd,
  colors,
}: {
  unit: BookUnit;
  state: UnitState;
  isNext: boolean;
  busy: boolean;
  onOpen: () => void;
  onAdd: () => void;
  colors: Colors;
}) {
  const words = unit.sets.reduce((acc, x) => acc + x.totalCards, 0);
  const hasSet = unit.sets.length > 0;
  const meta = [
    unit.pages ? `стр. ${unit.pages}` : null,
    `${words} ${pluralize(words, 'слово', 'слова', 'слов')}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const done = state !== 'none';
  return (
    <Card
      onPress={hasSet ? onOpen : undefined}
      disabled={!hasSet}
      padding="s"
      tone={isNext ? 'selected' : 'default'}
      accessibilityLabel={`Юнит ${unit.number}. ${unit.title}. ${meta}`}
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
              {unit.number}
            </Text>
          )}
        </View>
        <View style={s.rowBody}>
          <Text
            variant="body"
            style={[s.semibold, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {unit.title}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {state === 'course' ? (
          <Badge label="Есть в курсе" tone="primary" />
        ) : state === 'added' ? (
          <Badge label="Добавлен" tone="success" />
        ) : hasSet ? (
          <Button
            title="Добавить"
            size="s"
            variant={isNext ? 'primary' : 'secondary'}
            loading={busy}
            onPress={onAdd}
            accessibilityLabel={`Добавить юнит ${unit.number}`}
          />
        ) : null}
      </View>
    </Card>
  );
});

export function BookDetailScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const colors = useThemeColors();
  const isTeacher = useSettingsStore((st) => st.isTeacher) === true;
  const courses = useCoursesStore((st) => st.courses);
  const sets = useSetsStore((st) => st.sets);

  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busySetId, setBusySetId] = useState<string | null>(null);
  const [attachVisible, setAttachVisible] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setFailed(false);
    const result = await BookService.getBookDetail(bookId);
    setDetail(result);
    setFailed(result === null);
    setIsLoading(false);
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);

  const units = useMemo(() => detail?.units ?? [], [detail]);
  const states = useMemo(() => units.map((u) => unitState(u, sets)), [units, sets]);
  const withSets = units.filter((u) => u.sets.length > 0).length;
  const added = states.filter((x) => x !== 'none').length;
  const nextIndex = units.findIndex((u, i) => u.sets.length > 0 && states[i] === 'none');
  const next = nextIndex >= 0 ? units[nextIndex] : null;

  /** Положить набор юнита в сторы: так он появляется в «Моих наборах» (без копии). */
  const fetchUnit = useCallback(async (unit: BookUnit): Promise<string | null> => {
    const set = unit.sets[0];
    if (!set) return null;
    setBusySetId(set.id);
    const ok = await BookService.openOfficialSet(set.id);
    setBusySetId(null);
    if (!ok) {
      toast.error('Не удалось загрузить юнит. Проверьте интернет и попробуйте ещё раз');
      return null;
    }
    return set.id;
  }, []);

  const openUnit = useCallback(
    async (unit: BookUnit) => {
      if (busySetId) return;
      const setId = await fetchUnit(unit);
      if (setId) navigation.navigate('SetDetail', { setId });
    },
    [busySetId, fetchUnit, navigation]
  );

  const addUnit = useCallback(
    async (unit: BookUnit) => {
      if (busySetId) return;
      if (await fetchUnit(unit)) toast.success(`Юнит ${unit.number} в «Моих наборах»`);
    },
    [busySetId, fetchUnit]
  );

  const attachToCourses = useCallback(
    async (courseIds: string[]) => {
      if (!detail) return;
      setAttaching(true);
      const result = await BookService.attachToCourses(detail.book.id, courseIds);
      setAttaching(false);
      if (!result.ok) {
        toast.error(
          `Не удалось подключить. ${result.status === 403 ? 'Можно подключать только к своим курсам.' : describeError(result.error, 'Попробуйте ещё раз.')}`
        );
        return;
      }
      const attached = [...result.data.attachedCourseIds, ...result.data.alreadyAttachedCourseIds];
      setDetail((prev) =>
        prev
          ? { ...prev, attachedCourseIds: [...new Set([...prev.attachedCourseIds, ...attached])] }
          : prev
      );
      setAttachVisible(false);

      const titles = courses.filter((c) => attached.includes(c.id)).map((c) => c.title);
      const single = attached.length === 1 ? courses.find((c) => c.id === attached[0]) : undefined;
      const message = `${titles.join(', ')}. Все юниты пока закрыты — откройте их в «Учебниках курса».`;
      if (!single) {
        toast.success(`Книга подключена: ${message}`);
        return;
      }
      if (
        await confirmAction('Книга подключена', message, 'Открыть юниты', { cancelText: 'Позже' })
      ) {
        navigation.navigate('CourseBooks', { courseId: single.id, courseTitle: single.title });
      }
    },
    [detail, courses, navigation]
  );

  const header = <ScreenHeader onBack={() => navigation.goBack()} bordered />;

  if (isLoading || failed || !detail) {
    return (
      <Screen header={header} contentStyle={s.content}>
        {isLoading ? (
          <View style={s.list} accessibilityLabel="Загрузка" accessibilityRole="progressbar">
            <SkeletonCard height={120} />
            <SkeletonCard height={64} />
            <SkeletonCard height={64} />
          </View>
        ) : (
          <ErrorState
            title="Книга недоступна"
            description="Не удалось загрузить книгу. Проверьте интернет и попробуйте ещё раз."
            onRetry={load}
          />
        )}
      </Screen>
    );
  }

  const { book } = detail;
  const cover = getBookCover(book.subject);
  const langDef = getLanguageDef(book.languageFrom, book.languageTo);
  const totalWords = units.reduce(
    (sum, u) => sum + u.sets.reduce((acc, x) => acc + x.totalCards, 0),
    0
  );
  const meta = [formatBookMeta(book), langDef ? langDef.label : null, book.publisher]
    .filter(Boolean)
    .join(' · ');

  const footer = next ? (
    <Button
      title={`Добавить следующий: юнит ${next.number}`}
      icon={Plus}
      fullWidth
      loading={busySetId === next.sets[0]?.id}
      onPress={() => addUnit(next)}
    />
  ) : undefined;

  return (
    <>
      <Screen header={header} footer={footer} contentStyle={s.content}>
        <View style={s.hero}>
          <View style={[s.cover, { backgroundColor: alpha(cover.color, 10) }]}>
            <cover.icon size={iconSize.xl} color={cover.color} />
          </View>
          <View style={s.heroBody}>
            <Text variant="h2" style={{ color: colors.textPrimary }}>
              {book.title}
            </Text>
            {meta ? (
              <Text variant="bodySmall" color="secondary">
                {meta}
              </Text>
            ) : null}
            <View style={s.badges}>
              <Badge
                label={`${units.length} ${pluralize(units.length, 'юнит', 'юнита', 'юнитов')}`}
                tone="neutral"
              />
              <Badge
                label={`${totalWords} ${pluralize(totalWords, 'слово', 'слова', 'слов')}`}
                tone="neutral"
              />
              {!book.isPublished && <Badge label="Черновик — видно только админу" tone="warning" />}
            </View>
          </View>
        </View>

        {isTeacher && book.isPublished && (
          <View style={s.teacher}>
            <Button
              title="Подключить к курсу"
              icon={Link2}
              variant="secondary"
              fullWidth
              onPress={() => setAttachVisible(true)}
            />
            <Text variant="caption" color="secondary">
              {detail.attachedCourseIds.length > 0
                ? `Подключена к курсам: ${detail.attachedCourseIds.length}. Юниты открывают в «Учебниках курса».`
                : 'Ученики курса увидят юниты, которые вы откроете.'}
            </Text>
          </View>
        )}

        {units.length === 0 ? (
          <EmptyState
            compact
            icon={BookOpen}
            title="В книге пока нет юнитов"
            description="Юниты появятся, когда книгу наполнят."
          />
        ) : (
          <>
            {withSets > 0 && (
              <Card>
                <View style={s.summaryHead}>
                  <Text variant="body" style={[s.semibold, { color: colors.textPrimary }]}>
                    Добавлено {added} из {withSets}
                  </Text>
                  <Text variant="caption" color="secondary">
                    юниты по порядку книги
                  </Text>
                </View>
                <SegmentedProgressBar
                  segments={[{ value: added, color: colors.success }]}
                  total={withSets}
                  accessibilityLabel={`добавлено ${added} из ${withSets}`}
                  style={s.summaryBar}
                />
              </Card>
            )}
            <View style={s.list}>
              {units.map((unit, i) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  state={states[i]}
                  isNext={i === nextIndex}
                  busy={busySetId !== null && busySetId === unit.sets[0]?.id}
                  onOpen={() => openUnit(unit)}
                  onAdd={() => addUnit(unit)}
                  colors={colors}
                />
              ))}
            </View>
          </>
        )}
      </Screen>

      <AttachToCoursesSheet
        visible={attachVisible}
        bookTitle={book.title}
        attachedCourseIds={detail.attachedCourseIds}
        isSubmitting={attaching}
        onClose={() => setAttachVisible(false)}
        onSubmit={attachToCourses}
        onCreateCourse={() => {
          setAttachVisible(false);
          toast.info('Создайте курс в меню курсов на главном экране, а потом вернитесь к книге');
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  content: { paddingTop: spacing.m, paddingBottom: spacing.l, gap: spacing.m },
  hero: { flexDirection: 'row', gap: spacing.m, alignItems: 'flex-start' },
  heroBody: { flex: 1, gap: spacing.xxs },
  cover: {
    width: 88,
    height: 116,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  teacher: { gap: spacing.xs },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  summaryBar: { marginTop: spacing.xs },
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
});
