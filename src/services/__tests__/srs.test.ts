/**
 * SRS: правила интервальных повторений и совпадение клиента с сервером
 * (plan/new/code_cleanup.md, Clean 11).
 *
 * Уровень карточки считает сервер (api/progress.js), клиент (SRSService) повторяет ту же логику
 * для мгновенного отклика. Если правила поменяют только в одном месте, интерфейс покажет одно,
 * а после синхронизации станет другое — тест «клиент = сервер» это ловит.
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../api/_db-init.js', () => ({ ensureDatabaseInitialized: async () => {} }));
jest.mock('../../../api/_auth.js', () => ({
  getAuthedUserId: async () => null,
  hasBearerSecret: () => false,
}));

import {
  applyAnswer,
  buildStudyQueue,
  formatInterval,
  getStatusForStep,
  isCardDue,
  isCardFading,
  isCardLearned,
  isCardWaitingReview,
  type AnswerMode,
} from '../SRSService';
import type { Card, Rating } from '@/types';
const server = require('../../../api/progress.js') as {
  applyAnswer: (
    state: { step: number; nextReview: number; reviewScheduled: boolean },
    answer: { correct: boolean; selfRating?: Rating; mode: AnswerMode },
    answeredAt: number
  ) => { step: number; nextReview: number };
  isFading: (step: number, nextReview: number, now: number) => boolean;
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const INTERVALS = [0, 1, 3, 7, 14, 30, 60];

const card = (learningStep: number, nextReviewDate: number) => ({ learningStep, nextReviewDate });

describe('правила applyAnswer', () => {
  it('новая карточка, верно → шаг 1, повтор через 1 день', () => {
    const r = applyAnswer(card(0, NOW), { mode: 'test', correct: true }, NOW);
    expect(r.learningStep).toBe(1);
    expect(r.nextReviewDate).toBe(NOW + DAY);
    expect(r.status).toBe('learning');
    expect(r.lastReviewDate).toBe(NOW);
  });

  it('верно и вовремя — шаг растёт на 1, интервал по таблице', () => {
    for (let step = 1; step < 7; step++) {
      const r = applyAnswer(card(step, NOW), { mode: 'test', correct: true }, NOW);
      expect(r.learningStep).toBe(step + 1);
      expect(r.nextReviewDate).toBe(NOW + INTERVALS[Math.min(step + 1, 6)] * DAY);
    }
  });

  it('верно раньше срока — ничего не меняется', () => {
    const due = NOW + 2 * DAY;
    const r = applyAnswer(card(3, due), { mode: 'builder', correct: true }, NOW);
    expect(r.learningStep).toBe(3);
    expect(r.nextReviewDate).toBe(due);
  });

  it('до срока ≤ 6 часов — уже вовремя', () => {
    expect(isCardDue(card(2, NOW + 6 * HOUR), NOW)).toBe(true);
    expect(isCardDue(card(2, NOW + 6 * HOUR + 1), NOW)).toBe(false);
  });

  it('ошибка — шаг −1 (не ниже 0) и сразу к повторению', () => {
    expect(applyAnswer(card(3, NOW), { mode: 'test', correct: false }, NOW)).toMatchObject({
      learningStep: 2,
      nextReviewDate: NOW,
    });
    expect(applyAnswer(card(0, NOW), { mode: 'test', correct: false }, NOW).learningStep).toBe(0);
  });

  it('«Не знаю» (1) — шаг 0; «Сомневаюсь» (2) — шаг тот же, сразу к повторению', () => {
    expect(
      applyAnswer(card(4, NOW + DAY), { mode: 'flashcard', correct: true, selfRating: 1 }, NOW)
    ).toMatchObject({ learningStep: 0, nextReviewDate: NOW });
    expect(
      applyAnswer(card(4, NOW + DAY), { mode: 'flashcard', correct: true, selfRating: 2 }, NOW)
    ).toMatchObject({ learningStep: 4, nextReviewDate: NOW });
  });

  it('угасание: просрочено дольше интервала шага — сначала шаг −1', () => {
    // шаг 3 (интервал 7 дней), просрочено на 8 дней
    const overdue = card(3, NOW - 8 * DAY);
    expect(isCardFading(overdue, NOW)).toBe(true);
    // верный ответ лишь возвращает прежний уровень: 3 − 1 + 1 = 3
    expect(applyAnswer(overdue, { mode: 'test', correct: true }, NOW).learningStep).toBe(3);
    // ошибка: 3 − 1 − 1 = 1
    expect(applyAnswer(overdue, { mode: 'test', correct: false }, NOW).learningStep).toBe(1);
    // новая карточка не угасает
    expect(isCardFading(card(0, NOW - 100 * DAY), NOW)).toBe(false);
  });
});

describe('статусы', () => {
  it('шаг → статус', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(getStatusForStep)).toEqual([
      'new',
      'learning',
      'learning',
      'young',
      'young',
      'mature',
      'mature',
    ]);
  });

  it('выучено — шаг ≥ 3; ждёт повторения — шаг ≥ 1 и срок пришёл', () => {
    expect(isCardLearned({ learningStep: 2 })).toBe(false);
    expect(isCardLearned({ learningStep: 3 })).toBe(true);
    expect(isCardWaitingReview(card(0, NOW - DAY), NOW)).toBe(false);
    expect(isCardWaitingReview(card(1, NOW - DAY), NOW)).toBe(true);
    expect(isCardWaitingReview(card(1, NOW + DAY), NOW)).toBe(false);
  });
});

describe('очередь изучения', () => {
  const mk = (id: string, learningStep: number, nextReviewDate: number): Card =>
    ({
      id,
      learningStep,
      nextReviewDate,
      status: learningStep === 0 ? 'new' : 'learning',
    }) as Card;

  it('сначала давно просроченные (самые старые первыми), потом на сегодня, потом новые; лимиты', () => {
    const now = Date.now();
    const cards = [
      mk('new1', 0, now),
      mk('today', 2, now - HOUR),
      mk('old2', 2, now - 3 * DAY),
      mk('old1', 2, now - 10 * DAY),
      mk('future', 3, now + 5 * DAY),
      mk('new2', 0, now),
    ];
    expect(buildStudyQueue(cards, 1, 10).map((c) => c.id)).toEqual([
      'old1',
      'old2',
      'today',
      'new1',
    ]);
    expect(buildStudyQueue(cards, 5, 1).map((c) => c.id)).toEqual(['old1', 'new1', 'new2']);
  });
});

describe('подписи интервалов', () => {
  it.each([
    [0, 'сегодня'],
    [1, '1 день'],
    [3, '3 дня'],
    [7, '1 неделя'],
    [14, '2 недели'],
    [30, '1 месяц'],
    [60, '2 месяца'],
    [400, '1 год'],
  ])('%d дн → %s', (days, text) => {
    expect(formatInterval(days)).toBe(text);
  });
});

describe('клиент = сервер (api/progress.js)', () => {
  const offsets = [
    -100 * DAY,
    -61 * DAY,
    -15 * DAY,
    -8 * DAY,
    -2 * DAY,
    -DAY - 1,
    -HOUR,
    0,
    HOUR,
    6 * HOUR,
    6 * HOUR + 1,
    2 * DAY,
    40 * DAY,
  ];
  const answers: { mode: AnswerMode; correct: boolean; selfRating?: Rating }[] = [];
  for (const mode of ['test', 'builder', 'flashcard'] as AnswerMode[]) {
    for (const correct of [true, false]) {
      for (const selfRating of [undefined, 1, 2, 3, 4] as (Rating | undefined)[]) {
        answers.push({ mode, correct, selfRating });
      }
    }
  }

  it('isCardFading совпадает с isFading', () => {
    for (let step = 0; step <= 8; step++) {
      for (const off of offsets) {
        expect(isCardFading(card(step, NOW + off), NOW)).toBe(
          server.isFading(step, NOW + off, NOW)
        );
      }
    }
  });

  it('applyAnswer: шаг и дата следующего повторения совпадают во всех комбинациях', () => {
    let checked = 0;
    for (let step = 0; step <= 8; step++) {
      for (const off of offsets) {
        for (const a of answers) {
          const client = applyAnswer(card(step, NOW + off), a, NOW);
          const srv = server.applyAnswer(
            { step, nextReview: NOW + off, reviewScheduled: false },
            a,
            NOW
          );
          expect([step, off, a, client.learningStep, client.nextReviewDate]).toEqual([
            step,
            off,
            a,
            srv.step,
            srv.nextReview,
          ]);
          checked++;
        }
      }
    }
    expect(checked).toBe(9 * offsets.length * answers.length);
  });
});
