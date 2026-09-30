/**
 * Book Detail Screen
 * @description Книга каталога: юниты → тап открывает официальный набор в существующем SetDetail.
 * План: plan/book_catalog_plan.md, часть 4.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ChevronRight, Layers, BookOpen, Link2 } from 'lucide-react-native';
import { Text, Container } from '@/components/common';
import { AttachToCoursesSheet } from '@/components/books/AttachToCoursesSheet';
import { Badge, Button, ErrorState, ScreenHeader, toast } from '@/components/ui';
import { useThemeColors, useSettingsStore, useCoursesStore } from '@/store';
import { spacing, borderRadius, iconSize, getLanguageDef, alpha } from '@/constants';
import { pluralize } from '@/utils';
import { BookService } from '@/services/BookService';
import { getBookCover, formatBookMeta } from '@/utils/bookCover';
import { showMessage, confirmAction } from '@/utils/dialogs';
import type { BookDetail, BookUnit } from '@/types/books';
import type { RootStackScreenProps } from '@/types/navigation';
import { describeError } from '@/utils/userErrors';

type Props = RootStackScreenProps<'BookDetail'>;

export function BookDetailScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const colors = useThemeColors();
  const isTeacher = useSettingsStore((s) => s.isTeacher) === true;
  const courses = useCoursesStore((s) => s.courses);

  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openingSetId, setOpeningSetId] = useState<string | null>(null);
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

  const openUnit = useCallback(async (unit: BookUnit) => {
    const set = unit.sets[0];
    if (!set || openingSetId) return;
    setOpeningSetId(set.id);
    const ok = await BookService.openOfficialSet(set.id);
    setOpeningSetId(null);
    if (!ok) {
      showMessage('Не удалось открыть юнит', 'Проверьте подключение к интернету и попробуйте ещё раз.');
      return;
    }
    navigation.navigate('SetDetail', { setId: set.id });
  }, [navigation, openingSetId]);

  const attachToCourses = useCallback(async (courseIds: string[]) => {
    if (!detail) return;
    setAttaching(true);
    const result = await BookService.attachToCourses(detail.book.id, courseIds);
    setAttaching(false);
    if (!result.ok) {
      showMessage('Не удалось подключить', result.status === 403 ? 'Можно подключать только к своим курсам.' : describeError(result.error, 'Попробуй ещё раз.'));
      return;
    }
    const attached = [...result.data.attachedCourseIds, ...result.data.alreadyAttachedCourseIds];
    setDetail((prev) => (prev ? { ...prev, attachedCourseIds: [...new Set([...prev.attachedCourseIds, ...attached])] } : prev));
    setAttachVisible(false);

    const titles = courses.filter((c) => attached.includes(c.id)).map((c) => c.title);
    const single = attached.length === 1 ? courses.find((c) => c.id === attached[0]) : undefined;
    const message = `${titles.join(', ')}. Все юниты пока закрыты — откройте их в «Учебниках курса».`;
    if (!single) {
      showMessage('Книга подключена', message);
      return;
    }
    if (await confirmAction('Книга подключена', message, 'Открыть юниты', { cancelText: 'Позже' })) {
      navigation.navigate('CourseBooks', { courseId: single.id, courseTitle: single.title });
    }
  }, [detail, courses, navigation]);

  const header = <ScreenHeader onBack={() => navigation.goBack()} bordered />;

  if (isLoading || failed || !detail) {
    return (
      <Container padded={false}>
        {header}
        <View style={s.centerContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <ErrorState
              title="Книга недоступна"
              description="Не удалось загрузить книгу. Проверь подключение к интернету."
              retryLabel="Попробовать снова"
              onRetry={load}
            />
          )}
        </View>
      </Container>
    );
  }

  const { book, units } = detail;
  const cover = getBookCover(book.subject);
  const langDef = getLanguageDef(book.languageFrom, book.languageTo);
  const totalCards = units.reduce((sum, u) => sum + u.sets.reduce((acc, set) => acc + set.totalCards, 0), 0);
  const meta = formatBookMeta(book);

  return (
    <Container padded={false}>
      {header}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* Hero */}
        <View style={[s.heroSection, { backgroundColor: colors.surface }]}>
          <View style={[s.heroCover, { backgroundColor: alpha(cover.color, 10) }]}>
            <cover.icon size={iconSize.xl} color={cover.color} />
          </View>
          <Text variant="h1" style={[s.heroTitle, { color: colors.textPrimary }]}>{book.title}</Text>
          {meta ? <Text style={[s.heroMeta, { color: colors.textSecondary }]}>{meta}</Text> : null}
          <Text style={[s.heroMeta, { color: colors.textTertiary }]}>
            {langDef ? `${langDef.flag} ${langDef.label}` : `${book.languageFrom} → ${book.languageTo}`}
            {book.publisher ? ` · ${book.publisher}` : ''}
          </Text>

          {!book.isPublished && (
            <Badge label="Черновик — видно только админу" tone="warning" style={s.draftBadge} />
          )}

          {isTeacher && book.isPublished && (
            <Button title="Подключить к курсу" icon={Link2} onPress={() => setAttachVisible(true)} fullWidth style={s.attachBtn} />
          )}
          {isTeacher && detail.attachedCourseIds.length > 0 && (
            <Text style={[s.heroMeta, { color: colors.textTertiary, marginTop: spacing.xs }]}>
              Подключена к курсам: {detail.attachedCourseIds.length}
            </Text>
          )}

          <View style={s.metricsRow}>
            <View style={[s.metricCard, { borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <BookOpen size={iconSize.xs} color={colors.primary} />
                <Text style={[s.metricNumber, { color: colors.textPrimary }]}>{units.length}</Text>
              </View>
              <Text variant="overline" color="secondary" style={s.metricLabel}>Юнитов</Text>
            </View>
            <View style={[s.metricCard, { borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Layers size={iconSize.xs} color={colors.primary} />
                <Text style={[s.metricNumber, { color: colors.textPrimary }]}>{totalCards}</Text>
              </View>
              <Text variant="overline" color="secondary" style={s.metricLabel}>Слов</Text>
            </View>
          </View>
        </View>

        {/* Units */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Юниты</Text>
          {units.length === 0 ? (
            <Text variant="bodySmall" color="secondary">В книге пока нет юнитов</Text>
          ) : (
            <View style={s.unitList}>
              {units.map((unit) => {
                const set = unit.sets[0];
                const words = unit.sets.reduce((acc, x) => acc + x.totalCards, 0);
                const isOpening = set !== undefined && openingSetId === set.id;
                return (
                  <Pressable
                    key={unit.id}
                    onPress={() => openUnit(unit)}
                    disabled={!set || openingSetId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Юнит ${unit.number}. ${unit.title}`}
                    style={({ pressed }) => [
                      s.unitRow,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      pressed && { opacity: 0.85 },
                      !set && { opacity: 0.5 },
                    ]}
                  >
                    <View style={[s.unitNumber, { backgroundColor: alpha(colors.primary, 10) }]}>
                      <Text style={[s.unitNumberText, { color: colors.primary }]}>{unit.number}</Text>
                    </View>
                    <View style={s.unitBody}>
                      <Text style={[s.unitTitle, { color: colors.textPrimary }]} numberOfLines={1}>{unit.title}</Text>
                      <Text style={[s.unitMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {[unit.pages ? `стр. ${unit.pages}` : null, `${words} ${pluralize(words, 'слово', 'слова', 'слов')}`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {isOpening ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <ChevronRight size={iconSize.xs} color={colors.textTertiary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <AttachToCoursesSheet
        visible={attachVisible}
        bookTitle={book.title}
        attachedCourseIds={detail.attachedCourseIds}
        isSubmitting={attaching}
        onClose={() => setAttachVisible(false)}
        onSubmit={attachToCourses}
        onCreateCourse={() => {
          setAttachVisible(false);
          toast.info('Создай курс в меню курсов на главном экране, а потом вернись к книге');
        }}
      />
    </Container>
  );
}

const s = StyleSheet.create({
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.s, paddingHorizontal: spacing.xl },
  heroSection: { alignItems: 'center', paddingHorizontal: spacing.l, paddingTop: spacing.xl, paddingBottom: spacing.l, gap: spacing.xxs },
  heroCover: { width: 96, height: 96, borderRadius: borderRadius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.m },
  heroTitle: { textAlign: 'center', marginBottom: spacing.xxs },
  heroMeta: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  draftBadge: { marginTop: spacing.s, alignSelf: 'center' },
  attachBtn: { marginTop: spacing.m },
  metricsRow: { flexDirection: 'row', gap: spacing.s, width: '100%', marginTop: spacing.m },
  metricCard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s, borderRadius: borderRadius.l, borderWidth: 1 },
  metricValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  metricNumber: { fontSize: 18, fontWeight: '700' },
  metricLabel: { marginTop: spacing.xxs / 2 },
  section: { paddingHorizontal: spacing.m, paddingTop: spacing.l, gap: spacing.s },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  unitList: { gap: spacing.s },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, padding: spacing.m, borderRadius: borderRadius.l, borderWidth: 1 },
  unitNumber: { width: 40, height: 40, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center' },
  unitNumberText: { fontSize: 16, fontWeight: '700' },
  unitBody: { flex: 1, gap: spacing.xxs / 2 },
  unitTitle: { fontSize: 16, fontWeight: '700' },
  unitMeta: { fontSize: 12, fontWeight: '600' },
});
