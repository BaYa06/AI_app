/**
 * Удаление курса (учитель/свой курс) и выход из курса (ученик): данные окон и обработчики
 * (Clean 8a — перенесено из HomeScreen без изменений логики). Состояние «какое окно открыто»
 * остаётся в HomeScreen: его читает ещё и useWhatsNewOnHome.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui';
import { useCoursesStore } from '@/store';
import { getSession } from '@/services/auth/session';
import { NeonService } from '@/services/NeonService';
import { BookService } from '@/services/BookService';
import { pluralize } from '@/utils';
import type { CardSet, Course } from '@/types';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

type Params = {
  courses: Course[];
  allSets: CardSet[];
  formatSetWord: (count: number) => string;
  deleteCourse: (id: string) => void;
  runAfterDrawerClosed: (fn: () => void) => void;
  setCourseMenuOpen: SetState<string | null>;
  deleteModalCourseId: string | null;
  setDeleteModalCourseId: SetState<string | null>;
  leaveModalCourseId: string | null;
  setLeaveModalCourseId: SetState<string | null>;
  setLeaveLoading: SetState<boolean>;
};

export function useCourseRemoval({
  courses,
  allSets,
  formatSetWord,
  deleteCourse,
  runAfterDrawerClosed,
  setCourseMenuOpen,
  deleteModalCourseId,
  setDeleteModalCourseId,
  leaveModalCourseId,
  setLeaveModalCourseId,
  setLeaveLoading,
}: Params) {
  const deleteModalCourse = useMemo(
    () => courses.find((c) => c.id === deleteModalCourseId) || null,
    [courses, deleteModalCourseId]
  );

  // Что удалится вместе с курсом: только свои наборы (юниты книг остаются в каталоге)
  const deleteModalStats = useMemo(() => {
    if (!deleteModalCourseId) return null;
    const own = allSets.filter(
      (s) => s.courseId === deleteModalCourseId && !s.isOfficial && !s.isReadOnly
    );
    return { setCount: own.length, cardCount: own.reduce((sum, s) => sum + (s.cardCount || 0), 0) };
  }, [deleteModalCourseId, allSets]);

  const deleteModalHasSets = deleteModalStats ? deleteModalStats.setCount > 0 : false;
  // Галочка «Я понимаю» — без неё курс с наборами не удалить; сбрасывается при каждом открытии
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  // Ученики курса — у них тоже пропадут наборы; null — ещё не знаем (или нет сети)
  const [deleteModalStudents, setDeleteModalStudents] = useState<number | null>(null);
  useEffect(() => {
    setDeleteConfirmed(false);
    setDeleteModalStudents(null);
    if (!deleteModalCourseId || !NeonService.isEnabled()) return;
    let cancelled = false;
    NeonService.loadCourseMembers(deleteModalCourseId)
      .then((members) => {
        if (!cancelled) setDeleteModalStudents(members.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deleteModalCourseId]);

  const deleteModalMessage = useMemo(() => {
    if (!deleteModalCourse || !deleteModalStats) return '';
    if (deleteModalHasSets) {
      const { setCount, cardCount } = deleteModalStats;
      return `Вместе с курсом «${deleteModalCourse.title}» удалятся ${setCount} ${formatSetWord(setCount)} и ${cardCount} ${pluralize(cardCount, 'карточка', 'карточки', 'карточек')}, а также весь прогресс по ним. Вернуть их будет нельзя.`;
    }
    return `Удалить курс «${deleteModalCourse.title}»?`;
  }, [deleteModalCourse, deleteModalHasSets, deleteModalStats, formatSetWord]);

  // Обработка удаления курса через модальное окно
  const openDeleteModal = useCallback(
    (courseId: string) => {
      setCourseMenuOpen(null);
      runAfterDrawerClosed(() => setDeleteModalCourseId(courseId));
    },
    // Параметры-сеттеры (useState) и действия стора — ссылки постоянные: в зависимостях только для линтера
    [runAfterDrawerClosed, setCourseMenuOpen, setDeleteModalCourseId]
  );

  const closeDeleteModal = useCallback(() => {
    setDeleteModalCourseId(null);
  }, [setDeleteModalCourseId]);

  const confirmDeleteCourse = useCallback(() => {
    if (!deleteModalCourseId) return;
    if (deleteModalHasSets && !deleteConfirmed) return;

    deleteCourse(deleteModalCourseId);
    setDeleteModalCourseId(null);
  }, [
    deleteModalCourseId,
    deleteModalHasSets,
    deleteConfirmed,
    deleteCourse,
    setDeleteModalCourseId,
  ]);

  const removeLocalCourse = useCoursesStore((s) => s.removeLocalCourse);

  // «Выйти из курса» из боковой панели: как и остальные действия — окно после её закрытия.
  // Раньше окно открывалось сразу, под открытой панелью, и кнопка «не работала».
  const openLeaveModal = useCallback(
    (courseId: string) => {
      setCourseMenuOpen(null);
      runAfterDrawerClosed(() => setLeaveModalCourseId(courseId));
    },
    // Параметры-сеттеры (useState) и действия стора — ссылки постоянные: в зависимостях только для линтера
    [runAfterDrawerClosed, setCourseMenuOpen, setLeaveModalCourseId]
  );

  const handleLeaveCourse = useCallback(async () => {
    if (!leaveModalCourseId) return;
    setLeaveLoading(true);
    try {
      const authSession = await getSession();
      const userId = authSession?.user?.id;
      if (!userId) {
        toast.info('Войди в аккаунт, чтобы выйти из курса');
        return;
      }

      const success = await NeonService.leaveStudentCourse(leaveModalCourseId, userId);
      if (success) {
        removeLocalCourse(leaveModalCourseId);
        setLeaveModalCourseId(null);
        // Юнит учебника мог быть открыт и в другом курсе — вернуть его туда после локальной чистки
        BookService.syncOfficialSets().catch(() => {});
      } else {
        toast.error('Не удалось выйти из курса. Попробуй ещё раз');
      }
    } catch {
      toast.error('Не удалось выйти из курса');
    } finally {
      setLeaveLoading(false);
    }
  }, [leaveModalCourseId, removeLocalCourse, setLeaveLoading, setLeaveModalCourseId]);

  return {
    deleteModalHasSets,
    deleteConfirmed,
    setDeleteConfirmed,
    deleteModalStudents,
    deleteModalMessage,
    openDeleteModal,
    closeDeleteModal,
    confirmDeleteCourse,
    openLeaveModal,
    handleLeaveCourse,
  };
}
