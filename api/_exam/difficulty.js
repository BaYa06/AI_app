/**
 * Сложность слова для класса (plan/new/live_exam.md, раздел B2, LiveExam 4).
 *
 * Главный источник — повторения учеников курса: доля учеников, у которых слово «выучено»
 * (card_progress.learning_step >= LEARNED_STEP). Слово, которое не открывал никто, —
 * «не изучено». Если данных о повторениях нет совсем (новый курс), запасные оценки по
 * порядку: доля ошибок класса в прошлых экзаменах → текст оборота (длина, число значений).
 * В ответе — по чему считали, чтобы честно показать это учителю.
 */
import { makeRng, shuffleWith } from './rng.js';

export const LEARNED_STEP = 3;
/** Доля «выучивших» выше — слово лёгкое, ниже HARD_BELOW — сложное */
export const EASY_ABOVE = 0.7;
export const HARD_BELOW = 0.3;

/** Группа по доле «выучивших» (0..1) */
export function levelByRate(rate) {
  if (rate > EASY_ABOVE) return 'easy';
  if (rate >= HARD_BELOW) return 'mid';
  return 'hard';
}

/** Делит упорядоченный (от лёгкого к сложному) список на три равные группы */
function terciles(sortedIds) {
  const out = new Map();
  const n = sortedIds.length;
  sortedIds.forEach((id, i) => {
    const part = Math.floor((i * 3) / Math.max(n, 1));
    out.set(id, part === 0 ? 'easy' : part === 1 ? 'mid' : 'hard');
  });
  return out;
}

/** «Трудность текста» оборота: длина + число значений через «;» / «,» */
function textWeight(card) {
  const back = String(card.back || '');
  const meanings = back.split(/[;,]/).filter((s) => s.trim()).length;
  return String(card.front || '').length + back.length / 10 + meanings * 2;
}

/**
 * @param cards — [{ id, front, back }]
 * @param classStats — Map/объект cardId → { learned, seen } (сколько учеников выучили / открывали)
 * @param students — сколько учеников в курсе
 * @param examStats — Map cardId → { answers, correct } из прошлых экзаменов курса (запасной путь)
 * @returns { levels: Map cardId → 'easy'|'mid'|'hard'|'unstudied', source, rates: Map }
 */
export function classifyDifficulty(cards, { classStats, students = 0, examStats, seed = 1 } = {}) {
  const get = (m, id) => (m instanceof Map ? m.get(id) : m?.[id]);
  const levels = new Map();
  const rates = new Map();

  const anySeen = students > 0 && cards.some((c) => (get(classStats, c.id)?.seen || 0) > 0);
  if (anySeen) {
    for (const c of cards) {
      const s = get(classStats, c.id) || { learned: 0, seen: 0 };
      if (!s.seen) {
        levels.set(c.id, 'unstudied');
        continue;
      }
      const rate = Math.min(1, (s.learned || 0) / students);
      rates.set(c.id, rate);
      levels.set(c.id, levelByRate(rate));
    }
    return { levels, rates, source: 'class' };
  }

  const withExams = cards.filter((c) => (get(examStats, c.id)?.answers || 0) > 0);
  if (withExams.length >= Math.max(3, Math.ceil(cards.length / 2))) {
    const errRate = (c) => {
      const s = get(examStats, c.id);
      return s && s.answers ? 1 - s.correct / s.answers : 0.5;
    };
    const sorted = [...cards].sort((a, b) => errRate(a) - errRate(b)).map((c) => c.id);
    return { levels: terciles(sorted), rates, source: 'exams' };
  }

  // Без данных: по тексту, при равенстве — случайно (но детерминированно)
  const rng = makeRng(seed);
  const shuffled = shuffleWith(rng, cards);
  const sorted = shuffled.sort((a, b) => textWeight(a) - textWeight(b)).map((c) => c.id);
  return { levels: terciles(sorted), rates, source: 'text' };
}
