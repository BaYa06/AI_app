/**
 * Подготовка карточек для экзамена (plan/new/live_exam.md, раздел A, LiveExam 2).
 *
 * Чистые функции — без sql и сети. Считаются при сборке экзамена из текущих front/back/example
 * карточки: так не нужно пересчитывать поля при каждом из шести путей записи карточек
 * (наборы, библиотека, книги, ссылки, стартовый набор, импорт), и они никогда не устаревают.
 * Ручной выбор учителя (card_sets.back_kind_source = 'manual') важнее автоматического.
 */

const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LETTER = /\p{L}/u;

/** Алфавит текста по большинству букв: 'latin' | 'cyrillic' | 'other' | null (букв нет) */
export function scriptOf(text) {
  let latin = 0;
  let cyrillic = 0;
  let other = 0;
  for (const ch of String(text || '')) {
    if (!LETTER.test(ch)) continue;
    if (LATIN.test(ch)) latin++;
    else if (CYRILLIC.test(ch)) cyrillic++;
    else other++;
  }
  const max = Math.max(latin, cyrillic, other);
  if (max === 0) return null;
  if (max === latin) return 'latin';
  if (max === cyrillic) return 'cyrillic';
  return 'other';
}

/** Языки набора одинаковые? (пустые считаем неизвестными → null) */
function sameLanguages(set) {
  const from = String(set?.language_from || '')
    .trim()
    .toLowerCase();
  const to = String(set?.language_to || '')
    .trim()
    .toLowerCase();
  if (!from || !to) return null;
  return from === to;
}

/**
 * Тип оборота одной карточки по правилу A1:
 * - алфавит лицевой и оборотной стороны разный → перевод (что бы ни было в языках набора);
 * - алфавит одинаковый: языки набора разные → перевод, одинаковые → определение.
 */
export function cardBackKind(card, set) {
  const a = scriptOf(card.front);
  const b = scriptOf(card.back);
  if (a && b && a !== b) return 'translation';
  const same = sameLanguages(set);
  if (same === true) return 'definition';
  return 'translation';
}

/**
 * Тип оборота набора: ручной выбор учителя, иначе — по большинству карточек.
 * Возвращает 'translation' | 'definition'.
 */
export function detectBackKind(set, cards) {
  if (set?.back_kind_source === 'manual' && set?.back_kind) return set.back_kind;
  let def = 0;
  let tr = 0;
  for (const c of cards || []) {
    if (cardBackKind(c, set) === 'definition') def++;
    else tr++;
  }
  if (def === 0 && tr === 0) return sameLanguages(set) ? 'definition' : 'translation';
  return def > tr ? 'definition' : 'translation';
}

/**
 * Часть речи по началу английского определения (A2): «to …» — глагол, «a/an/the …» —
 * существительное, остальное — прилагательное. Для переводов — null.
 */
export function guessPos(back, backKind) {
  if (backKind !== 'definition') return null;
  const t = String(back || '')
    .trim()
    .toLowerCase();
  if (!t || scriptOf(t) !== 'latin') return null;
  if (/^to\s/.test(t)) return 'verb';
  if (/^(a|an|the)\s/.test(t)) return 'noun';
  return 'adj';
}

export const GAP_MARK = '_____';

/** Все слова текста с позициями (буквы, апостроф и дефис внутри слова) */
function tokens(text) {
  const out = [];
  const re = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
  let m;
  while ((m = re.exec(text))) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

const VOWELS = 'aeiou';

/**
 * Формы слова, которые ищем в примере (A3), в порядке проверки: [форма, gap_kind].
 * Только правильные окончания; неправильные глаголы (forbid → forbade) не угадываем.
 */
export function wordForms(base) {
  const w = base.toLowerCase();
  const forms = [[w, 'exact']];
  const last = w[w.length - 1];
  const prev = w[w.length - 2];
  if (last === 'y' && prev && !VOWELS.includes(prev)) {
    forms.push([w.slice(0, -1) + 'ies', 'ies'], [w.slice(0, -1) + 'ied', 'ied']);
  }
  if (/(s|x|z|ch|sh)$/.test(w)) forms.push([w + 'es', 'es']);
  forms.push([w + 's', 's']);
  if (last === 'e') {
    forms.push([w + 'd', 'ed'], [w.slice(0, -1) + 'ing', 'ing']);
  } else {
    forms.push([w + 'ed', 'ed'], [w + 'ing', 'ing']);
  }
  // Удвоение согласной: stop → stopped, refer → referred
  if (last && !VOWELS.includes(last) && !'wxy'.includes(last) && prev && VOWELS.includes(prev)) {
    forms.push([w + last + 'ed', 'doubled'], [w + last + 'ing', 'doubled']);
  }
  return forms;
}

/**
 * Пропуск в примере (A3). Возвращает { gapText, gapAnswer, gapKind } или null, если слово
 * в примере не найдено (тогда слово не попадает в «вставь слово»).
 * - фраза из нескольких слов — только точное совпадение подряд;
 * - слово встречается дважды — пропуск в обоих местах;
 * - gapAnswer — форма из самого предложения (в нижнем регистре).
 */
export function findGap(front, example) {
  const word = String(front || '').trim();
  const text = String(example || '').trim();
  if (!word || !text) return null;

  if (/\s/.test(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'giu');
    if (!re.test(text)) return null;
    re.lastIndex = 0;
    return {
      gapText: text.replace(re, GAP_MARK),
      gapAnswer: word.toLowerCase(),
      gapKind: 'exact',
    };
  }

  const toks = tokens(text);
  for (const [form, kind] of wordForms(word)) {
    const hits = toks.filter((t) => t.word.toLowerCase() === form);
    if (hits.length === 0) continue;
    let out = '';
    let pos = 0;
    for (const h of hits) {
      out += text.slice(pos, h.start) + GAP_MARK;
      pos = h.end;
    }
    out += text.slice(pos);
    return { gapText: out, gapAnswer: form, gapKind: kind };
  }
  return null;
}

/** Все поля подготовки одной карточки */
export function prepareCard(card, backKind) {
  const gap = findGap(card.front, card.example);
  return {
    posGuess: guessPos(card.back, backKind),
    gapText: gap?.gapText ?? null,
    gapAnswer: gap?.gapAnswer ?? null,
    gapKind: gap?.gapKind ?? null,
  };
}
