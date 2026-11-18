/**
 * Движок экзамена (plan/new/live_exam.md, разделы B–E, LiveExam 4–7).
 */
import { describe, expect, it } from '@jest/globals';
import { classifyDifficulty, levelByRate } from '../_exam/difficulty.js';
import {
  buildExam,
  defaultFormats,
  pairBlocks,
  recommendedTime,
  canScramble,
  canWrite,
  replaceItem,
  normalizeFormats,
} from '../_exam/build.js';
import { applyForm, formOfGapKind } from '../_exam/forms.js';
import { checkAnswer, normalize, answerVariants, levenshtein } from '../_exam/check.js';
import { scoreParticipant } from '../_exam/score.js';
import { studentScreens, scrambleLetters } from '../_exam/deliver.js';
import { itemStats, isSuspicious, whyHints, simulate } from '../_exam/analysis.js';
import { normalize as norm } from '../_exam/check.js';

const RU = [
  ['airport', 'аэропорт'],
  ['passport', 'паспорт'],
  ['luggage', 'багаж'],
  ['customs', 'таможня'],
  ['border', 'граница'],
  ['ticket', 'билет'],
  ['flight', 'рейс'],
  ['delay', 'задержка'],
  ['gate', 'выход на посадку'],
  ['departure', 'отправление'],
  ['arrival', 'прибытие'],
  ['pilot', 'пилот'],
  ['window', 'окно'],
  ['aisle', 'проход'],
  ['suitcase', 'чемодан'],
  ['boarding pass', 'посадочный талон'],
  ['seat belt', 'ремень безопасности'],
  ['crew', 'экипаж'],
  ['runway', 'взлётная полоса'],
  ['terminal', 'терминал'],
  ['visa', 'виза'],
  ['tourist', 'турист'],
  ['journey', 'путешествие'],
  ['trolley', 'тележка'],
];
const cardsRu = RU.map(([front, back], i) => ({
  id: `c${i}`,
  setId: 's1',
  front,
  back,
  example: null,
}));

const ACAD = [
  ['abandon', 'to leave someone or something forever', 'They had to abandon the car in the snow.'],
  ['verify', 'to check that something is true', 'The bank verified my address.'],
  ['ignite', 'to start burning', 'The spark ignited the dry grass.'],
  ['qualify', 'to reach the level needed', 'She qualified for the final.'],
  ['reveal', 'to show something hidden', 'He refused to reveal his secret.'],
  ['excel', 'to be very good at something', 'She excels at maths.'],
  ['bachelor', 'a man who is not married', 'He is still a bachelor at forty.'],
  ['oath', 'a formal promise', 'He took an oath in court.'],
  ['tact', 'the ability to say things without upsetting people', 'She handled it with tact.'],
  ['hardship', 'a difficult situation in life', 'They lived through years of hardship.'],
  ['keen', 'very interested in something', 'Tom is keen on football.'],
  ['vacant', 'empty and not being used', 'The flat upstairs is vacant.'],
  ['gallant', 'brave and polite', 'It was a gallant effort.'],
  ['unaccustomed', 'not used to something', 'I am unaccustomed to the cold.'],
  ['jealous', 'unhappy because someone has something you want', 'He was jealous of his brother.'],
  ['data', 'facts or information', 'We collected the data last year.'],
  ['forbid', 'to order someone not to do something', 'Her parents forbade her to go out.'],
];
const cardsAc = ACAD.map(([front, back, example], i) => ({
  id: `a${i}`,
  setId: 'u1',
  front,
  back,
  example,
}));

function levelsFor(cards, pattern) {
  return new Map(cards.map((c, i) => [c.id, pattern[i % pattern.length]]));
}

describe('сложность для класса (B2)', () => {
  it('пороги 70% / 30%', () => {
    expect(levelByRate(0.8)).toBe('easy');
    expect(levelByRate(0.7)).toBe('mid');
    expect(levelByRate(0.3)).toBe('mid');
    expect(levelByRate(0.29)).toBe('hard');
  });
  it('по повторениям класса; не открывал никто — «не изучено»', () => {
    const cards = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    const r = classifyDifficulty(cards, {
      students: 10,
      classStats: { x: { learned: 9, seen: 10 }, y: { learned: 1, seen: 5 } },
    });
    expect(r.source).toBe('class');
    expect(r.levels.get('x')).toBe('easy');
    expect(r.levels.get('y')).toBe('hard');
    expect(r.levels.get('z')).toBe('unstudied');
  });
  it('без повторений — по прошлым экзаменам, иначе по тексту, поровну на три группы', () => {
    const r = classifyDifficulty(cardsRu.slice(0, 9), { students: 5, classStats: {} });
    expect(r.source).toBe('text');
    const counts = [...r.levels.values()].reduce((m, l) => ({ ...m, [l]: (m[l] || 0) + 1 }), {});
    expect(counts).toEqual({ easy: 3, mid: 3, hard: 3 });
    const ex = classifyDifficulty(cardsRu.slice(0, 3), {
      examStats: {
        c0: { answers: 4, correct: 4 },
        c1: { answers: 4, correct: 0 },
        c2: { answers: 4, correct: 2 },
      },
    });
    expect(ex.source).toBe('exams');
    expect(ex.levels.get('c0')).toBe('easy');
    expect(ex.levels.get('c1')).toBe('hard');
  });
});

describe('доли форматов, блоки пар, время', () => {
  it('20 слов по умолчанию — 8 выбор / 5 письмо / 3 собери / 4 пары', () => {
    expect(defaultFormats(20)).toEqual({ choice: 8, write: 5, scramble: 3, match: 4, gap: 0 });
  });
  it('определения с примерами — с «вставь слово», без письма', () => {
    const f = defaultFormats(12, { backKind: 'definition', gapShare: 1 });
    expect(f.write).toBe(0);
    expect(f.gap).toBeGreaterThan(0);
    expect(Object.values(f).reduce((a, b) => a + b, 0)).toBe(12);
  });
  it('блоки пар 3–5', () => {
    expect(pairBlocks(2)).toEqual([]);
    expect(pairBlocks(4)).toEqual([4]);
    expect(pairBlocks(8)).toEqual([4, 4]);
    expect(pairBlocks(7)).toEqual([4, 3]);
    expect(pairBlocks(5)).toEqual([5]);
  });
  it('рекомендованное время: 8+5+3+4 → 345 с × 1,2 → 7 минут', () => {
    const t = recommendedTime({ choice: 8, write: 5, scramble: 3, match: 4, gap: 0 });
    expect(t.baseSec).toBe(345);
    expect(t.sec).toBe(414);
    expect(t.minutes).toBe(7);
  });
  it('числа форматов от учителя приводятся к числу слов', () => {
    expect(normalizeFormats({ choice: 10, write: 10 }, 12)).toMatchObject({ choice: 2, write: 10 });
    expect(normalizeFormats({ write: 2 }, 5)).toMatchObject({ choice: 3, write: 2 });
  });
});

describe('какие слова в какие форматы', () => {
  it('фраза и длинное слово', () => {
    expect(canScramble({ front: 'unaccustomed' })).toBe(true);
    expect(canScramble({ front: 'undernourishedness' })).toBe(false);
    expect(canScramble({ front: 'seat belt' })).toBe(true);
    expect(canScramble({ front: "o'clock" })).toBe(false);
    expect(canWrite({ front: 'a very long phrase with many words in it' })).toBe(false);
  });
});

describe('сборка (B)', () => {
  const levels = levelsFor(cardsRu, ['easy', 'mid', 'hard']);
  const exam = buildExam({
    cards: cardsRu,
    backKind: 'translation',
    levels,
    difficultySource: 'class',
    classSummary: { students: 8, reviews: 1136 },
    config: { count: 20, mode: 'difficulty' },
    seed: 'test',
  });

  it('20 слов, 7 / 7 / 6 по сложности, без повторов', () => {
    expect(exam.items).toHaveLength(20);
    expect(exam.levels).toMatchObject({ easy: 7, mid: 7, hard: 6 });
    expect(new Set(exam.items.map((i) => i.cardId)).size).toBe(20);
  });
  it('форматы 8 / 5 / 3 / 4, время 7 минут, 5 баллов за слово', () => {
    expect(exam.counts).toEqual({ choice: 8, write: 5, scramble: 3, match: 4, gap: 0 });
    expect(exam.recommended.minutes).toBe(7);
    expect(exam.pointsPerWord).toBe(5);
  });
  it('пары — один блок, 17 экранов', () => {
    const match = exam.items.filter((i) => i.format === 'match');
    expect(new Set(match.map((i) => i.blockNo)).size).toBe(1);
    expect(exam.screens).toBe(17);
  });
  it('у выбора 4 разных варианта, правильный среди них, неверные не совпадают с ним', () => {
    for (const it of exam.items.filter((i) => i.format === 'choice')) {
      expect(it.options).toHaveLength(4);
      expect(new Set(it.options.map(norm)).size).toBe(4);
      expect(it.options.map(norm)).toContain(norm(it.answer));
    }
  });
  it('пять шагов сборки с настоящими цифрами', () => {
    expect(exam.steps.map((s) => s.key)).toEqual([
      'class',
      'levels',
      'formats',
      'options',
      'check',
    ]);
    expect(exam.steps[0].detail).toContain('8 учеников');
    expect(exam.steps[0].detail).toContain('1136');
    expect(exam.steps[1].detail).toContain('7 лёгких · 7 средних · 6 сложных');
  });
  it('одно зерно — один состав', () => {
    const again = buildExam({
      cards: cardsRu,
      backKind: 'translation',
      levels,
      config: { count: 20, mode: 'difficulty' },
      seed: 'test',
    });
    expect(again.items.map((i) => [i.cardId, i.format])).toEqual(
      exam.items.map((i) => [i.cardId, i.format])
    );
  });
  it('«не изучено» по умолчанию не берём', () => {
    const lv = new Map(cardsRu.map((c, i) => [c.id, i < 4 ? 'unstudied' : 'mid']));
    const e = buildExam({ cards: cardsRu, levels: lv, config: { count: 20 }, seed: 1 });
    expect(e.items.some((i) => lv.get(i.cardId) === 'unstudied')).toBe(false);
    expect(e.excludedUnstudied).toBe(4);
    expect(e.steps[1].detail).toContain('4 слова класс не открывал');
  });
  it('мало слов — предупреждение', () => {
    const e = buildExam({ cards: cardsRu.slice(0, 6), config: { count: 20 }, seed: 1 });
    expect(e.items.length).toBeLessThanOrEqual(6);
    expect(e.warnings.map((w) => w.code)).toContain('pool_small');
  });
  it('замена слова — та же сложность и тот же формат', () => {
    const target = exam.items.find((i) => i.format === 'choice');
    const r = replaceItem(
      { cards: cardsRu, backKind: 'translation', levels, seed: 'test' },
      exam.items,
      target.cardId
    );
    expect(r).not.toBeNull();
    expect(r.item.format).toBe('choice');
    expect(r.item.difficulty).toBe(target.difficulty);
    expect(exam.items.map((i) => i.cardId)).not.toContain(r.item.cardId);
  });
});

describe('книга с определениями (Academic words)', () => {
  const exam = buildExam({
    cards: cardsAc,
    backKind: 'definition',
    levels: levelsFor(cardsAc, ['easy', 'mid', 'hard']),
    config: { count: 12 },
    seed: 'ac',
  });
  it('вопрос — определение, ответ — слово; пары в раскладке «слова сверху»', () => {
    for (const it of exam.items.filter((i) => i.format === 'choice')) {
      expect(cardsAc.find((c) => c.id === it.cardId).back).toBe(it.prompt);
    }
    for (const it of exam.items.filter((i) => i.format === 'match')) {
      expect(it.extra.layout).toBe('stacked');
    }
  });
  it('«вставь слово»: пропуск из примера, варианты в той же форме', () => {
    const gaps = exam.items.filter((i) => i.format === 'gap');
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(g.prompt).toContain('_____');
      expect(g.options).toHaveLength(4);
      const form = formOfGapKind(g.extra.gapKind);
      if (form === 'ed') for (const o of g.options) expect(o).toMatch(/ed$/);
    }
    expect(gaps.map((g) => g.cardId)).not.toContain('a16'); // forbid → forbade не нашли
  });
});

describe('формы слов', () => {
  it('по правилам; удвоение — не берём', () => {
    expect(applyForm('verify', 'ed')).toBe('verified');
    expect(applyForm('ignite', 'ed')).toBe('ignited');
    expect(applyForm('reveal', 'ed')).toBe('revealed');
    expect(applyForm('stop', 'ed')).toBeNull();
    expect(applyForm('excel', 's')).toBe('excels');
    expect(applyForm('watch', 's')).toBe('watches');
    expect(applyForm('make', 'ing')).toBe('making');
  });
});

describe('проверка ответа (D)', () => {
  it('нормализация', () => {
    expect(normalize('  Ёлка   Зелёная. ')).toBe('елка зеленая');
    expect(answerVariants('car, automobile; auto')).toEqual(
      expect.arrayContaining(['car', 'automobile', 'auto'])
    );
    expect(levenshtein('customs', 'custom')).toBe(1);
  });
  const write = { format: 'write', answer: 'customs' };
  it('верно, нет ответа, неверно', () => {
    expect(checkAnswer(write, ' Customs ').verdict).toBe('correct');
    expect(checkAnswer(write, '').verdict).toBe('none');
    expect(checkAnswer(write, 'border').verdict).toBe('wrong');
  });
  it('опечатка — только у письма и от 5 букв', () => {
    expect(checkAnswer(write, 'custams').verdict).toBe('typo');
    expect(checkAnswer({ format: 'write', answer: 'gate' }, 'gote').verdict).toBe('wrong');
    expect(checkAnswer({ format: 'choice', answer: 'customs' }, 'custams').verdict).toBe('wrong');
  });
  it('перевод: любой вариант через запятую', () => {
    expect(checkAnswer({ format: 'choice', answer: 'обычай, привычка' }, 'привычка').verdict).toBe(
      'correct'
    );
  });
  it('засчитанный учителем ответ', () => {
    const r = checkAnswer({ ...write, accepted_answers: ['custom'] }, 'custom');
    expect(r).toEqual({ verdict: 'correct', accepted: true });
  });
  it('«вставь слово» письменно: базовая форма → неверная форма', () => {
    const gap = {
      format: 'gap',
      answer: 'qualified',
      extra: { mode: 'write', baseForm: 'qualify' },
    };
    expect(checkAnswer(gap, 'qualify').verdict).toBe('wrong_form');
    expect(checkAnswer(gap, 'qualified').verdict).toBe('correct');
  });
});

describe('баллы', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    id: `i${i}`,
    format: 'choice',
    answer: `w${i}`,
    points: 5,
  }));
  it('по 5 баллов; аннулированный вопрос не считается', () => {
    const answers = new Map(items.slice(0, 13).map((it) => [it.id, it.answer]));
    expect(scoreParticipant(items, answers).score).toBe(65);
    const voided = items.map((it, i) => (i === 19 ? { ...it, voided: true } : it));
    expect(scoreParticipant(voided, answers).score).toBe(68); // 13 / 19
  });
  it('ручной балл учителя важнее', () => {
    expect(scoreParticipant(items, new Map(), 40).score).toBe(40);
  });
});

describe('выдача ученику (C)', () => {
  const exam = buildExam({
    cards: cardsRu,
    levels: levelsFor(cardsRu, ['easy', 'mid', 'hard']),
    config: { count: 20 },
    seed: 'd',
  });
  const items = exam.items.map((it, i) => ({ ...it, id: `item${i}` }));
  it('у каждого свой порядок, у одного и того же — тот же', () => {
    const a1 = studentScreens(items, 'p1');
    const a2 = studentScreens(items, 'p1');
    const b = studentScreens(items, 'p2');
    expect(a1.blockOrder).toEqual(a2.blockOrder);
    expect(a1.blockOrder).not.toEqual(b.blockOrder);
    expect(new Set(b.cardOrder)).toEqual(new Set(a1.cardOrder));
  });
  it('номера 1…N подряд, пары занимают номера подряд', () => {
    const s = studentScreens(items, 'p1');
    const numbers = s.screens.flatMap((x) => x.numbers);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const m = s.screens.find((x) => x.format === 'match');
    expect(m.numbers).toHaveLength(4);
  });
  it('правильные ответы ученику не уходят (кроме вариантов)', () => {
    const s = studentScreens(items, 'p1');
    const json = JSON.stringify(s.screens);
    expect(json).not.toContain('"answer"');
    const write = items.find((i) => i.format === 'write');
    expect(json).not.toContain(`"${write.answer}"`);
  });
  it('буквы «собери» не совпадают с ответом', () => {
    expect(scrambleLetters('ab', 's').join('')).toBe('ba');
    expect(scrambleLetters('unaccustomed', 'x').sort().join('')).toBe(
      [...'unaccustomed'].sort().join('')
    );
  });
});

describe('разбор вопроса (E) — цифры из макета', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    id: `i${i}`,
    format: 'choice',
    answer: i === 0 ? 'таможня' : `w${i}`,
    options: i === 0 ? ['таможня', 'граница', 'паспорт', 'багаж'] : null,
    points: 5,
  }));
  // 8 учеников, верно на остальных 19: 19, 18, 16, 15, 14, 13, 11, 7
  const plan = [
    ['Айбек', 19, 'таможня'],
    ['Алина', 18, 'граница'],
    ['Аружан', 16, 'граница'],
    ['Мадина', 15, 'граница'],
    ['Тимур', 14, 'граница'],
    ['Сабина', 13, 'граница'],
    ['Ерлан', 11, 'паспорт'],
    ['Данияр', 7, 'багаж'],
  ];
  const participants = plan.map(([name, okTotal, first], k) => {
    const answers = new Map([['i0', first]]);
    const restOk = first === 'таможня' ? okTotal - 1 : okTotal;
    for (let i = 1; i <= restOk; i++) answers.set(`i${i}`, `w${i}`);
    return { id: `p${k}`, name, answers };
  });

  it('ошиблись 7 из 8 — предупреждение', () => {
    const st = itemStats(items[0], participants);
    expect(st).toMatchObject({ answered: 8, correct: 1, wrong: 7 });
    expect(isSuspicious(st)).toBe(true);
    expect(st.groups[0]).toMatchObject({ text: 'граница', count: 5 });
  });
  it('подсказки: «дело в вопросе» и «вариант слишком близок»', () => {
    const st = itemStats(items[0], participants);
    const codes = whyHints(items[0], st, { rate: 0.74, studiedShare: 1 }).map((h) => h.code);
    expect(codes).toEqual(['question_issue', 'close_option']);
    const notStudied = whyHints(items[0], st, { rate: 0.2, studiedShare: 0.3 }).map((h) => h.code);
    expect(notStudied[0]).toBe('not_studied');
  });
  it('аннулировать: 90 → 95 … 35 → 37, у Айбека без изменений, средний 71 → 74', () => {
    const r = simulate(items, participants, { type: 'void', itemId: 'i0' });
    expect(r.rows.map((x) => [x.name, x.from, x.to])).toEqual([
      ['Алина', 90, 95],
      ['Аружан', 80, 84],
      ['Мадина', 75, 79],
      ['Тимур', 70, 74],
      ['Сабина', 65, 68],
      ['Ерлан', 55, 58],
      ['Данияр', 35, 37],
    ]);
    expect(r.unchanged).toEqual(['Айбек']);
    expect([r.avgFrom, r.avgTo]).toEqual([71, 74]);
  });
  it('засчитать «граница»: +5 пятерым', () => {
    const r = simulate(items, participants, { type: 'accept', itemId: 'i0', answer: 'граница' });
    expect(r.rows).toHaveLength(5);
    expect(r.rows[0]).toMatchObject({ name: 'Алина', from: 90, to: 95 });
  });
});
