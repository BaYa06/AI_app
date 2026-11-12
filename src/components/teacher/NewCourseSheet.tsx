/**
 * Окно «Новый курс» учителя (plan/new/teacher_cabinet.md, Teacher 6–7).
 * iOS — нативное окно на Swift (nativeNewCourseSheet.ts), Android и веб — RN-окно ниже.
 * Оба вызывают одну логику createCourseWithSetup и берут тексты из NEW_COURSE_TEXTS.
 *
 * Название (обязательно) → учебник (по желанию) → дни уроков и время (по желанию) → «Создать курс».
 * Расписание — так же, как в окне «Расписание занятий» (CourseScheduleSheet).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BookOpen, Check, ChevronDown, ChevronUp, CircleOff } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, ListRow, Sheet, TextField, toast } from '@/components/ui';
import { spacing } from '@/constants';
import { WEEK_DAYS } from '@/components/push/AboutMeForm';
import {
  DEFAULT_MINUTES,
  MAX_MINUTES,
  MIN_MINUTES,
  STEP_MIN,
  toTime,
} from '@/components/push/CourseScheduleSheet';
import type { Course } from '@/types';
import type { BookListItem } from '@/types/books';
import {
  NEW_COURSE_SEARCH_FROM,
  NEW_COURSE_TEXTS as T,
  bookSubtitle,
  createCourseWithSetup,
  loadBooksForNewCourse,
  newCourseProblemMessage,
} from './newCourse';
import { isNativeNewCourseSheet, useNativeNewCourseSheet } from './nativeNewCourseSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Курс создан (даже если учебник или расписание не сохранились) */
  onCreated: (course: Course) => void;
}

export function NewCourseSheet(props: Props) {
  useNativeNewCourseSheet(props);
  if (isNativeNewCourseSheet) return null;
  return <NewCourseSheetRN {...props} />;
}

function NewCourseSheetRN({ visible, onClose, onCreated }: Props) {
  const colors = useThemeColors();
  const [title, setTitle] = useState('');
  const [books, setBooks] = useState<BookListItem[] | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [bookQuery, setBookQuery] = useState('');
  const [days, setDays] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [saving, setSaving] = useState(false);

  // Каждое открытие — чистая форма
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setBookId(null);
    setBookQuery('');
    setDays([]);
    setMinutes(DEFAULT_MINUTES);
    setBooks(null);
    let cancelled = false;
    loadBooksForNewCourse().then((list) => {
      if (!cancelled) setBooks(list);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const shownBooks = useMemo(() => {
    if (!books) return [];
    const q = bookQuery.trim().toLowerCase();
    return q ? books.filter((b) => b.title.toLowerCase().includes(q)) : books;
  }, [books, bookQuery]);

  const toggleDay = (day: string) =>
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  const shift = (delta: number) =>
    setMinutes((m) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, m + delta)));

  const canCreate = title.trim().length > 0 && !saving;

  const handleCreate = async () => {
    if (!canCreate) return;
    setSaving(true);
    const { course, problems } = await createCourseWithSetup({
      title: title.trim(),
      bookId,
      days,
      time: toTime(minutes),
    });
    setSaving(false);
    const problem = newCourseProblemMessage(problems);
    if (problem) toast.info(problem);
    else toast.success(`Курс «${course.title}» создан`);
    onCreated(course);
  };

  const checkMark = <Check size={20} color={colors.primary} />;

  return (
    <Sheet
      visible={visible}
      onClose={saving ? () => {} : onClose}
      dismissOnBackdrop={!saving}
      title={T.title}
      footer={
        <Button
          title={T.create}
          onPress={handleCreate}
          disabled={!canCreate}
          loading={saving}
          fullWidth
        />
      }
    >
      <View style={st.body}>
        <TextField
          label={T.nameLabel}
          placeholder={T.namePlaceholder}
          value={title}
          onChangeText={setTitle}
          maxLength={255}
          returnKeyType="done"
        />

        <View style={st.section}>
          <Text variant="label" color="secondary">
            {T.bookLabel}
          </Text>
          <ListRow
            title={T.noBook}
            subtitle={T.noBookHint}
            icon={CircleOff}
            onPress={() => setBookId(null)}
            right={bookId === null ? checkMark : <View style={st.checkSpace} />}
          />
          {books === null ? (
            <ActivityIndicator color={colors.primary} style={st.loading} />
          ) : (
            <>
              {books.length > NEW_COURSE_SEARCH_FROM && (
                <TextField
                  variant="search"
                  placeholder={T.bookSearch}
                  value={bookQuery}
                  onChangeText={setBookQuery}
                />
              )}
              {shownBooks.map((b) => (
                <ListRow
                  key={b.id}
                  title={b.title}
                  subtitle={bookSubtitle(b)}
                  icon={BookOpen}
                  iconColor={bookId === b.id ? colors.primary : undefined}
                  onPress={() => setBookId(b.id)}
                  right={bookId === b.id ? checkMark : <View style={st.checkSpace} />}
                />
              ))}
            </>
          )}
          <Text variant="caption" color="secondary">
            {T.bookHint}
          </Text>
        </View>

        <View style={st.section}>
          <Text variant="label" color="secondary">
            {T.daysLabel}
          </Text>
          <View style={st.days}>
            {WEEK_DAYS.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                selected={days.includes(d.key)}
                onPress={() => toggleDay(d.key)}
              />
            ))}
          </View>
          {days.length > 0 ? (
            <View style={st.timeRow}>
              <Button
                variant="icon"
                icon={ChevronDown}
                background="none"
                accessibilityLabel={T.earlier}
                onPress={() => shift(-STEP_MIN)}
              />
              <Text
                variant="h2"
                accessibilityLabel={`${T.startsAt} ${toTime(minutes)}`}
                style={{ color: colors.textPrimary }}
              >
                {toTime(minutes)}
              </Text>
              <Button
                variant="icon"
                icon={ChevronUp}
                background="none"
                accessibilityLabel={T.later}
                onPress={() => shift(STEP_MIN)}
              />
            </View>
          ) : (
            <Text variant="caption" color="secondary">
              {T.daysHint}
            </Text>
          )}
        </View>
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  body: {
    gap: spacing.l,
  },
  section: {
    gap: spacing.xs,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.m,
  },
  loading: {
    marginVertical: spacing.s,
  },
  checkSpace: {
    width: 20,
  },
});
