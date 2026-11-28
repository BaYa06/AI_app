/**
 * Правка вопросов черновика экзамена учителем и проверка предложений ИИ
 * (plan/new/web_cabinet.md, Web 15–17). Чистые функции — без sql и сети.
 *
 * Редактируются только «неверные варианты» (choice, gap) и предложение «вставь слово» (gap).
 * Правильный ответ и баллы не трогаем: ответ привязан к карточке, баллы считает код (score.js).
 * ИИ только предлагает текст — решает проверка здесь, потом учитель.
 */
import { normalize, sameAnswer } from './check.js';
import { GAP_MARK } from './prepare.js';

export const MAX_OPTION_LEN = 80;
export const MAX_SENTENCE_LEN = 240;
export const MIN_SENTENCE_WORDS = 4;
/** Столько букв общего начала у ответа и варианта — похоже на однокоренное (вторая форма того же слова) */
const FAMILY_PREFIX = 5;

export const EDITABLE = { choice: ['options'], gap: ['options', 'sentence'] };

/** Можно ли править вопрос такого формата */
export function isEditable(item) {
  return Boolean(item && EDITABLE[item.format]);
}

/**
 * Неверные варианты (без правильного ответа). Число вариантов не меняем: экран ученика
 * рассчитан на то, что есть сейчас.
 * → { ok: true, options: [answer, ...distractors] } | { ok: false, error, index? }
 */
export function validateDistractors(item, distractors) {
  if (!item || !Array.isArray(item.options) || item.options.length < 2) {
    return { ok: false, error: 'not_editable' };
  }
  const expected = item.options.length - 1;
  if (!Array.isArray(distractors) || distractors.length !== expected) {
    return { ok: false, error: 'wrong_count', expected };
  }
  const seen = new Set();
  const clean = [];
  for (let i = 0; i < distractors.length; i++) {
    const text = String(distractors[i] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return { ok: false, error: 'empty', index: i };
    if (text.length > MAX_OPTION_LEN) return { ok: false, error: 'too_long', index: i };
    if (sameAnswer(text, item.answer)) return { ok: false, error: 'same_as_answer', index: i };
    const key = normalize(text);
    if (seen.has(key)) return { ok: false, error: 'duplicate', index: i };
    seen.add(key);
    clean.push(text);
  }
  return { ok: true, options: [item.answer, ...clean] };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Сколько раз ответ встречается в тексте как отдельное слово/фраза (без учёта регистра) */
export function countWord(text, word) {
  const w = String(word || '').trim();
  if (!w) return 0;
  const re = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(w)}(?![\\p{L}\\p{M}])`, 'giu');
  return (String(text).match(re) || []).length;
}

/**
 * Предложение для «вставь слово» с пропуском.
 * Ровно один пропуск; правильный ответ вне пропуска не встречается (иначе подсказка);
 * длина и число слов в разумных пределах.
 */
export function validateSentence(item, sentence) {
  const text = String(sentence ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { ok: false, error: 'empty' };
  if (text.length > MAX_SENTENCE_LEN) return { ok: false, error: 'too_long' };
  const marks = text.split(GAP_MARK).length - 1;
  if (marks !== 1) return { ok: false, error: marks === 0 ? 'no_gap' : 'many_gaps' };
  const outside = text.replace(GAP_MARK, ' ');
  if (outside.split(/\s+/).filter(Boolean).length < MIN_SENTENCE_WORDS) {
    return { ok: false, error: 'too_short' };
  }
  if (countWord(outside, item.answer) > 0) return { ok: false, error: 'answer_in_sentence' };
  return { ok: true, sentence: text };
}

/**
 * ИИ вернул целое предложение со словом — ставим пропуск на место ответа.
 * null — слова нет или оно встречается больше одного раза (непонятно, какое прятать).
 */
export function blankSentence(sentence, answer) {
  const text = String(sentence ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (countWord(text, answer) !== 1) return null;
  const re = new RegExp(
    `(?<![\\p{L}\\p{M}])${escapeRe(String(answer).trim())}(?![\\p{L}\\p{M}])`,
    'iu'
  );
  return text.replace(re, GAP_MARK);
}

/**
 * Что вызывает сомнение у кода (второй верный ответ невозможно исключить полностью — смотрит
 * учитель). Возвращает список { code, text }; пусто — кодовые проверки ничего не нашли.
 */
export function suspicion(item, { distractors = [], sentence = null, modelFlags = [] } = {}) {
  const out = [];
  const answer = normalize(item.answer);
  for (const d of distractors) {
    const key = normalize(d);
    if (
      answer.length >= FAMILY_PREFIX + 1 &&
      key.length >= FAMILY_PREFIX + 1 &&
      key.slice(0, FAMILY_PREFIX) === answer.slice(0, FAMILY_PREFIX)
    ) {
      out.push({
        code: 'family',
        text: `«${d}» похоже на ответ «${item.answer}» — может подойти тоже`,
      });
    }
  }
  if (sentence && item.format === 'gap') {
    for (const d of distractors) {
      if (countWord(sentence.replace(GAP_MARK, d), d) > 1) {
        out.push({ code: 'repeat', text: `«${d}» повторяется в предложении` });
      }
    }
  }
  for (const flag of modelFlags) {
    out.push({ code: 'model', text: flag });
  }
  return out;
}
