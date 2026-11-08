/** Общее для событий аналитики: типы параметров и отправка (Clean 9 — из analytics.ts без изменений). */
import { sendEvent } from '../analyticsTransport';

// ─────────────────────────────────────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────────────────────────────────────

export type StudyMode = 'flashcard' | 'quiz' | 'write' | 'audio' | 'match';
export type SubscriptionTier = 'free' | 'premium';
export type PaywallSource = 'ai_limit' | 'stats_screen' | 'settings' | 'onboarding' | 'set_detail';
export type AuthMethod = 'email' | 'google' | 'apple' | 'anonymous';
export type CardRating = 'again' | 'hard' | 'good' | 'easy'; // оценки SRS
/** Что главная предлагает главным действием в момент показа */
export type HomeState = 'daily_review' | 'study_all' | 'no_sets' | 'teacher';
/** Что нажали на главной (plan/done/home_redesign.md, шаг 0.2) */
export type HomeAction =
  | 'daily_review'
  | 'extra_new'
  | 'change_set'
  | 'find_set'
  | 'study_all'
  | 'challenge_quick'
  | 'challenge_sniper'
  | 'challenge_forgotten'
  | 'rating'
  | 'set'
  | 'create_set'
  | 'join_course'
  | 'add_by_link'
  | 'search'
  | 'sort'
  | 'sets_menu'
  | 'open_courses';

// ─────────────────────────────────────────────────────────────────────────────
// Внутренний helper
// ─────────────────────────────────────────────────────────────────────────────

export function log(event: string, params?: Record<string, string | number | boolean>) {
  sendEvent(event, params);
}
