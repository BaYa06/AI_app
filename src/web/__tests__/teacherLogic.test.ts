import { describe, expect, it } from '@jest/globals';
import {
  courseSummary,
  daysSince,
  filterMembers,
  initials,
  inviteLink,
  lastActivityLabel,
  needsHelp,
  sortMembers,
  studentStatus,
  studentsCountLabel,
  titleMatches,
  type Member,
} from '../teacherLogic';

const NOW = new Date(2026, 10, 28, 15, 0); // 28 ноября 2026, локальное время

const ago = (n: number) => {
  const d = new Date(2026, 10, 28 - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const m = (name: string, daysAgo: number | null, over: Partial<Member> = {}): Member => ({
  id: name,
  displayName: name,
  email: null,
  streak: 0,
  lastActiveDate: daysAgo === null ? null : ago(daysAgo),
  todayCards: 0,
  joinedAt: 0,
  waitingReviews: 0,
  ...over,
});

describe('daysSince и статусы', () => {
  it('считает календарные дни, а не 24-часовые периоды', () => {
    expect(daysSince(ago(0), NOW)).toBe(0);
    expect(daysSince(ago(3), NOW)).toBe(3);
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince('мусор', NOW)).toBeNull();
  });
  it('будущая дата не уходит в минус', () => {
    expect(daysSince(ago(-2), NOW)).toBe(0);
  });
  it('пороги как в телефоне', () => {
    expect(studentStatus(ago(1), NOW)).toBe('online');
    expect(studentStatus(ago(2), NOW)).toBe('away');
    expect(studentStatus(ago(3), NOW)).toBe('offline');
    expect(studentStatus(ago(6), NOW)).toBe('offline');
    expect(studentStatus(ago(7), NOW)).toBe('inactive');
    expect(studentStatus(null, NOW)).toBe('inactive');
  });
});

describe('lastActivityLabel', () => {
  it('подписи и смысловой цвет', () => {
    expect(lastActivityLabel(ago(0), NOW)).toEqual({ text: 'Сегодня', tone: 'success' });
    expect(lastActivityLabel(ago(1), NOW)).toEqual({ text: 'Вчера', tone: 'warning' });
    expect(lastActivityLabel(ago(4), NOW)).toEqual({ text: '4 дня назад', tone: 'error' });
    expect(lastActivityLabel(ago(15), NOW).text).toBe('15 дней назад');
    expect(lastActivityLabel(ago(40), NOW).text).toBe('5 недель назад');
    expect(lastActivityLabel(null, NOW)).toEqual({ text: 'Не занимался', tone: 'muted' });
  });
});

describe('фильтры и поиск', () => {
  const list = [m('Анна', 0), m('Борис', 2), m('Вера', 4), m('Глеб', 20), m('Дина', null)];
  it('active — сегодня–позавчера', () => {
    expect(filterMembers(list, 'active', '', NOW).map((x) => x.id)).toEqual(['Анна', 'Борис']);
  });
  it('away3d — 3–6 дней; away7d — давно и никогда', () => {
    expect(filterMembers(list, 'away3d', '', NOW).map((x) => x.id)).toEqual(['Вера']);
    expect(filterMembers(list, 'away7d', '', NOW).map((x) => x.id)).toEqual(['Глеб', 'Дина']);
  });
  it('поиск без учёта регистра и пробелов по краям', () => {
    expect(filterMembers(list, 'all', '  аНН ', NOW).map((x) => x.id)).toEqual(['Анна']);
  });
});

describe('sortMembers', () => {
  const list = [
    m('Борис', 2, { streak: 5, todayCards: 0 }),
    m('Анна', 0, { streak: 12, todayCards: 30 }),
    m('Дина', null, { streak: 0 }),
    m('Вера', 4, { streak: 5 }),
  ];
  it('по имени с русской раскладкой', () => {
    expect(sortMembers(list, 'name', 'asc', NOW).map((x) => x.id)).toEqual([
      'Анна',
      'Борис',
      'Вера',
      'Дина',
    ]);
  });
  it('по серии: одинаковые — по имени, порядок не прыгает', () => {
    expect(sortMembers(list, 'streak', 'desc', NOW).map((x) => x.id)).toEqual([
      'Анна',
      'Борис',
      'Вера',
      'Дина',
    ]);
  });
  it('«Был»: не занимавшийся — самый давний', () => {
    expect(sortMembers(list, 'last', 'desc', NOW).map((x) => x.id)[0]).toBe('Дина');
    expect(sortMembers(list, 'last', 'asc', NOW).map((x) => x.id)[0]).toBe('Анна');
  });
  it('не меняет исходный массив', () => {
    const copy = [...list];
    sortMembers(list, 'name', 'desc', NOW);
    expect(list).toEqual(copy);
  });
});

describe('сводка и «кому нужна помощь»', () => {
  const list = [
    m('Анна', 0, { waitingReviews: 3 }),
    m('Борис', 1),
    m('Вера', 5, { waitingReviews: 12 }),
    m('Глеб', 30),
    m('Дина', null),
  ];
  it('courseSummary', () => {
    expect(courseSummary(list, NOW)).toEqual({ total: 5, activeToday: 1, waiting: 2, away: 3 });
  });
  it('needsHelp: давние первыми, не занимавшиеся — самые первые, есть лимит', () => {
    expect(needsHelp(list, NOW).map((x) => x.id)).toEqual(['Дина', 'Глеб', 'Вера']);
    expect(needsHelp(list, NOW, 2)).toHaveLength(2);
  });
  it('пустой курс', () => {
    expect(courseSummary([], NOW)).toEqual({ total: 0, activeToday: 0, waiting: 0, away: 0 });
    expect(needsHelp([], NOW)).toEqual([]);
  });
});

describe('мелочи', () => {
  it('initials', () => {
    expect(initials('Айгерим Нурмухамбетова')).toBe('АН');
    expect(initials('Ким')).toBe('КИ');
    expect(initials('   ')).toBe('?');
  });
  it('склонение', () => {
    expect(studentsCountLabel(1)).toBe('1 ученик');
    expect(studentsCountLabel(3)).toBe('3 ученика');
    expect(studentsCountLabel(11)).toBe('11 учеников');
    expect(studentsCountLabel(22)).toBe('22 ученика');
  });
  it('ссылка-приглашение', () => {
    expect(inviteLink('abc')).toBe('https://flashlycards.app/join/abc');
  });
  it('titleMatches: пустое название не подтверждается', () => {
    expect(titleMatches(' a2 группа ', 'A2 Группа')).toBe(true);
    expect(titleMatches('', '')).toBe(false);
    expect(titleMatches('A2', 'A2 Группа')).toBe(false);
  });
});
