/**
 * Сервис данных пользователя (наборы, карточки, курсы, прогресс, серия).
 * @description Все запросы идут через backend (api/data.js, api/teacher.js) с Supabase JWT —
 * строки подключения к БД в приложении нет. См. plan/course_rating_and_review_plan.md, этап 0.
 */

import { profileApi } from './neon/profile';
import { setsApi } from './neon/sets';
import { streakApi } from './neon/streak';
import { progressApi } from './neon/progress';
import { coursesApi } from './neon/courses';

export { NetworkLoadError } from './neon/core';
export type {
  TeacherApiReason,
  CourseLeaderboard,
  FeedbackPayload,
  CourseScheduleItem,
  AgeRange,
  AboutMe,
  UserStatsData,
  BootstrapData,
} from './neon/core';

/** Единый фасад: методы разнесены по доменам в services/neon/* (Clean 9), API прежний. */
export const NeonService = {
  ...profileApi,
  ...setsApi,
  ...streakApi,
  ...progressApi,
  ...coursesApi,
};
