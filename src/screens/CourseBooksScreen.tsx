/**
 * Course Books Screen
 * @description «Учебники курса» (учитель): подключённые книги и план юнитов этой группы —
 * переключатель «Открыт» у каждого юнита. У каждого курса свой план.
 * План: plan/book_catalog_plan.md, часть 5.
 */
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Library, MoreHorizontal, Plus, AlertTriangle } from 'lucide-react-native';
import { Text, Container } from '@/components/common';
import { Badge, Button, EmptyState, ErrorState, ScreenHeader, Switch, toast } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, iconSize, screenPadding, alpha } from '@/constants';
import { pluralize } from '@/utils';
import { BookService } from '@/services/BookService';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import { confirmAction } from '@/utils/dialogs';
import type { CoursePlan, CoursePlanBook, CoursePlanUnit } from '@/types/books';
import type { RootStackScreenProps } from '@/types/navigation';
import { describeError } from '@/utils/userErrors';

type Props = RootStackScreenProps<'CourseBooks'>;

export function CourseBooksScreen({ navigation, route }: Props) {
  const { courseId } = route.params;
  const courseTitle = route.params.courseTitle || 'Курс';
  const colors = useThemeColors();

  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pendingUnitIds, setPendingUnitIds] = useState<string[]>([]);
  const [openingSetId, setOpeningSetId] = useState<string | null>(null);


  const load = useCallback(async () => {
    setFailed(false);
    const result = await BookService.getCoursePlan(courseId);
    setPlan(result);
    setFailed(result === null);
    setIsLoading(false);
  }, [courseId]);

  // Перезагружаем при возврате на экран (например, после подключения книги в библиотеке).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const updateUnit = useCallback((unitId: string, patch: Partial<CoursePlanUnit>) => {
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            books: prev.books.map((b) => ({
              ...b,
              units: b.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)),
            })),
          }
        : prev,
    );
  }, []);

  const toggleUnit = useCallback(async (unit: CoursePlanUnit) => {
    if (pendingUnitIds.includes(unit.id)) return;
    const next = !unit.isOpen;
    setPendingUnitIds((prev) => [...prev, unit.id]);
    updateUnit(unit.id, { isOpen: next }); // оптимистично
    const result = await BookService.setUnitOpen(courseId, unit.id, next);
    setPendingUnitIds((prev) => prev.filter((id) => id !== unit.id));
    if (!result.ok) {
      updateUnit(unit.id, { isOpen: !next });
      toast.error('Не удалось сохранить. Проверь подключение к интернету и попробуй ещё раз');
      return;
    }
    updateUnit(unit.id, { isOpen: result.data.isOpen, openedAt: result.data.openedAt });
    // Открытый юнит появляется в курсе и у самого учителя (как у учеников), закрытый — пропадает.
    BookService.syncOfficialSets().catch(() => {});
  }, [courseId, pendingUnitIds, updateUnit]);

  const openUnitSet = useCallback(async (unit: CoursePlanUnit) => {
    if (!unit.set || openingSetId) return;
    setOpeningSetId(unit.set.id);
    const ok = await BookService.openOfficialSet(unit.set.id);
    setOpeningSetId(null);
    if (!ok) {
      toast.error('Не удалось открыть юнит. Проверь подключение к интернету и попробуй ещё раз');
      return;
    }
    navigation.navigate('SetDetail', { setId: unit.set.id });
  }, [navigation, openingSetId]);

  const confirmDetach = useCallback(async (book: CoursePlanBook) => {
    const ok = await confirmAction(
      'Отключить книгу?',
      `«${book.title}» пропадёт из курса «${courseTitle}», ученики перестанут видеть её юниты. Их прогресс сохранится.`,
      'Отключить',
      { destructive: true },
    );
    if (!ok) return;
    const result = await BookService.detachFromCourse(book.id, courseId);
    if (!result.ok) {
      toast.error(`Не удалось отключить. ${describeError(result.error, 'Попробуй ещё раз.')}`);
      return;
    }
    setPlan((prev) => (prev ? { ...prev, books: prev.books.filter((b) => b.id !== book.id) } : prev));
    BookService.syncOfficialSets().catch(() => {});
  }, [courseId, courseTitle]);

  const goToLibrary = useCallback(() => {
    navigation.navigate('Main', { screen: 'Library' });
  }, [navigation]);

  return (
    <Container padded={false}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        bordered
        center={
          <View style={s.headerTitleWrap} accessibilityRole="header">
            <Text variant="button" style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>Учебники курса</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>{courseTitle}</Text>
          </View>
        }
        right={
          <Button
            variant="icon"
            icon={Plus}
            iconColor={colors.primary}
            accessibilityLabel="Подключить учебник"
            onPress={goToLibrary}
          />
        }
      />

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : failed || !plan ? (
        <ErrorState retryLabel="Попробовать снова" onRetry={() => { setIsLoading(true); load(); }} />
      ) : plan.books.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Учебников пока нет"
          description="Найди учебник группы в библиотеке и нажми «Подключить к курсу». Юниты ты будешь открывать здесь по мере прохождения."
          action={{ label: 'Выбрать учебник', onPress: goToLibrary }}
        />
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text variant="bodySmall" color="secondary">
            Ученики курса видят только открытые юниты. У каждого курса свой план.
          </Text>

          {plan.books.map((book) => {
            const cover = getBookCover(book.subject);
            const meta = formatBookMeta(book);
            const openCount = book.units.filter((u) => u.isOpen).length;
            return (
              <View key={book.id} style={[s.bookCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={s.bookHeader}>
                  <View style={[s.bookCover, { backgroundColor: alpha(cover.color, 10) }]}>
                    <cover.icon size={iconSize.m} color={cover.color} />
                  </View>
                  <View style={s.bookHeaderBody}>
                    <Text style={[s.bookTitle, { color: colors.textPrimary }]} numberOfLines={2}>{book.title}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {[meta, `открыто ${openCount} из ${book.units.length}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Button
                    variant="icon"
                    icon={MoreHorizontal}
                    background="none"
                    iconSize={iconSize.s}
                    iconColor={colors.textSecondary}
                    accessibilityLabel={`Действия с учебником «${book.title}»`}
                    onPress={() => confirmDetach(book)}
                  />
                </View>

                {!book.isPublished && (
                  <Badge
                    label="Книга снята с публикации — ученики её не видят"
                    tone="warning"
                    icon={AlertTriangle}
                    style={s.warning}
                  />
                )}

                {book.units.map((unit) => {
                  const isOpening = unit.set !== null && openingSetId === unit.set.id;
                  return (
                    <View key={unit.id} style={[s.unitRow, { borderTopColor: colors.border }]}>
                      <Pressable
                        style={({ pressed }) => [s.unitMain, pressed && { opacity: 0.85 }]}
                        onPress={() => openUnitSet(unit)}
                        disabled={!unit.set || openingSetId !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`Юнит ${unit.number}. ${unit.title}`}
                      >
                        <View style={[s.unitNumber, { backgroundColor: unit.isOpen ? colors.primaryFill : alpha(colors.primary, 10) }]}>
                          {isOpening ? (
                            <ActivityIndicator size="small" color={unit.isOpen ? colors.onPrimary : colors.primary} />
                          ) : (
                            <Text style={[s.unitNumberText, { color: unit.isOpen ? colors.onPrimary : colors.primary }]}>{unit.number}</Text>
                          )}
                        </View>
                        <View style={s.unitBody}>
                          <Text style={[s.unitTitle, { color: colors.textPrimary }]} numberOfLines={1}>{unit.title}</Text>
                          <Text variant="caption" color="secondary" numberOfLines={1}>
                            {[
                              unit.isOpen ? 'Открыт' : 'Закрыт',
                              unit.pages ? `стр. ${unit.pages}` : null,
                              unit.set ? `${unit.set.totalCards} ${pluralize(unit.set.totalCards, 'слово', 'слова', 'слов')}` : null,
                            ].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                      <Switch
                        value={unit.isOpen}
                        onValueChange={() => toggleUnit(unit)}
                        disabled={pendingUnitIds.includes(unit.id)}
                        accessibilityLabel={`Юнит ${unit.number} открыт для учеников`}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
    </Container>
  );
}

const s = StyleSheet.create({
  headerTitleWrap: { alignItems: 'center' },
  headerTitle: { letterSpacing: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s, paddingHorizontal: spacing.xl },
  scroll: { padding: screenPadding, gap: spacing.m, paddingBottom: spacing.xxl },
  bookCard: { borderRadius: borderRadius.l, borderWidth: 1, overflow: 'hidden' },
  bookHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, padding: spacing.m },
  bookCover: { width: 48, height: 48, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center' },
  bookHeaderBody: { flex: 1, gap: spacing.xxs / 2 },
  bookTitle: { fontSize: 16, fontWeight: '600' },
  warning: { marginHorizontal: spacing.m, marginBottom: spacing.s, alignSelf: 'stretch' },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.m, paddingVertical: spacing.s, borderTopWidth: 1 },
  unitMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  unitNumber: { width: 36, height: 36, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center' },
  unitNumberText: { fontSize: 16, fontWeight: '700' },
  unitBody: { flex: 1, gap: spacing.xxs / 2 },
  unitTitle: { fontSize: 16, fontWeight: '600' },
});
