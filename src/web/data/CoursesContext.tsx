/**
 * Курсы учителя и идущие тесты — один раз на кабинет, чтобы меню, «Обзор» и страница курса
 * не грузили их каждый по-своему. После создания, переименования и удаления курса — reload().
 */
import React, { createContext, useContext, useMemo } from 'react';
import type { ActiveTest } from '@/services/activeTest';
import { useLoad } from '../useLoad';
import { TeacherData, type WebCourse } from './teacher';

type Ctx = {
  courses: WebCourse[] | null;
  coursesError: unknown;
  coursesLoading: boolean;
  reloadCourses: () => void;
  activeTests: ActiveTest[];
};

const CoursesContext = createContext<Ctx | null>(null);

/** Раз в сколько обновляем «идёт тест» */
const ACTIVE_TESTS_MS = 30_000;

export function CoursesProvider({ children }: { children: React.ReactNode }) {
  const courses = useLoad(() => TeacherData.courses(), []);
  const tests = useLoad(() => TeacherData.activeTests(), [], { refreshMs: ACTIVE_TESTS_MS });

  const value = useMemo<Ctx>(
    () => ({
      courses: courses.data,
      coursesError: courses.error,
      coursesLoading: courses.loading,
      reloadCourses: courses.reload,
      activeTests: tests.data ?? [],
    }),
    [courses.data, courses.error, courses.loading, courses.reload, tests.data]
  );
  return <CoursesContext.Provider value={value}>{children}</CoursesContext.Provider>;
}

export function useCourses(): Ctx {
  const ctx = useContext(CoursesContext);
  if (!ctx) throw new Error('useCourses вне CoursesProvider');
  return ctx;
}
