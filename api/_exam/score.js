/**
 * Баллы экзамена (plan/new/live_exam.md, B10 и E). Шкала 100.
 *
 * Балл = набранные баллы / максимум неаннулированных вопросов × 100, округление до целого.
 * Аннулированный вопрос не входит ни в набранное, ни в максимум. Ручной балл учителя
 * (score_override) важнее посчитанного.
 */
import { checkAnswer } from './check.js';

export const VERDICTS = ['correct', 'wrong', 'typo', 'wrong_form', 'none'];

/**
 * @param items — [{ id, points, voided, answer, format, accepted_answers, extra }]
 * @param answers — Map itemId → текст ответа ученика (нет ключа — нет ответа)
 * @param override — ручной балл учителя или null
 * @returns { score, computed, max, earned, counts: { correct, wrong, typo, wrong_form, none },
 *            perItem: Map itemId → { verdict, accepted, points } }
 */
export function scoreParticipant(items, answers, override = null) {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const perItem = new Map();
  let max = 0;
  let earned = 0;
  for (const it of items) {
    const given = answers instanceof Map ? answers.get(it.id) : answers?.[it.id];
    const { verdict, accepted } = checkAnswer(it, given);
    const pts = Number(it.points) || 0;
    const got = !it.voided && verdict === 'correct' ? pts : 0;
    perItem.set(it.id, { verdict, accepted, points: got });
    if (it.voided) continue;
    max += pts;
    earned += got;
    counts[verdict]++;
  }
  const computed = max > 0 ? Math.round((earned / max) * 100) : 0;
  const hasOverride = override !== null && override !== undefined && override !== '';
  return {
    score: hasOverride ? Number(override) : computed,
    computed,
    max,
    earned,
    counts,
    perItem,
  };
}

/** Средний балл класса (целое) */
export function averageScore(scores) {
  const list = scores.filter((s) => typeof s === 'number' && Number.isFinite(s));
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
}
