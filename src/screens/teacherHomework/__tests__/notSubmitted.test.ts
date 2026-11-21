import { describe, expect, it } from '@jest/globals';
import type { HomeworkStatusData, HomeworkStudentRow } from '@/services/homework';
import {
  defaultPicked,
  filterRows,
  lastSeenText,
  notSubmittedRows,
  notSubmittedTitle,
  sendLabel,
  tabs,
} from '../notSubmitted';

const NOW = Date.UTC(2026, 10, 12, 12, 0);

function row(over: Partial<HomeworkStudentRow>): HomeworkStudentRow {
  return {
    id: 'x',
    displayName: 'X',
    lastActiveDate: '2026-11-12',
    status: 'not_started',
    credited: 0,
    score: null,
    submittedAt: null,
    late: false,
    remindedAt: null,
    fixed: null,
    ...over,
  };
}

const data: HomeworkStatusData = {
  homework: {
    id: 'h',
    courseId: 'c',
    title: 'Ünite 4',
    words: 48,
    dueAt: '2026-11-15T14:00:00Z',
    minScore: 80,
    createdAt: '',
    canceled: false,
  },
  students: [
    row({ id: 'k', displayName: 'Kanayım', status: 'submitted', credited: 48 }),
    row({ id: 'h', displayName: 'Хафса', status: 'in_progress', credited: 37 }),
    row({ id: 'a', displayName: 'Aziza', status: 'in_progress', credited: 22 }),
    row({ id: 'b', displayName: 'Бекжан', lastActiveDate: '2026-10-31' }),
    row({
      id: 'r',
      displayName: 'Batyr',
      remindedAt: new Date(NOW - 3600 * 1000).toISOString(),
    }),
  ],
};

describe('кто не сдал', () => {
  it('последний заход: 7+ дней — тревога', () => {
    expect(lastSeenText('2026-11-12', NOW)).toEqual({ text: 'заходил сегодня', alert: false });
    expect(lastSeenText('2026-11-11', NOW).text).toBe('заходил вчера');
    expect(lastSeenText('2026-11-08', NOW)).toEqual({ text: '4 дня назад', alert: false });
    expect(lastSeenText('2026-10-31', NOW)).toEqual({ text: 'не заходит 12 дней', alert: true });
    expect(lastSeenText(null, NOW).alert).toBe(true);
  });

  it('без сдавших, сначала не начали, потом меньше засчитано', () => {
    const rows = notSubmittedRows(data, NOW);
    expect(rows.map((r) => r.id)).toEqual(['b', 'r', 'a', 'h']);
    expect(rows.find((r) => r.id === 'a')?.status).toBe('22/48');
    expect(notSubmittedTitle(rows, 5)).toBe('Не сдали · 4 из 5');
    expect(tabs(rows).map((t) => t.label)).toEqual(['Все · 4', 'В процессе · 2', 'Не начали · 2']);
    expect(filterRows(rows, 'in_progress').map((r) => r.id)).toEqual(['a', 'h']);
  });

  it('по умолчанию выбраны все, кому сегодня ещё не напоминали', () => {
    const rows = notSubmittedRows(data, NOW);
    expect([...defaultPicked(rows)].sort()).toEqual(['a', 'b', 'h']);
    expect(sendLabel(3, null)).toBe('Напомнить 3 ученикам');
    expect(sendLabel(0, null)).toBe('Выбери, кому напомнить');
    expect(sendLabel(3, 3)).toBe('Напомнили 3 ученикам');
  });
});
