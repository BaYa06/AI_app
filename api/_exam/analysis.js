/**
 * Подозрительный вопрос и его разбор (plan/new/live_exam.md, раздел E, LiveExam 19).
 * Всё считает код по правилам — без ИИ.
 */
import { normalize } from './check.js';
import { scoreParticipant, averageScore } from './score.js';

/** Предупреждаем, если ответили ≥ SUSPECT_MIN_ANSWERED и ошиблись ≥ SUSPECT_WRONG_SHARE */
export const SUSPECT_MIN_ANSWERED = 4;
export const SUSPECT_WRONG_SHARE = 0.7;
/** «Дело в вопросе»: на повторениях верно ≥ 60%, а на экзамене хуже на ≥ 40 п.п. */
export const REVIEW_GOOD_RATE = 0.6;
export const REVIEW_GAP = 0.4;
/** «Вариант слишком близок»: один неверный вариант собрал ≥ 50% ошибок */
export const ONE_OPTION_SHARE = 0.5;
/** «Возможно, тоже верный»: один и тот же письменный ответ у ≥ 3 учеников */
export const SAME_WRITTEN_MIN = 3;
/** «Класс почти не учил»: повторяло меньше половины класса */
export const STUDIED_MIN_SHARE = 0.5;

/**
 * Ответы на вопрос по группам.
 * @param item — вопрос
 * @param participants — [{ id, name, answers: Map itemId → текст }]
 * @returns { answered, correct, wrong, groups: [{ text, count, names, correct }] }
 */
export function itemStats(item, participants) {
  const groups = new Map();
  let answered = 0;
  let correct = 0;
  for (const p of participants) {
    const given = p.answers instanceof Map ? p.answers.get(item.id) : p.answers?.[item.id];
    const res = scoreParticipant([{ ...item, voided: false }], new Map([[item.id, given]]));
    const v = res.perItem.get(item.id).verdict;
    if (v === 'none') continue;
    answered++;
    if (v === 'correct') correct++;
    const key = normalize(given);
    if (!groups.has(key))
      groups.set(key, { text: String(given).trim(), count: 0, names: [], verdict: v });
    const g = groups.get(key);
    g.count++;
    g.names.push(p.name);
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count);
  // Для выбора и «вставь слово» показываем все варианты, даже невыбранные
  if (item.options) {
    for (const opt of item.options) {
      if (!groups.has(normalize(opt))) {
        list.push({
          text: opt,
          count: 0,
          names: [],
          verdict: normalize(opt) === normalize(item.answer) ? 'correct' : 'wrong',
        });
      }
    }
  }
  return { answered, correct, wrong: answered - correct, groups: list };
}

/** Нужно ли предупреждение в итогах */
export function isSuspicious(stats) {
  return (
    stats.answered >= SUSPECT_MIN_ANSWERED && stats.wrong / stats.answered >= SUSPECT_WRONG_SHARE
  );
}

/**
 * Подсказки «почему могли ошибиться».
 * @param review — { rate: доля верных на повторениях 0..1 | null, studiedShare: 0..1 | null }
 * @returns [{ code, text, suggest? }]
 */
export function whyHints(item, stats, review = {}) {
  const hints = [];
  const examRate = stats.answered ? stats.correct / stats.answered : 0;
  const pct = (x) => Math.round(x * 100);

  if (
    review.studiedShare !== null &&
    review.studiedShare !== undefined &&
    review.studiedShare < STUDIED_MIN_SHARE
  ) {
    hints.push({
      code: 'not_studied',
      text: `Слово повторяли только ${pct(review.studiedShare)}% класса — похоже, его почти не учили. Это честная ошибка, аннулировать не советуем.`,
      suggest: 'keep',
    });
  } else if (
    typeof review.rate === 'number' &&
    review.rate >= REVIEW_GOOD_RATE &&
    review.rate - examRate >= REVIEW_GAP
  ) {
    hints.push({
      code: 'question_issue',
      text: `На повторениях класс отвечал верно в ${pct(review.rate)}% случаев, а на экзамене — ${stats.correct} из ${stats.answered}. Похоже, дело в вопросе, а не в знаниях.`,
      suggest: 'void',
    });
  }

  const wrongGroups = stats.groups.filter((g) => g.verdict !== 'correct' && g.count > 0);
  const top = wrongGroups[0];
  const typed = item.format === 'write' || (item.format === 'gap' && item.extra?.mode === 'write');
  if (top && stats.wrong > 0) {
    if (typed && top.count >= SAME_WRITTEN_MIN) {
      hints.push({
        code: 'same_written',
        text: `${top.count} написали «${top.text}». Возможно, это тоже верный ответ.`,
        suggest: 'accept',
        answer: top.text,
      });
    } else if (!typed && top.count / stats.wrong >= ONE_OPTION_SHARE && stats.wrong >= 2) {
      hints.push({
        code: 'close_option',
        text: `${top.count} из ${stats.wrong} ошибок — вариант «${top.text}». Возможно, он слишком близок к верному.`,
        suggest: 'accept',
        answer: top.text,
      });
    }
  }
  return hints;
}

/**
 * «Как изменятся баллы» до применения решения (сервер считает вхолостую).
 * @param items — все вопросы экзамена
 * @param participants — [{ id, name, answers, override }]
 * @param action — { type: 'void' | 'accept' | 'keep', itemId, answer? }
 * @returns { rows: [{ participantId, name, from, to }], avgFrom, avgTo, unchanged: [name] }
 */
export function simulate(items, participants, action) {
  const after = items.map((it) => {
    if (it.id !== action.itemId) return it;
    if (action.type === 'void') return { ...it, voided: true };
    if (action.type === 'accept') {
      const list = it.accepted_answers || it.acceptedAnswers || [];
      return { ...it, accepted_answers: [...list, action.answer] };
    }
    return it;
  });
  const rows = [];
  const unchanged = [];
  const fromScores = [];
  const toScores = [];
  for (const p of participants) {
    const from = scoreParticipant(items, p.answers, p.override).score;
    const to = scoreParticipant(after, p.answers, p.override).score;
    fromScores.push(from);
    toScores.push(to);
    if (from !== to) rows.push({ participantId: p.id, name: p.name, from, to });
    else unchanged.push(p.name);
  }
  return { rows, unchanged, avgFrom: averageScore(fromScores), avgTo: averageScore(toScores) };
}
