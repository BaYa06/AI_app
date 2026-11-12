/**
 * Задания курса у учителя: список с сервера + окна «Новое задание» и «Кто не сдал»
 * (plan/new/teacher_cabinet.md, Teacher 24). Один хук для главной (TeacherLessonCard) и страницы курса.
 * Без флага TEACHER_HOMEWORK_ENABLED ничего не грузит и ничего не рисует.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TEACHER_HOMEWORK_ENABLED } from '@/config/features';
import { NeonService } from '@/services/NeonService';
import type { TeacherHomeworkSummary } from '@/services/homework';
import type { ScheduleItem } from '@/utils/nextLesson';
import { useCardsStore, useSetsStore, isSetInCourse } from '@/store';
import { NewHomeworkSheet, type HomeworkStudent } from './NewHomeworkSheet';
import { NotSubmittedSheet } from '@/screens/teacherHomework/NotSubmittedSheet';
import { currentHomework, defaultHomeworkWords } from './teacherHomework';
import { sortPickerSets, type PickerSet } from './wordPicker';
import type { HomeworkWords } from './newHomework';

/** Последний известный список по курсу — карточка не мигает при возврате на главную */
const cache = new Map<string, TeacherHomeworkSummary[]>();

/** Слова наборов курса, которые уже есть на устройстве (без сети) */
function localCourseSets(courseId: string): PickerSet[] {
  const { sets } = useSetsStore.getState();
  const { cards, cardsBySet } = useCardsStore.getState();
  return sortPickerSets(
    Object.values(sets)
      .filter((s) => isSetInCourse(s, courseId))
      .map((s) => ({
        id: s.id,
        title: s.title,
        words: (cardsBySet[s.id] || [])
          .map((id) => cards[id])
          .filter(Boolean)
          .map((c) => ({ id: c.id, front: c.frontText || '', back: c.backText || '' })),
      }))
      .filter((s) => s.words.length > 0)
  );
}

interface Params {
  courseId: string;
  courseTitle: string;
  students: HomeworkStudent[] | null;
  schedule: ScheduleItem[] | null;
  navigation: any;
}

export function useTeacherHomework({
  courseId,
  courseTitle,
  students,
  schedule,
  navigation,
}: Params) {
  const [list, setList] = useState<TeacherHomeworkSummary[] | null>(
    () => cache.get(courseId) ?? null
  );
  const [newOpen, setNewOpen] = useState(false);
  const [initialWords, setInitialWords] = useState<HomeworkWords | null>(null);
  const [statusFor, setStatusFor] = useState<{ id: string; tab: 'all' | 'not_started' } | null>(
    null
  );

  const reload = useCallback(async () => {
    if (!TEACHER_HOMEWORK_ENABLED) return;
    const res = await NeonService.loadCourseHomework(courseId);
    if (!res) return;
    cache.set(courseId, res);
    setList(res);
  }, [courseId]);

  useEffect(() => {
    setList(cache.get(courseId) ?? null);
    reload();
  }, [courseId, reload]);

  const current = useMemo(() => (list ? currentHomework(list) : null), [list]);

  const rootNav = navigation?.getParent?.() ?? navigation;
  const openStatus = useCallback(
    (homeworkId: string) =>
      rootNav?.navigate('TeacherHomework', { homeworkId, courseId, courseTitle }),
    [rootNav, courseId, courseTitle]
  );
  const openNew = useCallback(() => {
    setInitialWords(defaultHomeworkWords(localCourseSets(courseId)));
    setNewOpen(true);
  }, [courseId]);
  /** Кнопка «Задание»: есть текущее — экран сдачи, нет — окно «Новое задание» */
  const openHomework = useCallback(() => {
    if (current) openStatus(current.id);
    else openNew();
  }, [current, openStatus, openNew]);
  const openNotSubmitted = useCallback(
    (homeworkId: string, tab: 'all' | 'not_started' = 'all') =>
      setStatusFor({ id: homeworkId, tab }),
    []
  );

  const sheets = TEACHER_HOMEWORK_ENABLED ? (
    <>
      <NewHomeworkSheet
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        courseId={courseId}
        courseTitle={courseTitle}
        students={students ?? []}
        schedule={schedule}
        initialWords={initialWords}
        onCreated={(id) => {
          setNewOpen(false);
          reload();
          openStatus(id);
        }}
      />
      {statusFor && (
        <NotSubmittedSheet
          visible
          homeworkId={statusFor.id}
          courseTitle={courseTitle}
          initialTab={statusFor.tab}
          onClose={() => {
            setStatusFor(null);
            reload();
          }}
          onOpenStudent={(id, name) => {
            setStatusFor(null);
            rootNav?.navigate('StudentDetail', {
              courseId,
              courseTitle,
              studentId: id,
              studentName: name,
              studentInitials: name.slice(0, 2).toUpperCase(),
              streak: 0,
              todayCards: 0,
              lastActivity: '',
            });
          }}
        />
      )}
    </>
  ) : null;

  return { list, current, reload, openNew, openHomework, openStatus, openNotSubmitted, sheets };
}
