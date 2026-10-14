/**
 * Решение арбитра по одному кандидату (plan/push_notifications.md, шаги 2.2–2.5) — чистая функция,
 * без базы и сети: её покрывают тесты (src/services/__tests__/pushDecide.test.ts).
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 */
import { PUSH_TYPES } from './_registry.js';

/** Переключатели в настройках (2.4) → категории реестра. «Урок дня» включает и возврат, и онбординг */
export const SETTING_GROUPS = {
  lesson: ['lesson', 'reactivation', 'onboarding'],
  streak: ['streak'],
  course: ['course'],
  rating: ['rating'],
};

/** Категории, выключенные человеком: из списка выключенных переключателей */
export function disabledCategories(groupsOff) {
  const off = new Set();
  for (const group of groupsOff || []) for (const c of SETTING_GROUPS[group] || []) off.add(c);
  return off;
}

/**
 * Контрольная группа (2.5): 10 % пользователей без маркетинговых пушей — навсегда. UUID случаен,
 * поэтому последние 7 hex-символов дают ровное распределение; то же считает клиент для GA4 (push_group)
 * и SQL — без отдельной колонки.
 */
export function isHoldout(userId) {
  const hex = String(userId || '').replace(/-/g, '').slice(-7);
  const n = parseInt(hex, 16);
  return Number.isFinite(n) && n % 100 < 10;
}

const DAY_MS = 24 * 60 * 60 * 1000;
function daysBetween(fromDay, toDay) {
  if (!fromDay || !toDay) return Infinity;
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

/**
 * Режим игнора (2.3): ignored — сколько отправленных маркетинговых пушей подряд остались без открытия
 * (после последнего открытия пуша или урока). ≥ 3 — через день, ≥ 7 — раз в неделю, ≥ 14 — только возврат.
 * → null (можно) или причина отказа.
 */
export function backoffReason(ignored, lastSentDay, today, category) {
  if (ignored >= 14) return category === 'reactivation' ? null : 'backoff_14';
  if (ignored >= 7 && daysBetween(lastSentDay, today) < 7) return 'backoff_7';
  if (ignored >= 3 && daysBetween(lastSentDay, today) < 2) return 'backoff_3';
  return null;
}

/**
 * Подходящие типы для кандидата (без фильтров), по убыванию важности.
 * c: { dow, doneToday, daysAway, streak, notifStreak, fading, waiting, rating, weekly, newWords: { count, set } }
 */
export function eligiblePushes(c) {
  const list = [];
  if (c.dow === 'sun' && c.rating) list.push({ type: 'rating_sunday', data: c.rating });
  if (c.dow === 'mon' && c.weekly) list.push({ type: 'weekly_result', data: c.weekly });
  if (!c.doneToday) {
    if (c.fading > 0) list.push({ type: 'words_fading', data: { count: c.fading } });
    if (c.waiting > 0) list.push({ type: 'review_due', data: { count: Math.min(c.waiting, 30) } });
    // Новые слова — только когда повторять нечего: урок дня начнётся с них (3.2)
    else if (c.newWords?.count > 0) list.push({ type: 'lesson_new_words', data: { count: c.newWords.count, set: c.newWords.set } });
    if (c.daysAway === 3) list.push({ type: 'reactivation_3d', data: {} });
    if (c.daysAway === 7) list.push({ type: 'reactivation_7d', data: {} });
    if (c.streak > 0 && c.notifStreak) list.push({ type: 'streak_reminder', data: {} });
  }
  return list.sort((a, b) => PUSH_TYPES[a.type].priority - PUSH_TYPES[b.type].priority);
}

/** Напоминания-привычки: их не шлём в дни, когда человек обычно не учится (2.9). Рейтинг, курс и возврат — шлём */
const HABIT_CATEGORIES = new Set(['lesson', 'streak']);

/**
 * Что делать с кандидатом в этот запуск.
 * → { status: 'send', type, data }                — отправить
 * → { status: 'holdout' | 'backoff' | 'category_off' | 'interval', type, data, reason? } — записать отказ
 * → { status: 'skip', reason }                    — ничего не писать (нечего слать)
 * c — кандидат (см. eligiblePushes) + { userId, today, groupsOff, ignored, lastSentDay, lastSentByType,
 *     habitDays } — habitDays: привычные дни + дни занятий (null — фильтр не применяется)
 */
export function decide(c) {
  const eligible = eligiblePushes(c);
  if (eligible.length === 0) return { status: 'skip', reason: c.doneToday ? 'done_today' : 'nothing_to_send' };
  const usualDay = !c.habitDays || c.habitDays.includes(c.dow);
  const all = usualDay ? eligible : eligible.filter((p) => !HABIT_CATEGORIES.has(PUSH_TYPES[p.type].category));
  if (all.length === 0) return { status: 'skip', reason: 'not_usual_day' };

  const off = disabledCategories(c.groupsOff);
  const enabled = all.filter((p) => !off.has(PUSH_TYPES[p.type].category));
  if (enabled.length === 0) return { status: 'category_off', ...all[0] };

  const fresh = enabled.filter((p) => {
    const interval = PUSH_TYPES[p.type].minIntervalDays || 0;
    return interval === 0 || daysBetween(c.lastSentByType?.[p.type], c.today) >= interval;
  });
  if (fresh.length === 0) return { status: 'interval', ...enabled[0] };

  const top = fresh[0];
  if (!PUSH_TYPES[top.type].transactional && isHoldout(c.userId)) return { status: 'holdout', ...top };

  const allowed = fresh.find((p) => !backoffReason(c.ignored || 0, c.lastSentDay, c.today, PUSH_TYPES[p.type].category));
  if (!allowed) {
    return { status: 'backoff', ...top, reason: backoffReason(c.ignored || 0, c.lastSentDay, c.today, PUSH_TYPES[top.type].category) };
  }
  return { status: 'send', ...allowed };
}
