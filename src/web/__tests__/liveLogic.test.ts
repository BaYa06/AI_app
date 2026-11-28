import { describe, expect, it } from '@jest/globals';
import type { ExamEvent } from '@/services/exam';
import {
  eventText,
  formatClock,
  hotkeyAction,
  isTimeWarning,
  leftReasonText,
  oldVersionProblems,
  problems,
  progressPct,
  shouldAutoFinish,
  studentState,
  summarize,
  timeLeftSec,
  type Participant,
} from '../exam/liveLogic';
import { channelName, parseMessage, projectorUrl, visibleNames } from '../exam/projector';

const p = (over: Partial<Participant> = {}): Participant => ({
  userId: 'u1',
  name: 'Анна',
  answered: 0,
  total: 10,
  done: false,
  ...over,
});

const ev = (over: Partial<ExamEvent>): ExamEvent => ({
  id: '1',
  kind: 'old_version',
  userId: 'u9',
  name: 'Борис',
  detail: {},
  at: '2026-11-28T10:00:00Z',
  ...over,
});

describe('таймер', () => {
  const base = { durationSec: 600, startedAt: '2026-11-28T10:00:00Z', pausedTotalSec: 0 };
  it('считает остаток по часам сервера', () => {
    expect(timeLeftSec({ ...base, serverNow: '2026-11-28T10:03:20Z' })).toBe(400);
  });
  it('пауза: время не идёт, пока она включена', () => {
    expect(
      timeLeftSec({ ...base, serverNow: '2026-11-28T10:05:00Z', pausedAt: '2026-11-28T10:02:00Z' })
    ).toBe(480);
  });
  it('прошлые паузы вычитаются из прошедшего времени', () => {
    expect(timeLeftSec({ ...base, pausedTotalSec: 60, serverNow: '2026-11-28T10:03:00Z' })).toBe(
      480
    );
  });
  it('вышло — ноль, а не минус', () => {
    expect(timeLeftSec({ ...base, serverNow: '2026-11-28T11:00:00Z' })).toBe(0);
  });
  it('нет срока или старта — null', () => {
    expect(timeLeftSec({ durationSec: null, startedAt: null })).toBeNull();
    expect(timeLeftSec({ durationSec: 600, startedAt: null })).toBeNull();
    expect(
      timeLeftSec({ durationSec: 600, startedAt: 'мусор', serverNow: '2026-11-28T10:00:00Z' })
    ).toBeNull();
  });
  it('часы и красный порог 3 минуты', () => {
    expect(formatClock(414)).toBe('6:54');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(-3)).toBe('0:00');
    expect(isTimeWarning(180)).toBe(true);
    expect(isTimeWarning(181)).toBe(false);
    expect(isTimeWarning(null)).toBe(false);
  });
});

describe('состояние учеников', () => {
  it('приоритет: вышел → сдал → вне приложения → пишет → не начал', () => {
    expect(studentState(p({ leftReason: 'background', done: true }))).toBe('left');
    expect(studentState(p({ done: true, away: true }))).toBe('done');
    expect(studentState(p({ away: true, answered: 3 }))).toBe('away');
    expect(studentState(p({ answered: 3 }))).toBe('working');
    expect(studentState(p())).toBe('waiting');
  });
  it('прогресс в процентах без выхода за границы', () => {
    expect(progressPct(p({ answered: 5 }))).toBe(50);
    expect(progressPct(p({ answered: 15 }))).toBe(100);
    expect(progressPct(p({ total: 0 }))).toBe(0);
  });
  it('сводка', () => {
    const list = [
      p({ userId: 'a', answered: 4 }),
      p({ userId: 'b', done: true }),
      p({ userId: 'c', leftReason: 'manual' }),
      p({ userId: 'd', away: true, answered: 1 }),
    ];
    expect(summarize(list)).toEqual({ total: 4, working: 2, done: 1, left: 1, away: 1 });
  });
  it('автозавершение: все сдали и никто не вышел', () => {
    expect(shouldAutoFinish([p({ done: true }), p({ userId: 'b', done: true })])).toBe(true);
    expect(
      shouldAutoFinish([
        p({ done: true }),
        p({ userId: 'b', done: true, leftReason: 'background' }),
      ])
    ).toBe(false);
    expect(shouldAutoFinish([p({ done: true }), p({ userId: 'b' })])).toBe(false);
    expect(shouldAutoFinish([])).toBe(false);
  });
});

describe('«нужно внимание»', () => {
  it('вышедший, вне приложения, часто выходил', () => {
    const list = [
      p({ userId: 'a', name: 'А', leftReason: 'background' }),
      p({ userId: 'b', name: 'Б', away: true, answered: 2 }),
      p({ userId: 'c', name: 'В', awayCount: 3, answered: 2 }),
      p({ userId: 'd', name: 'Г', awayCount: 1, answered: 2 }),
      p({ userId: 'e', name: 'Д', awayCount: 5, done: true }),
    ];
    expect(problems(list, []).map((x) => [x.name, x.kind])).toEqual([
      ['А', 'left'],
      ['Б', 'away'],
      ['В', 'away_often'],
    ]);
  });
  it('старая версия: один раз на ученика и только пока он не зашёл', () => {
    const events = [ev({}), ev({ id: '2' }), ev({ id: '3', userId: 'u1', name: 'Анна' })];
    const r = oldVersionProblems(events, new Set(['u1']));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'Борис', kind: 'old_version' });
  });
  it('подписи', () => {
    expect(leftReasonText('background')).toBe('вышел из приложения');
    expect(leftReasonText('manual')).toBe('завершил сам');
    expect(leftReasonText('что-то новое')).toBe('вышел из экзамена');
    expect(eventText(ev({}))).toMatch(/старая версия/);
    expect(eventText(ev({ kind: 'back', detail: { sec: 2 } }))).toMatch(/через 2 с/);
    expect(eventText(ev({ kind: 'extra_time', detail: { minutes: 2 } }))).toMatch(/2 минуты/);
    expect(eventText(ev({ kind: 'paused' }))).toBe('Пауза для всех');
  });
});

describe('горячие клавиши', () => {
  it('пробел и P (в том числе русская З)', () => {
    expect(hotkeyAction({ key: ' ' })).toBe('pause');
    expect(hotkeyAction({ key: 'p' })).toBe('projector');
    expect(hotkeyAction({ key: 'з' })).toBe('projector');
    expect(hotkeyAction({ key: 'x' })).toBeNull();
  });
  it('в полях ввода, на кнопках и с модификаторами не срабатывают', () => {
    expect(hotkeyAction({ key: ' ', targetTag: 'INPUT' })).toBeNull();
    expect(hotkeyAction({ key: ' ', targetTag: 'BUTTON' })).toBeNull();
    expect(hotkeyAction({ key: 'p', metaKey: true })).toBeNull();
    expect(hotkeyAction({ key: 'p', ctrlKey: true })).toBeNull();
  });
});

describe('проектор: что пропускаем через канал', () => {
  it('нормальное состояние проходит, лишнее обрезается', () => {
    const m = parseMessage({
      type: 'state',
      state: {
        phase: 'lobby',
        code: '48 21<script>',
        joined: 3,
        names: ['Анна', 'Борис', 7, 'Я'.repeat(100)],
        timeLeftSec: null,
        setTitle: 'Unit 4',
        secret: 'x',
      },
    });
    expect(m).toEqual({
      type: 'state',
      state: {
        phase: 'lobby',
        code: '4821scri',
        joined: 3,
        names: ['Анна', 'Борис', 'Я'.repeat(40)],
        timeLeftSec: null,
        setTitle: 'Unit 4',
      },
    });
    expect((m as { state: object }).state).not.toHaveProperty('secret');
  });
  it('имён нет (курс младше 18) — null, не пустой список', () => {
    const m = parseMessage({
      type: 'state',
      state: { phase: 'active', code: '1', joined: 5, names: null, timeLeftSec: 90 },
    });
    expect(m).toMatchObject({ state: { names: null, timeLeftSec: 90, phase: 'active' } });
  });
  it('мусор: неизвестная фаза, отрицательные и нечисловые значения', () => {
    const m = parseMessage({
      type: 'state',
      state: { phase: 'hack', joined: -4, timeLeftSec: 'x', code: 5 },
    });
    expect(m).toMatchObject({
      state: { phase: 'offline', joined: 0, timeLeftSec: null, code: '' },
    });
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage('state')).toBeNull();
    expect(parseMessage({ type: 'evil' })).toBeNull();
    expect(parseMessage({ type: 'state' })).toBeNull();
  });
  it('hello и closed', () => {
    expect(parseMessage({ type: 'hello' })).toEqual({ type: 'hello' });
    expect(parseMessage({ type: 'closed' })).toEqual({ type: 'closed' });
  });
  it('канал, адрес, имена для младше 18', () => {
    expect(channelName('abc')).toBe('teach-projector:abc');
    expect(projectorUrl('a b')).toMatch(/\/projector\/a%20b$/);
    expect(visibleNames([{ name: 'Анна' }, { name: '' }], false)).toEqual(['Анна']);
    expect(visibleNames([{ name: 'Анна' }], true)).toBeNull();
  });
});
