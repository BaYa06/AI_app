/**
 * analytics.ts — Централизованный сервис Firebase Analytics для Flashly
 *
 * Использование:
 *   import { Analytics } from '@/services/analytics';
 *   Analytics.studySessionStart('set_123', 'flashcard', 20);
 *
 * Все события задокументированы — что они трекают и зачем.
 */

import { analytics } from './firebase';
import { logEvent, setUserProperties as fbSetUserProperties } from 'firebase/analytics';

// ─────────────────────────────────────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────────────────────────────────────

type StudyMode = 'flashcard' | 'quiz' | 'write' | 'audio' | 'match';
type SubscriptionTier = 'free' | 'premium';
type PaywallSource = 'ai_limit' | 'stats_screen' | 'settings' | 'onboarding' | 'set_detail';
type AuthMethod = 'email' | 'google' | 'apple' | 'anonymous';
type CardRating = 'again' | 'hard' | 'good' | 'easy'; // оценки SRS

// ─────────────────────────────────────────────────────────────────────────────
// Внутренний helper
// ─────────────────────────────────────────────────────────────────────────────

function log(event: string, params?: Record<string, string | number | boolean>) {
  if (!analytics) {
    // На мобиле (React Native) analytics = null, пишем в консоль для отладки
    if (__DEV__) console.log(`[Analytics] ${event}`, params);
    return;
  }
  try {
    logEvent(analytics, event, params);
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] logEvent error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROPERTIES
// Устанавливаются один раз при логине / изменении данных.
// Позволяют фильтровать ЛЮБОЙ отчёт в GA4 по этим сегментам.
// ─────────────────────────────────────────────────────────────────────────────

export function setAnalyticsUserProperties(props: {
  subscription_tier: SubscriptionTier;
  language: 'ru' | 'en';
  days_since_registration: '0-7' | '8-30' | '31-90' | '90+';
  total_sets_bucket: '0' | '1-5' | '6-20' | '20+';
  has_completed_onboarding: boolean;
}) {
  if (!analytics) return;
  try {
    fbSetUserProperties(analytics, {
      subscription_tier: props.subscription_tier,
      app_language: props.language,
      days_since_registration: props.days_since_registration,
      total_sets_bucket: props.total_sets_bucket,
      has_completed_onboarding: String(props.has_completed_onboarding),
    });
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] setUserProperties error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// СОБЫТИЯ
// ─────────────────────────────────────────────────────────────────────────────

export const Analytics = {

  // ═══════════════════════════════════════════════════════════════════════════
  // АУТЕНТИФИКАЦИЯ
  // Зачем: понять откуда приходят юзеры, какой метод регистрации популярнее,
  // и где отваливаются (sign_up без последующего onboarding_complete = проблема).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер успешно зарегистрировался.
   * GA4 автоматически строит Retention отчёт от этой точки.
   */
  signUp: (method: AuthMethod) =>
    log('sign_up', { method }),

  /**
   * Юзер вошёл в уже существующий аккаунт.
   */
  login: (method: AuthMethod) =>
    log('login', { method }),

  /**
   * Юзер завершил онбординг (дошёл до главного экрана).
   * Funnel: sign_up → onboarding_complete.
   * Если конверсия низкая — онбординг надо упрощать.
   */
  onboardingComplete: () =>
    log('onboarding_complete'),

  /**
   * Юзер вышел из аккаунта.
   */
  logout: () =>
    log('logout'),


  // ═══════════════════════════════════════════════════════════════════════════
  // НАБОРЫ КАРТОЧЕК
  // Зачем: понять как юзеры создают контент. Если set_created много,
  // но study_session_start мало — юзеры создают наборы, но не учатся.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер создал новый набор карточек.
   */
  setCreated: (cardCount: number, hasDescription: boolean) =>
    log('set_created', { card_count: cardCount, has_description: hasDescription }),

  /**
   * Юзер открыл детальную страницу набора.
   * Зачем: видим какие наборы просматривают, но не изучают (set_viewed без study_session_start).
   */
  setViewed: (setId: string, cardCount: number, progressPercent: number) =>
    log('set_viewed', {
      set_id: setId,
      card_count: cardCount,
      progress_percent: Math.round(progressPercent),
    }),

  /**
   * Юзер удалил набор.
   * Зачем: если удалений много — юзеры создают случайные наборы. Нужны шаблоны.
   */
  setDeleted: (cardCount: number) =>
    log('set_deleted', { card_count: cardCount }),

  /**
   * Юзер добавил набор из публичной библиотеки в свою коллекцию.
   */
  setImportedFromLibrary: (setId: string) =>
    log('set_imported_from_library', { set_id: setId }),

  /**
   * Юзер импортировал CSV / Anki / Quizlet.
   */
  setImportedExternal: (source: 'csv' | 'anki' | 'quizlet', cardCount: number) =>
    log('set_imported_external', { source, card_count: cardCount }),


  // ═══════════════════════════════════════════════════════════════════════════
  // КАРТОЧКИ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер создал карточку вручную.
   * Зачем: baseline для сравнения с AI-генерацией.
   */
  cardCreatedManual: () =>
    log('card_created_manual'),

  /**
   * Карточка создана через AI-генерацию.
   */
  cardCreatedAI: () =>
    log('card_created_ai'),


  // ═══════════════════════════════════════════════════════════════════════════
  // СЕССИИ ОБУЧЕНИЯ
  // Зачем: это ключевые события. Funnel:
  //   set_viewed → study_mode_selected → study_session_start → study_session_complete
  // Провал на любом шаге = проблема UX.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер выбрал режим изучения (но ещё не начал).
   * Зачем: видим распределение режимов. Если quiz не выбирают — может, кнопка неудобная.
   */
  studyModeSelected: (mode: StudyMode, cardCount: number) =>
    log('study_mode_selected', { mode, card_count: cardCount }),

  /**
   * Сессия изучения началась.
   * Зачем: считаем DAU (daily active users) по факту начала обучения, не просто открытия приложения.
   */
  studySessionStart: (params: {
    setId: string;
    mode: StudyMode;
    cardCount: number;
    isReview: boolean; // повторение по SRS или первое изучение
    phaseId?: string;
  }) =>
    log('study_session_start', {
      set_id: params.setId,
      mode: params.mode,
      card_count: params.cardCount,
      is_review: params.isReview,
      phase_id: params.phaseId ?? '',
    }),

  /**
   * Юзер ответил на карточку.
   * Зачем: смотрим среднюю точность по всем юзерам.
   * Если accuracy < 50% — карточки слишком сложные или режим не работает.
   */
  cardAnswered: (params: {
    correct: boolean;
    rating?: CardRating; // только для flashcard-режима
    timeSpentMs: number;
    mode: StudyMode;
  }) =>
    log('card_answered', {
      correct: params.correct,
      rating: params.rating ?? '',
      time_spent_ms: params.timeSpentMs,
      mode: params.mode,
    }),

  /**
   * Сессия завершена (дошли до конца набора / порции).
   * Зачем: считаем completion rate. Если мало — юзеры бросают на середине.
   * timeSpentSec + cardCount = средний темп обучения.
   */
  studySessionComplete: (params: {
    setId: string;
    mode: StudyMode;
    cardCount: number;
    correctAnswers: number;
    timeSpentSec: number;
    phaseComplete: boolean; // завершена вся фаза или только порция
  }) =>
    log('study_session_complete', {
      set_id: params.setId,
      mode: params.mode,
      card_count: params.cardCount,
      correct_answers: params.correctAnswers,
      accuracy: Math.round((params.correctAnswers / params.cardCount) * 100),
      time_spent_sec: params.timeSpentSec,
      phase_complete: params.phaseComplete,
    }),

  /**
   * Юзер бросил сессию до конца (нажал ×).
   * Зачем: если exit_ratio высокий для конкретного режима — он неудобный.
   */
  studySessionAbandoned: (params: {
    setId: string;
    mode: StudyMode;
    cardsCompleted: number;
    totalCards: number;
    timeSpentSec: number;
  }) =>
    log('study_session_abandoned', {
      set_id: params.setId,
      mode: params.mode,
      cards_completed: params.cardsCompleted,
      total_cards: params.totalCards,
      exit_percent: Math.round((params.cardsCompleted / params.totalCards) * 100),
      time_spent_sec: params.timeSpentSec,
    }),


  // ═══════════════════════════════════════════════════════════════════════════
  // STREAK (СЕРИИ)
  // Зачем: streak — главный retention-механизм. Видим где юзеры теряют серию
  // и насколько эффективны напоминания.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер достиг milestone по streak.
   * Зачем: можно строить cohort — юзеры с 7-дневным streak остаются на 30 день в X% случаев.
   */
  streakMilestone: (days: number) =>
    log('streak_milestone', { days }),

  /**
   * Юзер потерял streak (пропустил день).
   * Зачем: если потери происходят в определённые дни недели — слабые напоминания.
   */
  streakLost: (previousStreak: number) =>
    log('streak_lost', { previous_streak: previousStreak }),

  /**
   * Юзер восстановил streak (вернулся после пропуска).
   */
  streakRestored: (newStreak: number) =>
    log('streak_restored', { new_streak: newStreak }),


  // ═══════════════════════════════════════════════════════════════════════════
  // AI-ГЕНЕРАЦИЯ
  // Зачем: AI — ключевая premium-фича. Трекаем использование и конверсию.
  // Если free юзеры активно используют лимит → paywall уместен.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер запустил AI-генерацию карточек.
   */
  aiGenerationStart: (params: {
    inputType: 'text' | 'topic' | 'pdf';
    requestedCount: number;
    isFreeTier: boolean;
    remainingGenerations: number;
  }) =>
    log('ai_generation_start', {
      input_type: params.inputType,
      requested_count: params.requestedCount,
      is_free_tier: params.isFreeTier,
      remaining_generations: params.remainingGenerations,
    }),

  /**
   * AI-генерация завершена успешно.
   */
  aiGenerationSuccess: (params: {
    generatedCount: number;
    durationMs: number;
  }) =>
    log('ai_generation_success', {
      generated_count: params.generatedCount,
      duration_ms: params.durationMs,
    }),

  /**
   * AI-генерация завершилась ошибкой.
   * Зачем: видим reliability AI-фичи. Если error_rate > 5% — проблема.
   */
  aiGenerationError: (errorCode: string) =>
    log('ai_generation_error', { error_code: errorCode }),

  /**
   * Юзер достиг лимита бесплатных AI-генераций.
   * Зачем: это ключевая точка конверсии. Что делает юзер дальше — paywall или уходит?
   */
  aiLimitReached: () =>
    log('ai_limit_reached'),


  // ═══════════════════════════════════════════════════════════════════════════
  // МОНЕТИЗАЦИЯ
  // Зачем: понять путь к покупке. Funnel:
  //   paywall_shown → premium_upgrade_click → purchase
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Paywall показан юзеру.
   * Зачем: если paywall_shown много, но premium_upgrade_click мало → оффер слабый.
   */
  paywallShown: (source: PaywallSource) =>
    log('paywall_shown', { source }),

  /**
   * Юзер нажал кнопку апгрейда на premium.
   */
  premiumUpgradeClick: (source: PaywallSource) =>
    log('premium_upgrade_click', { source }),

  /**
   * Покупка premium завершена.
   * Используем стандартное GA4 e-commerce событие — автоматически попадает в Revenue отчёт.
   */
  premiumPurchase: (params: {
    plan: 'monthly' | 'yearly';
    priceUsd: number;
    currency?: string;
  }) =>
    log('purchase', {
      currency: params.currency ?? 'USD',
      value: params.priceUsd,
      transaction_id: `${Date.now()}`,
      items: JSON.stringify([{ item_id: params.plan, item_name: `Premium ${params.plan}` }]),
    }),

  /**
   * Юзер отменил подписку.
   * Зачем: видим churn rate и можем строить cohort по причинам.
   */
  premiumCancelled: (plan: 'monthly' | 'yearly', daysActive: number) =>
    log('premium_cancelled', { plan, days_active: daysActive }),


  // ═══════════════════════════════════════════════════════════════════════════
  // КОРПОРАТИВНЫЙ ТАРИФ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Учитель создал курс.
   */
  courseCreated: (studentCount: number) =>
    log('course_created', { student_count: studentCount }),

  /**
   * Ученик принял приглашение в курс.
   */
  courseInviteAccepted: () =>
    log('course_invite_accepted'),

  /**
   * Учитель экспортировал статистику.
   */
  statsExported: (format: 'csv' | 'pdf', period: 'week' | 'month' | 'all') =>
    log('stats_exported', { format, period }),


  // ═══════════════════════════════════════════════════════════════════════════
  // УВЕДОМЛЕНИЯ
  // Зачем: push-уведомления — главный retention-инструмент.
  // Трекаем permission rate и эффективность.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер дал разрешение на push-уведомления.
   */
  pushPermissionGranted: () =>
    log('push_permission_granted'),

  /**
   * Юзер отказал в push-уведомлениях.
   */
  pushPermissionDenied: () =>
    log('push_permission_denied'),

  /**
   * Юзер открыл приложение через push-уведомление.
   * Зачем: считаем CTR пушей. Ниже 5% → нужно менять текст/время.
   */
  pushNotificationOpened: (notificationType: 'streak_reminder' | 'teacher_alert' | 'weekly_report') =>
    log('push_notification_opened', { notification_type: notificationType }),


  // ═══════════════════════════════════════════════════════════════════════════
  // НАВИГАЦИЯ И ФИЧИ
  // Зачем: понять какие экраны используются, а какие — нет (можно убрать/упростить).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер открыл экран статистики.
   * Зачем: если stats_screen_viewed мало — юзеры не знают о фиче. Нужен промоушен.
   */
  statsScreenViewed: () =>
    log('stats_screen_viewed'),

  /**
   * Юзер открыл публичную библиотеку наборов.
   */
  libraryScreenViewed: () =>
    log('library_screen_viewed'),

  /**
   * Юзер использовал поиск.
   */
  searchPerformed: (screen: 'home' | 'library', hasResults: boolean) =>
    log('search_performed', { screen, has_results: hasResults }),

  /**
   * Юзер поделился набором.
   */
  setShared: (method: 'link' | 'qr') =>
    log('set_shared', { method }),

  /**
   * Юзер изменил тему оформления.
   */
  themeChanged: (theme: 'light' | 'dark' | 'system') =>
    log('theme_changed', { theme }),

  /**
   * Юзер изменил язык интерфейса.
   */
  languageChanged: (language: 'ru' | 'en') =>
    log('language_changed', { language }),


  // ═══════════════════════════════════════════════════════════════════════════
  // ОШИБКИ И ТЕХНИЧЕСКИЕ СОБЫТИЯ
  // Зачем: видим user-facing ошибки до того как они попадут в отзывы.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Произошла ошибка синхронизации с сервером.
   */
  syncError: (errorCode: string) =>
    log('sync_error', { error_code: errorCode }),

  /**
   * Юзер увидел экран ошибки (error boundary).
   */
  errorBoundaryTriggered: (screen: string) =>
    log('error_boundary_triggered', { screen }),

};

// ─────────────────────────────────────────────────────────────────────────────
// ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
// ─────────────────────────────────────────────────────────────────────────────
//
// === АВТОРИЗАЦИЯ (AuthScreen.tsx) ===
//
//   Analytics.signUp('email');
//   setAnalyticsUserId(user.id);         // из firebase.ts
//   setAnalyticsUserProperties({
//     subscription_tier: 'free',
//     language: 'ru',
//     days_since_registration: '0-7',
//     total_sets_bucket: '0',
//     has_completed_onboarding: false,
//   });
//
//
// === НАЧАЛО СЕССИИ (SetDetailScreen.tsx) ===
//
//   Analytics.studyModeSelected('flashcard', set.cards.length);
//   Analytics.studySessionStart({
//     setId: set.id,
//     mode: 'flashcard',
//     cardCount: cards.length,
//     isReview: false,
//     phaseId: phaseId,
//   });
//
//
// === ОТВЕТ НА КАРТОЧКУ (StudyScreen.tsx) ===
//
//   Analytics.cardAnswered({
//     correct: rating !== 'again',
//     rating: rating,           // 'again' | 'hard' | 'good' | 'easy'
//     timeSpentMs: Date.now() - cardShownAt,
//     mode: 'flashcard',
//   });
//
//
// === ЗАВЕРШЕНИЕ СЕССИИ (StudyResultsScreen.tsx) ===
//
//   Analytics.studySessionComplete({
//     setId: setId,
//     mode: mode,
//     cardCount: totalCards,
//     correctAnswers: correctCount,
//     timeSpentSec: Math.round(duration / 1000),
//     phaseComplete: studiedInPhase >= totalPhaseCards,
//   });
//
//
// === AI ГЕНЕРАЦИЯ (AIGenerateScreen.tsx) ===
//
//   Analytics.aiGenerationStart({
//     inputType: 'text',
//     requestedCount: 20,
//     isFreeTier: !user.isPremium,
//     remainingGenerations: remaining,
//   });
//   // после ответа API:
//   Analytics.aiGenerationSuccess({ generatedCount: cards.length, durationMs: elapsed });
//
//
// === ПОКУПКА PREMIUM (PaywallScreen.tsx) ===
//
//   Analytics.paywallShown('ai_limit');
//   // при нажатии кнопки:
//   Analytics.premiumUpgradeClick('ai_limit');
//   // после успешной оплаты:
//   Analytics.premiumPurchase({ plan: 'monthly', priceUsd: 4.99 });
//
// ─────────────────────────────────────────────────────────────────────────────
