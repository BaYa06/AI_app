/**
 * Выдача экзамена ученику (plan/new/live_exam.md, раздел C, LiveExam 9).
 *
 * Слова у всех одни, порядок — свой: блоки (пары — один блок) перемешиваются с зерном
 * participant_id, внутри вопроса тем же зерном — варианты, буквы, правая колонка пар.
 * Детерминированно: переподключение даёт тот же порядок. Правильные ответы ученику не уходят.
 */
import { makeRng, shuffleWith } from './rng.js';

/** Порядок блоков участника: массив blockNo */
export function blockOrder(items, participantId) {
  const blocks = [...new Set(items.map((i) => i.blockNo))].sort((a, b) => a - b);
  return shuffleWith(makeRng(`${participantId}:blocks`), blocks);
}

/** Буквы «собери слово», перемешанные так, чтобы не совпасть с ответом */
export function scrambleLetters(answer, seed) {
  const letters = [...String(answer).replace(/\s/g, '')];
  if (letters.length < 2) return letters;
  const rng = makeRng(seed);
  for (let i = 0; i < 5; i++) {
    const s = shuffleWith(rng, letters);
    if (s.join('') !== letters.join('')) return s;
  }
  return [...letters.slice(1), letters[0]];
}

/**
 * Экраны ученика в его порядке. Без правильных ответов.
 * @param items — строки test_items (id, blockNo/block_no, format, prompt, answer, options, extra)
 * @param participantId — зерно
 * @param order — сохранённый порядок блоков (test_participants.block_order), иначе считаем
 * @returns { screens: [{ blockNo, format, numbers, questions }], cardOrder: [cardId] }
 */
export function studentScreens(items, participantId, order) {
  const norm = items.map((i) => ({
    ...i,
    blockNo: i.blockNo ?? i.block_no,
    cardId: i.cardId ?? i.card_id,
    sortKey: i.sortKey ?? i.sort_key ?? 0,
  }));
  const blocks = Array.isArray(order) && order.length ? order : blockOrder(norm, participantId);
  const byBlock = new Map();
  for (const it of norm) {
    if (!byBlock.has(it.blockNo)) byBlock.set(it.blockNo, []);
    byBlock.get(it.blockNo).push(it);
  }
  const screens = [];
  const cardOrder = [];
  let number = 1;
  for (const b of blocks) {
    const list = (byBlock.get(b) || []).sort((x, y) => x.sortKey - y.sortKey);
    if (list.length === 0) continue;
    const format = list[0].format;
    const seed = `${participantId}:${b}`;
    const numbers = list.map(() => number++);
    let questions;
    if (format === 'match') {
      const left = shuffleWith(makeRng(`${seed}:left`), list);
      const right = shuffleWith(
        makeRng(`${seed}:right`),
        list.map((i) => i.answer)
      );
      questions = [
        {
          itemIds: left.map((i) => i.id),
          left: left.map((i) => ({ itemId: i.id, text: i.prompt })),
          right,
          layout: list[0].extra?.layout || 'columns',
        },
      ];
      cardOrder.push(...left.map((i) => i.cardId));
    } else {
      questions = list.map((i) => {
        const q = { itemId: i.id, prompt: i.prompt, direction: i.direction || null };
        if (i.extra?.pos) q.pos = i.extra.pos;
        if (format === 'choice' || format === 'gap') {
          q.options = shuffleWith(makeRng(`${seed}:${i.id}:opt`), i.options || []);
        }
        if (format === 'scramble') {
          q.letters = scrambleLetters(i.answer, `${seed}:${i.id}:letters`);
          q.wordLengths = String(i.answer)
            .trim()
            .split(/\s+/)
            .map((w) => w.length);
          q.rows = i.extra?.rows || 1;
        }
        if (format === 'write') q.maxLength = Math.max(30, String(i.answer).length * 2);
        return q;
      });
      cardOrder.push(...list.map((i) => i.cardId));
    }
    screens.push({ blockNo: b, format, numbers, questions });
  }
  return { screens, cardOrder, blockOrder: blocks };
}
