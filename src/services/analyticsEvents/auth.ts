/** События: Вход и регистрация (Clean 9 — из Analytics без изменений). */
import { type AuthMethod, log } from './core';

export const authEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // АУТЕНТИФИКАЦИЯ
  // Зачем: понять откуда приходят юзеры, какой метод регистрации популярнее,
  // и где отваливаются (sign_up без последующего onboarding_complete = проблема).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер успешно зарегистрировался.
   * GA4 автоматически строит Retention отчёт от этой точки.
   */
  signUp: (method: AuthMethod) => log('sign_up', { method }),

  /**
   * Юзер вошёл в уже существующий аккаунт.
   */
  login: (method: AuthMethod) => log('login', { method }),

  /**
   * Юзер завершил онбординг (дошёл до главного экрана).
   * Funnel: sign_up → onboarding_complete.
   * Если конверсия низкая — онбординг надо упрощать.
   */
  onboardingComplete: () => log('onboarding_complete'),

  /**
   * «Перепутал? Поменять местами» на экране изучаемого языка (Start 2.3).
   * Доля от onboarding_complete больше 5% — экраны языков всё ещё путают.
   */
  onboardingLanguagesSwapped: () => log('onboarding_languages_swapped'),

  /** Ученик курса на онбординге (Start 7.5): присоединился по коду или ссылке / «Это не мой курс» */
  courseJoinOnboarding: (via: 'code' | 'link') => log('course_join_onboarding', { via }),
  courseJoinNotMine: (via: 'code' | 'link') => log('course_join_not_mine', { via }),

  /**
   * Показан шаг онбординга (Start 2.8): воронка по шагам — где уходят.
   * sec_since_sign_in — сколько прошло от входа.
   */
  onboardingStepViewed: (step: string, secSinceSignIn: number) =>
    log('onboarding_step_viewed', { step, sec_since_sign_in: secSinceSignIn }),

  /** Первый урок в онбординге начат / закончен; цель — закончить меньше чем за 2 минуты от входа */
  firstLessonStarted: (secSinceSignIn: number) =>
    log('first_lesson_started', { sec_since_sign_in: secSinceSignIn }),
  firstLessonCompleted: (secSinceSignIn: number) =>
    log('first_lesson_completed', { sec_since_sign_in: secSinceSignIn }),

  /**
   * Новому ученику выдан стартовый набор (plan/new/new_user_activation.md, Start 1.5).
   * Сколько учеников с набором начали его учить — starter_set_first_answer.
   */
  starterSetCreated: (params: { target: string; native: string; theme: string }) =>
    log('starter_set_created', {
      target_language: params.target,
      native_language: params.native,
      theme: params.theme,
    }),

  /**
   * Первый ответ по карточке стартового набора — один раз на устройство.
   * Funnel: starter_set_created → starter_set_first_answer.
   */
  starterSetFirstAnswer: (mode: string) => log('starter_set_first_answer', { mode }),

  /**
   * Юзер вышел из аккаунта.
   */
  logout: () => log('logout'),
};
