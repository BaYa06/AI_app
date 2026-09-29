/**
 * Обратная связь: «Написать нам» и окно оценки приложения.
 * Всё уходит в app_feedback (api/data.js → submitFeedback) и смотрится в админке.
 */
import { Platform } from 'react-native';
import { version as APP_VERSION } from '../../package.json';
import { NeonService } from './NeonService';
import { StorageService } from './StorageService';

export type FeedbackCategory = 'problem' | 'idea' | 'question';
export type FeedbackTag = 'speech' | 'cards' | 'tests' | 'courses' | 'sync' | 'other';

export const FEEDBACK_TAGS: Array<{ value: FeedbackTag; label: string }> = [
  { value: 'speech', label: 'Озвучка' },
  { value: 'cards', label: 'Карточки' },
  { value: 'tests', label: 'Тесты' },
  { value: 'courses', label: 'Курсы' },
  { value: 'sync', label: 'Синхронизация' },
  { value: 'other', label: 'Другое' },
];

/** Приложение прикладывает само — пользователю не нужно ничего объяснять */
function deviceMeta() {
  return {
    appVersion: APP_VERSION,
    platform: Platform.OS,
    osVersion: String(Platform.Version),
  };
}

export function sendFeedbackMessage(category: FeedbackCategory, message: string): Promise<boolean> {
  return NeonService.submitFeedback({ kind: 'message', category, message: message.trim(), ...deviceMeta() });
}

export function sendRating(params: {
  rating: number;
  hasProblem: boolean | null;
  tags?: FeedbackTag[];
  message?: string;
}): Promise<boolean> {
  return NeonService.submitFeedback({
    kind: 'rating',
    rating: params.rating,
    hasProblem: params.hasProblem,
    tags: params.tags && params.tags.length > 0 ? params.tags : undefined,
    message: params.message?.trim() || undefined,
    ...deviceMeta(),
  });
}

// ==================== Когда показывать окно оценки ====================
// Не навязчиво: только после удачной тренировки, у тех, кто пользуется приложением не первый день.

const PROMPT_KEY = 'rating_prompt';
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS_OF_USE = 3;
const MIN_SESSIONS = 5;
const MIN_CARDS_IN_SESSION = 5;
const MIN_CORRECT_RATIO = 0.7;
const SHOW_COOLDOWN_DAYS = 60; // не чаще раза в 60 дней
const ASK_AGAIN_AFTER_SUBMIT_DAYS = 120; // оценку уже поставили — спросим не раньше чем через 4 месяца
const MAX_SKIPS = 2; // дважды нажали «Пропустить» — больше не спрашиваем

type PromptState = {
  firstUseAt?: number;
  sessions?: number;
  lastShownAt?: number;
  skips?: number;
  submittedAt?: number;
};

function readState(): PromptState {
  try {
    return StorageService.getObject<PromptState>(PROMPT_KEY) || {};
  } catch {
    return {};
  }
}

function writeState(patch: Partial<PromptState>) {
  try {
    StorageService.setObject(PROMPT_KEY, { ...readState(), ...patch });
  } catch {
    // не страшно — в худшем случае спросим позже
  }
}

/**
 * Засчитать завершённую тренировку. true — сейчас хороший момент показать окно оценки.
 */
export function recordSessionForRatingPrompt(params: { totalCards: number; errors: number }): boolean {
  const now = Date.now();
  const state = readState();
  const firstUseAt = state.firstUseAt ?? now;
  const sessions = (state.sessions ?? 0) + 1;
  writeState({ firstUseAt, sessions });

  const { totalCards, errors } = params;
  if (totalCards < MIN_CARDS_IN_SESSION) return false;
  if ((totalCards - errors) / totalCards < MIN_CORRECT_RATIO) return false;
  if (now - firstUseAt < MIN_DAYS_OF_USE * DAY_MS) return false;
  if (sessions < MIN_SESSIONS) return false;
  if ((state.skips ?? 0) >= MAX_SKIPS) return false;
  if (state.lastShownAt && now - state.lastShownAt < SHOW_COOLDOWN_DAYS * DAY_MS) return false;
  if (state.submittedAt && now - state.submittedAt < ASK_AGAIN_AFTER_SUBMIT_DAYS * DAY_MS) return false;
  return true;
}

export function markRatingPromptShown() {
  writeState({ lastShownAt: Date.now() });
}

export function markRatingPromptSkipped() {
  writeState({ skips: (readState().skips ?? 0) + 1 });
}

export function markRatingSubmitted() {
  writeState({ submittedAt: Date.now() });
}
