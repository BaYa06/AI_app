import { describe, expect, it } from '@jest/globals';
import type { HomeworkStudentRow } from '@/services/homework';
import {
  fixedText,
  homeworkCounts,
  homeworkHeaderSubtitle,
  remindButtonText,
  remindableIds,
  sortHomeworkRows,
  statusLabel,
} from '../homeworkStatus';

const NOW = Date.UTC(2026, 10, 12, 12, 0);

function row(over: Partial<HomeworkStudentRow>): HomeworkStudentRow {
  return {
    id: 'x',
    displayName: 'X',
    lastActiveDate: null,
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

describe('экран сдачи', () => {
  const list = [
    row({ id: 'k', displayName: 'Kanayım', status: 'submitted', score: 98, credited: 48 }),
    row({ id: 'b', displayName: 'Белек', status: 'in_progress', credited: 32 }),
    row({ id: 'n', displayName: 'Бекжан', status: 'not_started' }),
    row({ id: 'a', displayName: 'Aziza', status: 'in_progress', credited: 22 }),
  ];

  it('счётчики и порядок: не начали → меньше засчитано → сдали', () => {
    expect(homeworkCounts(list)).toEqual({ submitted: 1, inProgress: 2, notStarted: 1, total: 4 });
    expect(sortHomeworkRows(list).map((s) => s.id)).toEqual(['n', 'a', 'b', 'k']);
  });

  it('подписи статусов, оценка ниже порога видна', () => {
    expect(statusLabel(list[0], 48, 80)).toEqual({ text: 'Сдано · 98%', tone: 'success' });
    expect(statusLabel(row({ status: 'submitted', late: true, score: 90 }), 48, 80).text).toBe(
      'Сдано с опозданием · 90%'
    );
    expect(statusLabel(list[1], 48, 80)).toEqual({ text: '32/48', tone: 'warning' });
    expect(statusLabel(row({ status: 'in_progress', credited: 48, score: 70 }), 48, 80).text).toBe(
      '48/48 · 70%'
    );
    expect(statusLabel(list[2], 48, 80)).toEqual({ text: 'Не начато', tone: 'muted' });
  });

  it('кому напомнить: не сдали и не напоминали 20 часов', () => {
    const reminded = row({
      id: 'r',
      status: 'in_progress',
      remindedAt: new Date(NOW - 3600 * 1000).toISOString(),
    });
    const old = row({
      id: 'o',
      status: 'not_started',
      remindedAt: new Date(NOW - 25 * 3600 * 1000).toISOString(),
    });
    expect(remindableIds([...list, reminded, old], NOW)).toEqual(['b', 'n', 'a', 'o']);
    expect(remindButtonText(15)).toBe('Напомнить 15 ученикам');
    expect(remindButtonText(1)).toBe('Напомнить 1 ученику');
  });

  it('шапка и «закреплено»', () => {
    expect(homeworkHeaderSubtitle('A1-B', 80)).toBe('A1-B · выучить все слова · от 80%');
    expect(homeworkHeaderSubtitle('A1-B', null)).toBe('A1-B · выучить все слова');
    expect(fixedText(list, 48)).toBeNull();
    const done = [row({ status: 'submitted', fixed: 30 }), row({ status: 'submitted', fixed: 36 })];
    expect(fixedText(done, 48)).toBe(
      'Закреплено: у сдавших в среднем 33 из 48 слов на «Знаю» (69%)'
    );
  });
});
