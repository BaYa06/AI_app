/**
 * Проверка ответа (plan/new/live_exam.md, раздел D, LiveExam 7).
 *
 * Вердикты: correct | wrong | typo | wrong_form | none.
 * - нормализация: регистр, пробелы по краям и двойные, ё → е, ’ → ', точка в конце;
 * - перевод: засчитывается любой из вариантов через «,» / «;» / «/»;
 * - опечатка: одна буква (расстояние Левенштейна 1) у ответа от MIN_TYPO_LEN букв → typo;
 * - «вставь слово» письменно: базовая форма вместо нужной → wrong_form;
 * - ответ, который учитель засчитал (accepted_answers), → correct с пометкой accepted.
 * Баллы за typo и wrong_form — 0 (учитель может засчитать).
 */

export const MIN_TYPO_LEN = 5;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’`ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
}

/** Варианты ответа: «car, automobile; auto» → ['car', 'automobile', 'auto'] */
export function answerVariants(answer) {
  const whole = normalize(answer);
  const parts = String(answer ?? '')
    .split(/[,;/]/)
    .map(normalize)
    .filter(Boolean);
  return [...new Set([whole, ...parts].filter(Boolean))];
}

/** Расстояние Левенштейна с ранним выходом, если больше limit */
export function levenshtein(a, b, limit = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Совпадают ли два текста после нормализации (для неверных вариантов при сборке) */
export function sameAnswer(a, b) {
  const va = answerVariants(a);
  const vb = new Set(answerVariants(b));
  return va.some((v) => vb.has(v));
}

/**
 * Проверка одного слова.
 * @param item — { format, answer, accepted_answers?, extra?: { baseForm? } }
 * @param response — текст ответа ученика (для match — текст выбранной пары), null/'' — нет ответа
 * @returns { verdict, accepted }
 */
export function checkAnswer(item, response) {
  const given = normalize(response);
  if (!given) return { verdict: 'none', accepted: false };

  const accepted = (item.accepted_answers || item.acceptedAnswers || []).map(normalize);
  const variants = answerVariants(item.answer);

  if (variants.includes(given)) return { verdict: 'correct', accepted: false };
  if (accepted.includes(given)) return { verdict: 'correct', accepted: true };

  // Выбор, пары и «собери» — ответ из готовых частей: опечатки и формы там не бывает
  const typed = item.format === 'write' || (item.format === 'gap' && item.extra?.mode === 'write');
  if (!typed) return { verdict: 'wrong', accepted: false };

  const base = item.extra?.baseForm ? normalize(item.extra.baseForm) : null;
  if (item.format === 'gap' && base && given === base && !variants.includes(base)) {
    return { verdict: 'wrong_form', accepted: false };
  }
  if (given.length >= MIN_TYPO_LEN && variants.some((v) => levenshtein(given, v, 1) === 1)) {
    return { verdict: 'typo', accepted: false };
  }
  return { verdict: 'wrong', accepted: false };
}

/** Баллы за вердикт: только correct; аннулированный вопрос — 0 и не входит в максимум */
export function pointsFor(item, verdict) {
  if (item.voided) return 0;
  return verdict === 'correct' ? Number(item.points) || 0 : 0;
}
