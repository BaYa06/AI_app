/**
 * Подготовка карточек для экзамена (plan/new/live_exam.md, раздел A, LiveExam 2).
 * Примеры — из книги «Academic words» на staging.
 */
import { describe, expect, it } from '@jest/globals';
import {
  scriptOf,
  cardBackKind,
  detectBackKind,
  guessPos,
  findGap,
  wordForms,
  GAP_MARK,
} from '../_exam/prepare.js';

describe('scriptOf', () => {
  it('латиница, кириллица, пусто', () => {
    expect(scriptOf('customs')).toBe('latin');
    expect(scriptOf('таможня')).toBe('cyrillic');
    expect(scriptOf('123 !')).toBeNull();
  });
});

describe('тип оборота', () => {
  const en = { language_from: 'en', language_to: 'en' };
  const enRu = { language_from: 'en', language_to: 'ru' };

  it('разный алфавит — перевод, даже если языки указаны одинаковые', () => {
    expect(cardBackKind({ front: 'customs', back: 'таможня' }, en)).toBe('translation');
  });
  it('одинаковый алфавит и одинаковые языки — определение', () => {
    expect(
      cardBackKind({ front: 'abandon', back: 'to leave someone or something forever' }, en)
    ).toBe('definition');
  });
  it('одинаковый алфавит и разные языки — перевод (en → de)', () => {
    expect(
      cardBackKind({ front: 'house', back: 'Haus' }, { language_from: 'en', language_to: 'de' })
    ).toBe('translation');
  });
  it('набор — по большинству карточек; ручной выбор важнее', () => {
    const cards = [
      { front: 'a', back: 'б' },
      { front: 'cat', back: 'кот' },
      { front: 'dog', back: 'a pet animal' },
    ];
    expect(detectBackKind(en, cards)).toBe('translation');
    expect(
      detectBackKind({ ...en, back_kind: 'definition', back_kind_source: 'manual' }, cards)
    ).toBe('definition');
    expect(detectBackKind(enRu, [])).toBe('translation');
  });
});

describe('guessPos', () => {
  it('по началу определения', () => {
    expect(guessPos('to leave someone forever', 'definition')).toBe('verb');
    expect(guessPos('a person who is not married', 'definition')).toBe('noun');
    expect(guessPos('very interested in something', 'definition')).toBe('adj');
  });
  it('для перевода — null', () => {
    expect(guessPos('бросить', 'translation')).toBeNull();
  });
});

describe('findGap', () => {
  it('слово в той же форме', () => {
    const g = findGap('abandon', 'They had to abandon the car in the snow.');
    expect(g).toEqual({
      gapText: `They had to ${GAP_MARK} the car in the snow.`,
      gapAnswer: 'abandon',
      gapKind: 'exact',
    });
  });
  it('ignite → ignited (-d после e)', () => {
    const g = findGap('ignite', 'The spark ignited the dry grass.');
    expect(g.gapAnswer).toBe('ignited');
    expect(g.gapKind).toBe('ed');
    expect(g.gapText).toBe(`The spark ${GAP_MARK} the dry grass.`);
  });
  it('verify → verified (y → ied)', () => {
    const g = findGap('verify', 'The bank verified my address.');
    expect(g.gapAnswer).toBe('verified');
    expect(g.gapKind).toBe('ied');
  });
  it('excel → excels', () => {
    expect(findGap('excel', 'She excels at maths.').gapKind).toBe('s');
  });
  it('удвоение согласной: stop → stopped', () => {
    expect(findGap('stop', 'The bus stopped near the school.').gapAnswer).toBe('stopped');
  });
  it('неправильный глагол не угадываем: forbid → forbade', () => {
    expect(findGap('forbid', 'Her parents forbade her to go out late.')).toBeNull();
  });
  it('слово с заглавной в начале предложения', () => {
    expect(findGap('abandon', 'Abandon all hope.').gapText).toBe(`${GAP_MARK} all hope.`);
  });
  it('слово дважды — пропуск в обоих местах', () => {
    expect(findGap('keen', 'Keen eyes and a keen mind.').gapText).toBe(
      `${GAP_MARK} eyes and a ${GAP_MARK} mind.`
    );
  });
  it('слово внутри другого слова не считается (tact / contact)', () => {
    expect(findGap('tact', 'Please contact me tomorrow.')).toBeNull();
  });
  it('фраза — только подряд', () => {
    expect(findGap('seat belt', 'Fasten your seat belt, please.').gapText).toBe(
      `Fasten your ${GAP_MARK}, please.`
    );
    expect(findGap('seat belt', 'The belt of the seat is broken.')).toBeNull();
  });
  it('нет примера — null', () => {
    expect(findGap('abandon', '')).toBeNull();
  });
});

describe('wordForms', () => {
  it('для слова на согласную + y есть ies/ied', () => {
    const forms = wordForms('qualify').map(([f]) => f);
    expect(forms).toEqual(expect.arrayContaining(['qualifies', 'qualified']));
  });
});
