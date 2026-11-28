/**
 * «Новое задание» в веб-кабинете (/courses/:id/homework/new). Те же правила и тексты, что у окна
 * в телефоне (components/teacher/newHomework.ts, wordPicker.ts): слова из наборов курса (весь набор
 * или отдельные слова), кому — вся группа или выбранные, срок с быстрыми вариантами, порог оценки.
 * Слева форма, справа — что получится и одна главная кнопка «Задать N ученикам».
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Minus, Users } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/Toast';
import { MIN_SCORE_OPTIONS, dueRelative, homeworkVolumeText } from '@/services/homework';
import {
  DEFAULT_MIN_SCORE,
  NEW_HOMEWORK_TEXTS as T,
  assignButtonText,
  defaultDue,
  dueCardText,
  duePresets,
  homeworkTitle,
  newHomeworkErrorMessage,
  scoreChipLabel,
  wordsSummary,
} from '@/components/teacher/newHomework';
import {
  WORD_PICKER_TEXTS as W,
  filterWords,
  selectedCount,
  selectionFromWords,
  setCheck,
  setSubtitle,
  takeFirst,
  toHomeworkWords,
  toggleSet,
  toggleWord,
  tooManyText,
  type PickerSet,
  type SetCheck,
  type WordSelection,
} from '@/components/teacher/wordPicker';
import { defaultHomeworkWords } from '@/components/teacher/teacherHomework';
import { HOMEWORK_PART_WORDS } from '@/services/homework';
import { WebApiError, describeApiError } from '../api';
import { navigate } from '../router';
import { useCourses } from '../data/CoursesContext';
import { HomeworkData } from '../data/homework';
import { TeacherData } from '../data/teacher';
import { useLoad } from '../useLoad';
import { useSingleFlight } from '../ui/useSingleFlight';
import { useUnloadGuard } from '../ui/useUnloadGuard';
import { Centered, ErrorPage, LoadingPage, NotFoundPage } from '../ui/states';
import { Avatar, PageHeader, SectionLabel } from '../ui/kit';
import { DueInput } from '../courses/DueInput';

export function HomeworkNewPage({ courseId }: { courseId: string }) {
  const colors = useThemeColors();
  const { courses } = useCourses();
  const sets = useLoad(() => HomeworkData.pickerSets(courseId), [courseId]);
  const members = useLoad(() => TeacherData.members(courseId), [courseId]);
  const schedule = useLoad(() => TeacherData.schedule(courseId), [courseId]);

  const [now] = useState(() => new Date());
  const [sel, setSel] = useState<WordSelection>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [pickAll, setPickAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState(() => defaultDue(new Date(), null));
  const [dueTouched, setDueTouched] = useState(false);
  const [minScore, setMinScore] = useState<number | null>(DEFAULT_MIN_SCORE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const once = useSingleFlight();
  useUnloadGuard(saving);

  // По умолчанию — весь последний набор курса (обычно свежий юнит), как в телефоне
  useEffect(() => {
    if (sets.data) setSel(selectionFromWords(sets.data, defaultHomeworkWords(sets.data)));
  }, [sets.data]);

  // Срок по умолчанию — к ближайшему уроку, когда расписание загрузилось (если учитель не менял)
  useEffect(() => {
    if (schedule.data && !dueTouched) setDue(defaultDue(new Date(), schedule.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.data]);

  const presets = useMemo(() => duePresets(now, schedule.data ?? null), [now, schedule.data]);
  const words = useMemo(() => toHomeworkWords(sets.data ?? [], sel), [sets.data, sel]);
  const wordCount = selectedCount(sel);
  const students = members.data ?? [];
  const studentCount = pickAll ? students.length : picked.size;
  const duePast = due.getTime() <= Date.now();
  const many = tooManyText(wordCount, due);

  const course = courses?.find((c) => c.id === courseId);
  if (courses && !course) return <NotFoundPage />;
  const failed = (sets.error && !sets.data) || (members.error && !members.data);
  if (failed)
    return (
      <ErrorPage
        error={sets.error || members.error}
        onRetry={() => {
          sets.reload();
          members.reload();
        }}
      />
    );
  if (!sets.data || !members.data || !course) return <LoadingPage />;

  const back = { label: course.title, path: `/courses/${courseId}?tab=homework` };

  if (sets.data.length === 0) {
    return (
      <View>
        <PageHeader title={T.title} back={back} />
        <Centered>
          <EmptyState
            icon={Users}
            title={W.empty}
            description="Задание собирается из слов наборов курса. Добавь набор в приложении Flashly и вернись сюда."
          />
        </Centered>
      </View>
    );
  }

  const problem =
    students.length === 0
      ? T.noStudents
      : wordCount === 0
        ? W.pickHint
        : studentCount === 0
          ? 'Отметь хотя бы одного ученика'
          : duePast
            ? T.duePast
            : null;

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changeDue = (d: Date) => {
    setDueTouched(true);
    setDue(d);
  };

  const create = () => void once(createOnce);
  const createOnce = async () => {
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      const id = await HomeworkData.create({
        courseId,
        title: homeworkTitle(words.sets) || 'Задание',
        cardIds: words.cardIds,
        dueAt: due.toISOString(),
        minScore,
        userIds: pickAll ? null : [...picked],
      });
      toast.success('Задание выдано');
      navigate(`/courses/${courseId}/homework/${id}`, { replace: true });
    } catch (e) {
      const reason = e instanceof WebApiError ? e.serverError : undefined;
      setError(
        reason && reason !== 'unknown' && reason !== 'bad_request'
          ? newHomeworkErrorMessage(reason)
          : describeApiError(e)
      );
      setSaving(false);
    }
  };

  const q = query.trim();

  return (
    <View>
      <PageHeader title={T.title} subtitle={course.title} back={back} />
      <View style={styles.layout}>
        <View style={styles.main}>
          {/* ─── Слова ─── */}
          <View style={{ gap: spacing.s }}>
            <SectionLabel>{W.setsLabel}</SectionLabel>
            <TextField
              placeholder={W.search}
              value={query}
              onChangeText={setQuery}
              accessibilityLabel={W.search}
            />
            <Card padding="none">
              {sets.data.map((s, i) => {
                const shown = q ? filterWords(s.words, q) : s.words;
                if (q && shown.length === 0) return null;
                const expanded = !!open[s.id] || !!q;
                return (
                  <View
                    key={s.id}
                    style={i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }}
                  >
                    <SetRow
                      set={s}
                      check={setCheck(s, sel)}
                      subtitle={setSubtitle(s, sel)}
                      expanded={expanded}
                      onToggle={() => setSel((cur) => toggleSet(s, cur))}
                      onExpand={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                    />
                    {expanded ? (
                      <View style={[styles.words, { backgroundColor: colors.surfaceMuted }]}>
                        {shown.map((w) => (
                          <Pressable
                            key={w.id}
                            role="checkbox"
                            accessibilityState={{ checked: !!sel[s.id]?.has(w.id) }}
                            accessibilityLabel={`${w.front} — ${w.back}`}
                            onPress={() => setSel((cur) => toggleWord(s.id, w.id, cur))}
                            style={styles.wordRow}
                          >
                            <Box check={sel[s.id]?.has(w.id) ? 'all' : 'none'} />
                            <Text variant="bodySmall" style={{ flex: 1 }} numberOfLines={1}>
                              {w.front}
                            </Text>
                            <Text
                              variant="bodySmall"
                              color="secondary"
                              style={{ flex: 1 }}
                              numberOfLines={1}
                            >
                              {w.back}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Card>
            {many ? (
              <View style={[styles.note, { backgroundColor: alpha(colors.warning, 10) }]}>
                <Text variant="bodySmall" style={{ flex: 1, color: colors.warningText }}>
                  <Text variant="label" style={{ color: colors.warningText }}>
                    {W.manyTitle}
                  </Text>{' '}
                  {many}
                </Text>
                <Button
                  size="s"
                  variant="secondary"
                  title={W.takePart}
                  onPress={() => setSel((cur) => takeFirst(sets.data!, cur, HOMEWORK_PART_WORDS))}
                />
              </View>
            ) : null}
            <Text variant="caption" color="secondary">
              {W.footnote}
            </Text>
          </View>

          {/* ─── Кому ─── */}
          <View style={{ gap: spacing.s }}>
            <SectionLabel>{T.whoLabel}</SectionLabel>
            <View style={styles.chips}>
              <Chip
                label={`${T.whoAll} · ${students.length}`}
                selected={pickAll}
                onPress={() => setPickAll(true)}
              />
              <Chip label={T.whoPick} selected={!pickAll} onPress={() => setPickAll(false)} />
            </View>
            {!pickAll ? (
              <Card padding="none">
                {students.map((m, i) => (
                  <Pressable
                    key={m.id}
                    role="checkbox"
                    accessibilityState={{ checked: picked.has(m.id) }}
                    accessibilityLabel={m.displayName}
                    onPress={() => togglePicked(m.id)}
                    style={[
                      styles.studentRow,
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <Box check={picked.has(m.id) ? 'all' : 'none'} />
                    <Avatar name={m.displayName} size={28} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {m.displayName}
                    </Text>
                  </Pressable>
                ))}
              </Card>
            ) : null}
          </View>

          {/* ─── Срок ─── */}
          <View style={{ gap: spacing.s }}>
            <SectionLabel>{T.dueLabel}</SectionLabel>
            <View style={styles.chips}>
              {presets.map((p) => (
                <Chip
                  key={p.key}
                  label={p.label}
                  selected={p.date.getTime() === due.getTime()}
                  onPress={() => changeDue(p.date)}
                />
              ))}
            </View>
            <DueInput value={due} onChange={changeDue} />
            {!schedule.data?.length ? (
              <Text variant="caption" color="secondary">
                {T.noScheduleHint}
              </Text>
            ) : null}
          </View>

          {/* ─── Порог ─── */}
          <View style={{ gap: spacing.s }}>
            <SectionLabel>{T.scoreLabel}</SectionLabel>
            <View style={styles.chips}>
              {MIN_SCORE_OPTIONS.map((s) => (
                <Chip
                  key={String(s)}
                  label={scoreChipLabel(s)}
                  selected={minScore === s}
                  onPress={() => setMinScore(s)}
                />
              ))}
            </View>
            <Text variant="caption" color="secondary">
              {T.scoreHint}
            </Text>
          </View>
        </View>

        {/* ─── Итог ─── */}
        <View style={styles.side}>
          <Card>
            <View style={{ gap: spacing.m }}>
              <Summary
                label={T.wordsLabel}
                value={wordCount > 0 ? wordsSummary(words) : '—'}
                hint={wordCount > 0 ? homeworkVolumeText(wordCount) : undefined}
              />
              <Summary
                label={T.whoLabel}
                value={
                  pickAll
                    ? `${T.whoAll} · ${students.length}`
                    : `${picked.size} из ${students.length}`
                }
              />
              <Summary
                label={T.dueLabel}
                value={`${T.duePrefix} ${dueCardText(due)}`}
                hint={duePast ? T.duePast : dueRelative(due)}
                warn={duePast}
              />
              <Summary label={T.scoreLabel} value={scoreChipLabel(minScore)} />
              <Text variant="caption" color="secondary">
                {T.taskLearn}: ученик проходит слова в сессиях «Изучить» и «Повторить» в приложении.
              </Text>
              {error ? (
                <Text variant="bodySmall" color="error" accessibilityRole="alert">
                  {error}
                </Text>
              ) : problem && !saving ? (
                <Text variant="caption" color="secondary">
                  {problem}
                </Text>
              ) : null}
              <Button
                title={assignButtonText(studentCount)}
                fullWidth
                loading={saving}
                disabled={!!problem}
                onPress={create}
              />
            </View>
          </Card>
        </View>
      </View>
    </View>
  );
}

/** Квадратик выбора: всё / часть / ничего */
function Box({ check }: { check: SetCheck }) {
  const colors = useThemeColors();
  const on = check !== 'none';
  return (
    <View
      style={[
        styles.box,
        {
          borderColor: on ? colors.primary : colors.border,
          backgroundColor: on ? colors.primary : colors.surface,
        },
      ]}
    >
      {check === 'all' ? <Check size={14} color={colors.onPrimary} /> : null}
      {check === 'some' ? <Minus size={14} color={colors.onPrimary} /> : null}
    </View>
  );
}

function SetRow({
  set,
  check,
  subtitle,
  expanded,
  onToggle,
  onExpand,
}: {
  set: PickerSet;
  check: SetCheck;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const colors = useThemeColors();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <View style={styles.setRow}>
      <Pressable
        role="checkbox"
        accessibilityState={{
          checked: check === 'all' ? true : check === 'some' ? 'mixed' : false,
        }}
        accessibilityLabel={`${set.title}, ${subtitle}`}
        onPress={onToggle}
        style={styles.setMain}
      >
        <Box check={check} />
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {set.title}
          </Text>
          <Text variant="caption" color="secondary">
            {subtitle}
          </Text>
        </View>
      </Pressable>
      <Button
        variant="quiet"
        size="s"
        tone="secondary"
        title={expanded ? 'Скрыть слова' : 'Слова'}
        onPress={onExpand}
      />
      <Chevron size={16} color={colors.textTertiary} />
    </View>
  );
}

function Summary({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
      {hint ? (
        <Text variant="caption" style={{ color: warn ? colors.errorText : colors.textSecondary }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  main: { flex: 1, gap: spacing.l, minWidth: 0 },
  side: { width: 320, position: 'sticky' as unknown as 'relative', top: spacing.l },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.m,
    minHeight: 60,
  },
  setMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingLeft: spacing.m,
    paddingVertical: spacing.s,
  },
  words: { paddingVertical: spacing.xs },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xl,
    paddingRight: spacing.m,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    minHeight: 52,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.s,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: borderRadius.m,
  },
});
