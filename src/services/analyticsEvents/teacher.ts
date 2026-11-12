import { log } from './core';

/** Где учитель нажал: главная (карточка урока, быстрые действия) или страница курса */
export type TeacherPlace = 'home' | 'course';

export type TeacherAction =
  | 'live_test'
  | 'join_code'
  | 'students'
  | 'inactive'
  | 'remind'
  | 'schedule'
  | 'course'
  | 'books'
  | 'homework';

export const teacherEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // КАБИНЕТ УЧИТЕЛЯ (plan/new/teacher_cabinet.md, Teacher 12)
  // Зачем: учителя заходили один раз и бросали. Смотрим, возвращаются ли они и что делают.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Учитель открыл главную в своём курсе (раз на курс за показ главной).
   * Зачем: сколько учителей заходят регулярно; есть ли у курса расписание и сколько учеников пропали.
   */
  teacherHomeViewed: (params: { hasSchedule: boolean; students: number; inactive: number }) =>
    log('teacher_home_viewed', {
      has_schedule: params.hasSchedule,
      students: params.students,
      inactive: params.inactive,
    }),

  /**
   * Нажатие в кабинете учителя.
   * Зачем: какие действия нужны (живой тест, напомнить, код), а какие никто не трогает.
   */
  teacherAction: (action: TeacherAction, place: TeacherPlace) =>
    log('teacher_action', { action, place }),

  /**
   * Курс создан через окно «Новый курс».
   * Зачем: сколько сразу подключают учебник и расписание; problems — что не сохранилось.
   */
  teacherCourseCreated: (params: { withBook: boolean; withSchedule: boolean; problems: string }) =>
    log('teacher_course_created', {
      with_book: params.withBook,
      with_schedule: params.withSchedule,
      problems: params.problems,
    }),
};
