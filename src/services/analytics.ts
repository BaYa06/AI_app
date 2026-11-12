/**
 * analytics.ts — Централизованный сервис Firebase Analytics для Flashly
 *
 * Использование:
 *   import { Analytics } from '@/services/analytics';
 *   Analytics.studySessionStart('set_123', 'flashcard', 20);
 *
 * Все события задокументированы — что они трекают и зачем.
 */

// Веб — Firebase JS SDK, iOS — @react-native-firebase/analytics (analyticsTransport.native.ts)
import { sendUserProperties } from './analyticsTransport';
import { authEvents } from './analyticsEvents/auth';
import { contentEvents } from './analyticsEvents/content';
import { studyEvents } from './analyticsEvents/study';
import { engagementEvents } from './analyticsEvents/engagement';
import { monetizationEvents } from './analyticsEvents/monetization';
import { navigationEvents } from './analyticsEvents/navigation';
import { errorsEvents } from './analyticsEvents/errors';
import { teacherEvents } from './analyticsEvents/teacher';
import type { SubscriptionTier } from './analyticsEvents/core';

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
  sendUserProperties({
    subscription_tier: props.subscription_tier,
    app_language: props.language,
    days_since_registration: props.days_since_registration,
    total_sets_bucket: props.total_sets_bucket,
    has_completed_onboarding: String(props.has_completed_onboarding),
  });
}

/**
 * Контрольная группа пушей (plan/new/push_notifications.md, 2.5): 10 % без маркетинговых пушей.
 * Та же формула, что isHoldout в api/push/_decide.js — последние 7 hex-символов UUID, % 100 < 10.
 * Свойство push_group нужно, чтобы сравнивать удержание групп в GA4.
 */
export function pushGroupFor(userId: string): 'holdout' | 'push' {
  const n = parseInt(userId.replace(/-/g, '').slice(-7), 16);
  return Number.isFinite(n) && n % 100 < 10 ? 'holdout' : 'push';
}

/** Сегмент активности (2.6) — чтобы резать любые воронки по нему */
export function setActivitySegmentProperty(segment: string) {
  sendUserProperties({ activity_segment: segment });
}

/**
 * Эксперимент 4.3: как просим разрешение у новых пользователей iOS. preprompt — только лист после
 * первого урока (вариант B); provisional — тихие уведомления сразу после онбординга + тот же лист (C).
 * Половина на половину по первым 7 hex-символам UUID (не те, что у контрольной группы).
 */
export function pushPermissionFlowFor(userId: string): 'provisional' | 'preprompt' {
  const n = parseInt(userId.replace(/-/g, '').slice(0, 7), 16);
  return Number.isFinite(n) && n % 2 === 1 ? 'provisional' : 'preprompt';
}

export function setPushPermissionFlowProperty(userId: string) {
  sendUserProperties({ push_permission_flow: pushPermissionFlowFor(userId) });
}

export function setPushGroupProperty(userId: string) {
  sendUserProperties({ push_group: pushGroupFor(userId) });
}

// ─────────────────────────────────────────────────────────────────────────────
// СОБЫТИЯ
// ─────────────────────────────────────────────────────────────────────────────

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

/** Каталог событий — по разделам в services/analytics/* (Clean 9), API прежний. */
export const Analytics = {
  ...authEvents,
  ...contentEvents,
  ...studyEvents,
  ...engagementEvents,
  ...monetizationEvents,
  ...navigationEvents,
  ...errorsEvents,
  ...teacherEvents,
};
