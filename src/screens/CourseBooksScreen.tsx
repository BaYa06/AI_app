/**
 * Course Books Screen
 * @description «Учебники курса» (учитель): подключённые книги и план юнитов этой группы —
 * переключатель «Открыт» у каждого юнита. У каждого курса свой план.
 * План: plan/book_catalog_plan.md, часть 5.
 */
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, MoreHorizontal, Plus, AlertTriangle } from 'lucide-react-native';
import { Text, Container, ToggleSwitch } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { BookService } from '@/services/BookService';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import { showMessage, confirmAction } from '@/utils/dialogs';
import type { CoursePlan, CoursePlanBook, CoursePlanUnit } from '@/types/books';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'CourseBooks'>;

export function CourseBooksScreen({ navigation, route }: Props) {
  const { courseId } = route.params;
  const courseTitle = route.params.courseTitle || 'Курс';
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';

  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pendingUnitIds, setPendingUnitIds] = useState<string[]>([]);
  const [openingSetId, setOpeningSetId] = useState<string | null>(null);

  const headerBg = isDark ? colors.background : '#FFFFFF';
  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : colors.surface;

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
      showMessage('Не удалось сохранить', 'Проверьте подключение к интернету и попробуйте ещё раз.');
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
      showMessage('Не удалось открыть юнит', 'Проверьте подключение к интернету и попробуйте ещё раз.');
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
      showMessage('Не удалось отключить', result.error);
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
      <View style={[s.header, { backgroundColor: headerBg, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={s.headerTitleWrap}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>Учебники курса</Text>
          <Text style={[s.headerSubtitle, { color: colors.textTertiary }]} numberOfLines={1}>{courseTitle}</Text>
        </View>
        <Pressable onPress={goToLibrary} hitSlop={10} style={s.headerIcon}>
          <Plus size={22} color={colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : failed || !plan ? (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Не удалось загрузить</Text>
          <Pressable style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => { setIsLoading(true); load(); }}>
            <Text style={s.primaryBtnText}>Попробовать снова</Text>
          </Pressable>
        </View>
      ) : plan.books.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>📚</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Учебников пока нет</Text>
          <Text style={[s.emptySubtitle, { color: colors.textTertiary }]}>
            Найдите учебник группы в библиотеке и нажмите «Подключить к курсу». Юниты вы будете открывать здесь по мере прохождения.
          </Text>
          <Pressable style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={goToLibrary}>
            <Text style={s.primaryBtnText}>Выбрать учебник</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[s.hint, { color: colors.textSecondary }]}>
            Ученики курса видят только открытые юниты. У каждого курса свой план.
          </Text>

          {plan.books.map((book) => {
            const cover = getBookCover(book.subject);
            const meta = formatBookMeta(book);
            const openCount = book.units.filter((u) => u.isOpen).length;
            return (
              <View key={book.id} style={[s.bookCard, { backgroundColor: cardBg, borderColor: colors.border }]}>
                <View style={s.bookHeader}>
                  <View style={[s.bookCover, { backgroundColor: cover.color + '1A' }]}>
                    <Text style={s.bookCoverEmoji}>{cover.emoji}</Text>
                  </View>
                  <View style={s.bookHeaderBody}>
                    <Text style={[s.bookTitle, { color: colors.textPrimary }]} numberOfLines={2}>{book.title}</Text>
                    <Text style={[s.bookMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                      {[meta, `открыто ${openCount} из ${book.units.length}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable onPress={() => confirmDetach(book)} hitSlop={10} style={s.headerIcon}>
                    <MoreHorizontal size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>

                {!book.isPublished && (
                  <View style={[s.warning, { backgroundColor: '#F59E0B1A' }]}>
                    <AlertTriangle size={14} color="#B45309" />
                    <Text style={[s.warningText, { color: '#B45309' }]}>Книга снята с публикации — ученики её не видят</Text>
                  </View>
                )}

                {book.units.map((unit) => {
                  const isOpening = unit.set !== null && openingSetId === unit.set.id;
                  return (
                    <View key={unit.id} style={[s.unitRow, { borderTopColor: colors.border }]}>
                      <Pressable
                        style={({ pressed }) => [s.unitMain, pressed && { opacity: 0.6 }]}
                        onPress={() => openUnitSet(unit)}
                        disabled={!unit.set || openingSetId !== null}
                      >
                        <View style={[s.unitNumber, { backgroundColor: unit.isOpen ? colors.primary : colors.primary + '15' }]}>
                          {isOpening ? (
                            <ActivityIndicator size="small" color={unit.isOpen ? '#FFFFFF' : colors.primary} />
                          ) : (
                            <Text style={[s.unitNumberText, { color: unit.isOpen ? '#FFFFFF' : colors.primary }]}>{unit.number}</Text>
                          )}
                        </View>
                        <View style={s.unitBody}>
                          <Text style={[s.unitTitle, { color: colors.textPrimary }]} numberOfLines={1}>{unit.title}</Text>
                          <Text style={[s.unitMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                            {[
                              unit.isOpen ? 'Открыт' : 'Закрыт',
                              unit.pages ? `стр. ${unit.pages}` : null,
                              unit.set ? `${unit.set.totalCards} слов` : null,
                            ].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                      <View style={pendingUnitIds.includes(unit.id) && { opacity: 0.5 }}>
                        <ToggleSwitch value={unit.isOpen} onToggle={() => toggleUnit(unit)} />
                      </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.s, paddingVertical: spacing.s, borderBottomWidth: 1 },
  headerIcon: { width: 40, height: 40, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  primaryBtn: { paddingHorizontal: spacing.l, paddingVertical: spacing.s, borderRadius: borderRadius.l, marginTop: spacing.s },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  scroll: { padding: spacing.m, gap: spacing.m, paddingBottom: spacing.xxl },
  hint: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  bookCard: { borderRadius: borderRadius.xl, borderWidth: 1, overflow: 'hidden' },
  bookHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, padding: spacing.m },
  bookCover: { width: 48, height: 48, borderRadius: borderRadius.l, alignItems: 'center', justifyContent: 'center' },
  bookCoverEmoji: { fontSize: 24 },
  bookHeaderBody: { flex: 1, gap: 2 },
  bookTitle: { fontSize: 16, fontWeight: '700' },
  bookMeta: { fontSize: 12, fontWeight: '500' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.m, marginBottom: spacing.s, paddingHorizontal: spacing.s, paddingVertical: 6, borderRadius: borderRadius.s },
  warningText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.m, paddingVertical: spacing.s, borderTopWidth: StyleSheet.hairlineWidth },
  unitMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  unitNumber: { width: 36, height: 36, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center' },
  unitNumberText: { fontSize: 15, fontWeight: '800' },
  unitBody: { flex: 1, gap: 2 },
  unitTitle: { fontSize: 15, fontWeight: '600' },
  unitMeta: { fontSize: 12, fontWeight: '500' },
});
