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
