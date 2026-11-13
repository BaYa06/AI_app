/**
 * Окно «Новое задание» (plan/new/teacher_cabinet.md, Teacher 18; макет 11).
 * RN-окно — Android и веб; iOS — Swift (Teacher 20). Логика и тексты — newHomework.ts.
 *
 * Кому → слова → что сделать → срок (карточка «до: …», по нажатию — барабан) → порог → «Задать N ученикам».
 * «Пройти тест» и «Повторить трудные» — этап 3, за флагом TEACHER_LESSON_PREP_ENABLED (решение 2).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BookOpen, Check, Clock, Users } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, ListRow, Sheet, toast } from '@/components/ui';
import { borderRadius, spacing } from '@/constants';
import { TEACHER_LESSON_PREP_ENABLED } from '@/config/features';
import { MIN_SCORE_OPTIONS, dueRelative, homeworkVolumeText } from '@/services/homework';
import type { ScheduleItem } from '@/utils/nextLesson';
import { pluralize } from '@/utils';
import { DueWheelPicker } from './DueWheelPicker';
import { WordPickerSheet } from './WordPickerSheet';
import { isNativeNewHomeworkSheet, useNativeNewHomeworkSheet } from './nativeNewHomeworkSheet';
import {
  DEFAULT_MIN_SCORE,
  NEW_HOMEWORK_TEXTS as T,
  assignButtonText,
  createHomework,
  defaultDue,
  dueCardText,
  duePresets,
  scoreChipLabel,
  wordsSummary,
  homeworkFormStart,
  homeworkTasks,
  type HomeworkPreset,
  type HomeworkTask,
  type HomeworkWords,
} from './newHomework';

export interface HomeworkStudent {
  id: string;
  displayName: string;
}

export interface NewHomeworkSheetProps {
  visible: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  students: HomeworkStudent[];
  schedule: ScheduleItem[] | null;
  /** Слова при открытии (обычно весь набор, из которого открыли окно) */
  initialWords: HomeworkWords | null;
  /** Готовые слова, ученики и срок (Teacher 42); без него — обычная чистая форма */
  preset?: HomeworkPreset | null;
  onCreated: (homeworkId: string) => void;
}

type Task = HomeworkTask;

/** iOS — Swift-окно (nativeNewHomeworkSheet.ts), Android, веб и сборки без модуля — RN-окно */
export function NewHomeworkSheet(props: NewHomeworkSheetProps) {
  useNativeNewHomeworkSheet(props);
  if (isNativeNewHomeworkSheet) return null;
  return <NewHomeworkSheetRN {...props} />;
}

export function NewHomeworkSheetRN({
  visible,
  onClose,
  courseId,
  courseTitle,
  students,
  schedule,
  initialWords,
  preset,
  onCreated,
}: NewHomeworkSheetProps) {
  const colors = useThemeColors();
  const taskKeys = homeworkTasks(TEACHER_LESSON_PREP_ENABLED);
  const [now, setNow] = useState(() => new Date());
  const [words, setWords] = useState<HomeworkWords | null>(initialWords);
  const [pickAll, setPickAll] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [task, setTask] = useState<Task>('learn');
  const [due, setDue] = useState(() => defaultDue(new Date(), schedule));
  const [dueOpen, setDueOpen] = useState(false);
  const [minScore, setMinScore] = useState<number | null>(DEFAULT_MIN_SCORE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Каждое открытие — чистая форма
  useEffect(() => {
    if (!visible) return;
    const at = new Date();
    // Готовые слова, ученики и срок (Teacher 42) — учитель может всё поменять
    const start = homeworkFormStart({
      now: at,
      schedule,
      initialWords,
      preset,
      studentIds: students.map((s) => s.id),
      tasks: taskKeys,
    });
    setNow(at);
    setWords(start.words);
    setPickAll(start.userIds === null);
    setPicked(new Set(start.userIds ?? []));
    setTask(start.task);
    setDue(start.due);
    setDueOpen(false);
    setMinScore(DEFAULT_MIN_SCORE);
    setError(null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const presets = useMemo(() => duePresets(now, schedule), [now, schedule]);
  const wordCount = words?.cardIds.length ?? 0;
  const studentCount = pickAll ? students.length : picked.size;
  const duePast = due.getTime() <= Date.now();
  const canCreate = wordCount > 0 && studentCount > 0 && !duePast && !saving;

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async () => {
    if (!canCreate || !words) return;
    setSaving(true);
    setError(null);
    const res = await createHomework({
      courseId,
      words,
      due,
      minScore,
      userIds: pickAll ? null : [...picked],
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast.success(
      `Задание выдано: ${studentCount} ${pluralize(studentCount, 'ученик', 'ученика', 'учеников')}`
    );
    onCreated(res.id);
  };

  const check = <Check size={20} color={colors.primary} />;
  const space = <View style={st.checkSpace} />;
  const tasks: Array<{ key: Task; title: string; sub: string }> = [
    { key: 'learn', title: T.taskLearn, sub: words ? wordsSummary(words) : T.wordsPick },
    // «Пройти тест» отложен (решение 9 этапа 3) — в списке только то, что отдаёт homeworkTasks
    ...(taskKeys.includes('hard')
      ? [{ key: 'hard' as Task, title: T.taskHard, sub: T.taskHardHint }]
      : []),
  ];

  return (
    <Sheet
      visible={visible}
      onClose={saving ? () => {} : onClose}
      dismissOnBackdrop={!saving}
      title={T.title}
      footer={
        <View style={st.footer}>
          {error ? (
            <Text variant="caption" style={{ color: colors.errorText }}>
              {error}
            </Text>
          ) : null}
          <Button
            title={assignButtonText(studentCount)}
            onPress={handleCreate}
            disabled={!canCreate}
            loading={saving}
            fullWidth
          />
        </View>
      }
    >
      <View style={st.body}>
        {/* Кому */}
        <View style={st.section}>
          <Text variant="label" color="secondary">
            {T.whoLabel}
          </Text>
          {students.length === 0 ? (
            <Text variant="caption" style={{ color: colors.warningText }}>
              {T.noStudents}
            </Text>
          ) : (
            <>
              <ListRow
                title={`${T.whoAll} ${courseTitle} · ${students.length} ${pluralize(students.length, 'ученик', 'ученика', 'учеников')}`}
                icon={Users}
                iconColor={pickAll ? colors.primary : undefined}
                onPress={() => setPickAll(true)}
                right={pickAll ? check : space}
              />
              <ListRow
                title={T.whoPick}
                subtitle={!pickAll && picked.size > 0 ? `Выбрано: ${picked.size}` : undefined}
                icon={Users}
                iconColor={!pickAll ? colors.primary : undefined}
                onPress={() => setPickAll(false)}
                right={!pickAll ? check : space}
              />
              {!pickAll &&
                students.map((s) => (
                  <ListRow
                    key={s.id}
                    title={s.displayName}
                    onPress={() => togglePicked(s.id)}
                    right={picked.has(s.id) ? check : space}
                    style={st.indent}
                  />
                ))}
            </>
          )}
        </View>

        {/* Слова */}
        <View style={st.section}>
          <Text variant="label" color="secondary">
            {T.wordsLabel}
          </Text>
          <ListRow
            title={words ? wordsSummary(words) : T.wordsPick}
            subtitle={wordCount > 0 ? homeworkVolumeText(wordCount) : undefined}
            icon={BookOpen}
            onPress={() => setPickerOpen(true)}
          />
        </View>

        {/* Что сделать */}
        <View style={st.section}>
          <Text variant="label" color="secondary">
            {T.taskLabel}
          </Text>
          {tasks.map((t) => (
            <ListRow
              key={t.key}
              title={t.title}
              subtitle={t.sub}
              onPress={() => setTask(t.key)}
              right={task === t.key ? check : space}
            />
          ))}
        </View>

        {/* Срок: карточка «до: …» → барабан */}
        <View style={st.section}>
          <Text variant="label" color="secondary">
            {T.dueLabel}
          </Text>
          <View
            style={[st.dueCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <ListRow
              title={`${T.duePrefix} ${dueCardText(due)}`}
              subtitle={duePast ? T.duePast : dueRelative(due)}
              icon={Clock}
              iconColor={colors.homeworkText}
              onPress={() => setDueOpen((v) => !v)}
              chevron={false}
            />
            {dueOpen && (
              <View style={st.dueBody}>
                <View style={st.presets}>
                  {presets.map((p) => (
                    <Chip
                      key={p.key}
                      label={p.label}
                      selected={p.date.getTime() === due.getTime()}
                      onPress={() => setDue(p.date)}
                    />
                  ))}
                </View>
                <DueWheelPicker value={due} onChange={setDue} now={now} />
                <Button title={T.done} variant="secondary" onPress={() => setDueOpen(false)} />
              </View>
            )}
          </View>
          {!schedule?.length && (
            <Text variant="caption" color="secondary">
              {T.noScheduleHint}
            </Text>
          )}
        </View>

        {/* Порог */}
        <View style={st.section}>
          <Text variant="label" color="secondary">
            {T.scoreLabel}
          </Text>
          <View style={st.presets}>
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

      <WordPickerSheet
        visible={pickerOpen}
        courseId={courseId}
        words={words}
        due={due}
        onClose={() => setPickerOpen(false)}
        onDone={(w) => {
          setWords(w);
          setPickerOpen(false);
        }}
      />
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
  footer: {
    gap: spacing.xs,
  },
  indent: {
    paddingLeft: spacing.l,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dueCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  dueBody: {
    padding: spacing.s,
    gap: spacing.s,
  },
  checkSpace: {
    width: 20,
  },
});
