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
  | 'homework'
  | 'homework_export'
  // Этап 3 «Подготовка к уроку» (Teacher 44)
  | 'lesson_prep'
  | 'warmup_start'
  | 'lesson_check'
  | 'prep_remind'
  | 'warmup_homework';

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
   * Учитель открыл экран «Перед уроком» (10).
   * Зачем: пользуются ли подготовкой к уроку вообще.
   */
  teacherLessonPrepViewed: () => log('teacher_lesson_prep_viewed', {}),

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

  /**
   * Учитель выдал задание через окно «Новое задание» (этап 2).
   * Зачем: какой объём задают, ставят ли порог, сколько дней дают; result — ok или причина отказа.
   */
  teacherHomeworkCreated: (params: {
    words: number;
    sets: number;
    minScore: number;
    allStudents: boolean;
    days: number;
    result: string;
  }) =>
    log('teacher_homework_created', {
      words: params.words,
      sets: params.sets,
      min_score: params.minScore,
      all_students: params.allStudents,
      days: params.days,
      result: params.result,
    }),
};
