import { describe, expect, it } from '@jest/globals';
import {
  groupDigits,
  reportFigures,
  reportQuery,
  reportShareText,
  reportSubtitle,
  reportTitle,
  unitLabel,
  type TeacherReport,
} from '../teacherReport';

const parent: TeacherReport = {
  kind: 'parent',
  period: 'all',
  periodLabel: '22 окт – 12 ноя',
  course: 'A1-E',
  teacher: 'Ильяз агай',
  answers: 2331,
  correctPct: 86,
  weeks: [],
  comment: '',
  student: 'Aiperi Toktogulova',
  activeDays: 14,
  streak: 11,
  units: [{ title: 'Ünite 5', seen: 50, total: 50, correctPct: 85 }],
};
const group: TeacherReport = {
  kind: 'group',
  period: 'week',
  periodLabel: '5–12 ноя',
  course: 'A1-B',
  teacher: 'Айгуль',
  answers: 400,
  correctPct: 75,
  weeks: [],
  comment: '',
  students: 22,
  activeStudents: 18,
  best: [],
  inactive: ['Бекжан', 'Batyr'],
};

describe('превью отчёта', () => {
  it('цифры родителям — как на странице отчёта', () => {
    expect(groupDigits(2331)).toBe('2 331');
    expect(reportFigures(parent)).toEqual([
      { value: '14', label: 'дней занятий', good: false },
      { value: '11 дней', label: 'подряд без пропуска', good: false },
      { value: '2 331', label: 'ответ на карточки', good: false },
      { value: '86%', label: 'верных ответов', good: true },
    ]);
  });

  it('цифры группе; без ответов — прочерк', () => {
    const figures = reportFigures({ ...group, correctPct: null });
    expect(figures[0]).toEqual({ value: '18 из 22', label: 'учеников занимались', good: false });
    expect(figures[1]).toEqual({ value: '2', label: 'не заходят 7+ дней', good: false });
    expect(figures[3].value).toBe('—');
  });

  it('заголовки, юниты, текст для «Поделиться»', () => {
    expect(reportTitle(parent)).toBe('Aiperi Toktogulova');
    expect(reportSubtitle(parent)).toBe('группа A1-E · Ильяз агай');
    expect(reportTitle(group)).toBe('Группа A1-B');
    expect(reportSubtitle(group)).toBe('Айгуль');
    expect(unitLabel(parent.units![0])).toBe('Ünite 5 · все 50 слов');
    expect(unitLabel({ title: 'Ünite 5', seen: 12, total: 50 })).toBe('Ünite 5 · 12 из 50 слов');
    expect(reportShareText(parent, 'https://x/r/abc')).toBe(
      'Отчёт Flashly: Aiperi Toktogulova, 22 окт – 12 ноя\nhttps://x/r/abc'
    );
  });

  it('в запрос ученик уходит только у отчёта родителям', () => {
    expect(reportQuery({ courseId: 'c', kind: 'parent', studentId: 'u', period: 'all' })).toEqual({
      courseId: 'c',
      kind: 'parent',
      period: 'all',
      studentId: 'u',
    });
    expect(reportQuery({ courseId: 'c', kind: 'group', studentId: 'u', period: 'week' })).toEqual({
      courseId: 'c',
      kind: 'group',
      period: 'week',
    });
  });
});
