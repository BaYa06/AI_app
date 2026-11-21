/**
 * Формы английских слов для «вставь слово» (plan/new/live_exam.md, раздел B6).
 * Неверные варианты ставим в ту же форму, что и правильный ответ в предложении, по простым
 * правилам. Слова, которым нужна удвоенная согласная (stop → stopped), и слова, у которых
 * форма не по правилам, в варианты не берём — applyForm возвращает null.
 */

const VOWELS = 'aeiou';

/** Окончание «согласная–гласная–согласная» (stop, refer) — нужна удвоенная согласная */
function needsDoubling(w) {
  if (w.length < 3) return false;
  const [a, b, c] = w.slice(-3);
  return !VOWELS.includes(a) && VOWELS.includes(b) && !VOWELS.includes(c) && !'wxy'.includes(c);
}

/** gap_kind правильного ответа → грамматическая форма */
export function formOfGapKind(kind) {
  if (kind === 'exact') return 'base';
  if (kind === 's' || kind === 'es' || kind === 'ies') return 's';
  if (kind === 'ed' || kind === 'ied' || kind === 'doubled') return 'ed';
  if (kind === 'ing') return 'ing';
  return null;
}

/** Поставить слово в форму. null — по правилам нельзя (не берём в варианты) */
export function applyForm(word, form) {
  const w = String(word || '')
    .trim()
    .toLowerCase();
  if (!w || /\s/.test(w)) return form === 'base' ? w || null : null;
  if (form === 'base') return w;
  const last = w[w.length - 1];
  const prev = w[w.length - 2];
  const consonantY = last === 'y' && prev && !VOWELS.includes(prev);
  if (form === 's') {
    if (consonantY) return w.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
    return w + 's';
  }
  if (form === 'ed') {
    if (needsDoubling(w)) return null;
    if (last === 'e') return w + 'd';
    if (consonantY) return w.slice(0, -1) + 'ied';
    return w + 'ed';
  }
  if (form === 'ing') {
    if (needsDoubling(w)) return null;
    if (w.endsWith('ie')) return w.slice(0, -2) + 'ying';
    if (last === 'e' && prev !== 'e') return w.slice(0, -1) + 'ing';
    return w + 'ing';
  }
  return null;
}
