/**
 * Чистые правила кабинета учителя (plan/new/web_cabinet.md, Web 6–9): статусы учеников, фильтры,
 * сортировка, «кому нужна помощь», сводка курса. Без React и сети — проверяется тестами.
 * Пороги те же, что в телефоне (screens/teacherStudents/helpers.tsx): ≤1 дня — активен, 2 — недавно,
 * 3–6 — не заходит, 7+ или никогда — давно.
 */
import { pluralize } from '@/utils';

export type Member = {
  id: string;
  displayName: string;
  email: string | null;
  streak: number;
  /** 'YYYY-MM-DD' или null — ни разу не занимался */
  lastActiveDate: string | null;
  todayCards: number;
  joinedAt: number;
  /** Слова курса, которым пришло время повторения */
  waitingReviews: number;
};

export type StudentStatus = 'online' | 'away' | 'offline' | 'inactive';
export type FilterKey = 'all' | 'active' | 'away3d' | 'away7d';
export type SortKey = 'name' | 'streak' | 'today' | 'waiting' | 'last';
export type SortDir = 'asc' | 'desc';

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'away3d', label: 'Не заходят 3 дня' },
  { key: 'away7d', label: 'Не заходят 7 дней и больше' },
];

/** Сколько календарных дней прошло с последнего занятия; null — не занимался ни разу */
export function daysSince(lastActiveDate: string | null, now: Date = new Date()): number | null {
  if (!lastActiveDate) return null;
  const [y, m, d] = lastActiveDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const last = new Date(y, m - 1, d).getTime();
  return Math.max(0, Math.round((today - last) / 86_400_000));
}

export function studentStatus(
  lastActiveDate: string | null,
  now: Date = new Date()
): StudentStatus {
  const days = daysSince(lastActiveDate, now);
  if (days === null) return 'inactive';
  if (days <= 1) return 'online';
  if (days <= 2) return 'away';
  if (days <= 6) return 'offline';
  return 'inactive';
}

export type ActivityTone = 'success' | 'warning' | 'error' | 'muted';

/** «Сегодня», «Вчера», «4 дня назад», «Не занимался» + смысловой цвет */
export function lastActivityLabel(
  lastActiveDate: string | null,
  now: Date = new Date()
): { text: string; tone: ActivityTone } {
  const days = daysSince(lastActiveDate, now);
  if (days === null) return { text: 'Не занимался', tone: 'muted' };
  if (days === 0) return { text: 'Сегодня', tone: 'success' };
  if (days === 1) return { text: 'Вчера', tone: 'warning' };
  if (days <= 6)
    return { text: `${days} ${pluralize(days, 'день', 'дня', 'дней')} назад`, tone: 'error' };
  if (days < 30)
    return { text: `${days} ${pluralize(days, 'день', 'дня', 'дней')} назад`, tone: 'muted' };
  const weeks = Math.floor(days / 7);
  if (weeks < 9)
    return {
      text: `${weeks} ${pluralize(weeks, 'неделя', 'недели', 'недель')} назад`,
      tone: 'muted',
    };
  const months = Math.floor(days / 30);
  return {
    text: `${months} ${pluralize(months, 'месяц', 'месяца', 'месяцев')} назад`,
    tone: 'muted',
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function filterMembers(
  members: Member[],
  filter: FilterKey,
  query: string,
  now: Date = new Date()
): Member[] {
  let list = members;
  if (filter !== 'all') {
    list = list.filter((m) => {
      const status = studentStatus(m.lastActiveDate, now);
      if (filter === 'active') return status === 'online' || status === 'away';
      if (filter === 'away3d') return status === 'offline';
      return status === 'inactive';
    });
  }
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((m) => m.displayName.toLowerCase().includes(q));
  return list;
}

/** Сортировка; «Был» — по давности занятия, не занимавшиеся считаются самыми давними */
export function sortMembers(
  members: Member[],
  key: SortKey,
  dir: SortDir,
  now: Date = new Date()
): Member[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (m: Member): number | string => {
    switch (key) {
      case 'name':
        return m.displayName.toLowerCase();
      case 'streak':
        return m.streak;
      case 'today':
        return m.todayCards;
      case 'waiting':
        return m.waitingReviews;
      case 'last': {
        const d = daysSince(m.lastActiveDate, now);
        return d === null ? Number.MAX_SAFE_INTEGER : d;
      }
    }
  };
  return [...members].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp =
      typeof va === 'string' && typeof vb === 'string'
        ? va.localeCompare(vb, 'ru')
        : (va as number) - (vb as number);
    // Одинаковые значения — по имени, чтобы порядок не прыгал
    return cmp !== 0 ? sign * cmp : a.displayName.localeCompare(b.displayName, 'ru');
  });
}

export type CourseSummary = {
  total: number;
  activeToday: number;
  /** Ученики, у которых есть слова на повторение */
  waiting: number;
  /** Не занимались 3 дня и дольше (или ни разу) */
  away: number;
};

export function courseSummary(members: Member[], now: Date = new Date()): CourseSummary {
  let activeToday = 0;
  let waiting = 0;
  let away = 0;
  for (const m of members) {
    if (daysSince(m.lastActiveDate, now) === 0) activeToday++;
    if (m.waitingReviews > 0) waiting++;
    const status = studentStatus(m.lastActiveDate, now);
    if (status === 'offline' || status === 'inactive') away++;
  }
  return { total: members.length, activeToday, waiting, away };
}

/** «Кому нужна помощь»: не заходят 3+ дня или ни разу, самые давние первыми */
export function needsHelp(members: Member[], now: Date = new Date(), limit = 6): Member[] {
  return members
    .filter((m) => {
      const status = studentStatus(m.lastActiveDate, now);
      return status === 'offline' || status === 'inactive';
    })
    .sort((a, b) => {
      const da = daysSince(a.lastActiveDate, now);
      const db = daysSince(b.lastActiveDate, now);
      const va = da === null ? Number.MAX_SAFE_INTEGER : da;
      const vb = db === null ? Number.MAX_SAFE_INTEGER : db;
      return vb - va || a.displayName.localeCompare(b.displayName, 'ru');
    })
    .slice(0, limit);
}

/** «22 ученика» */
export function studentsCountLabel(count: number): string {
  return `${count} ${pluralize(count, 'ученик', 'ученика', 'учеников')}`;
}

/** Порция длинного списка: «Показать ещё» добавляет по PAGE_SIZE */
export const PAGE_SIZE = 25;

/** Ссылка-приглашение в курс: открывает приложение или страницу с App Store */
export function inviteLink(token: string): string {
  return `https://flashlycards.app/join/${token}`;
}

/** Совпадает ли введённое название с названием курса (для окна удаления): без учёта регистра и пробелов по краям */
export function titleMatches(input: string, title: string): boolean {
  return input.trim().toLowerCase() === title.trim().toLowerCase() && title.trim().length > 0;
}
