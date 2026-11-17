/**
 * Книги учебного центра по коду — клиент к api/books.js (org-info, org-activate, my-orgs, my-book)
 * и учителя центра (org-teacher-info, org-teacher-join, teacher-orgs).
 * План: plan/new/center_books.md, Center 3 (сервер), Center 5–7 и 13–14 (приложение).
 *
 * Ответ сервера несёт `reason` — по нему экран показывает понятный текст ошибки
 * (utils/centerCode.describeCenterReason). Лимиты и счётчики кода сервер не отдаёт.
 */
import { getAccessToken } from './auth/session';
import { apiFetch } from './api/client';
import type { CenterCodeReason } from '@/utils/centerCode';

export type CenterOrganization = {
  id: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
  /** Приветствие центра для экрана «Центр найден» */
  greeting: string | null;
  /** Где взять новый код — для экрана «Доступ закончился» */
  contact: string | null;
};

export type CenterCodeResult =
  | {
      ok: true;
      /** ok — доступ откроется (org-info) или открыт (org-activate); already_active — уже был */
      reason: 'ok' | 'already_active';
      organization: CenterOrganization;
      accessUntil: string;
    }
  | { ok: false; reason: CenterCodeReason };

/** Открыть доступ по коду: текст ошибки для экрана или null */
export type CenterActivateAction = () => Promise<string | null>;

export type CenterBook = {
  id: string;
  title: string;
  edition: string;
  level: string | null;
  /** Язык слов (изучаемый) */
  languageFrom: string;
  /** Язык перевода (родной) */
  languageTo: string;
  position: number | null;
  unitsCount: number;
  cardsCount: number;
  /** Мой курс этой книги (этап 7): «Добавлена» на полке и «Открыть курс». null — не добавлена */
  courseId?: string | null;
};

/** Курс книги центра от сервера (book-course) — как свой курс в coursesStore */
export type CenterBookCourse = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string | null;
  sourceBookId: string;
};

export type AddBookCourseResult =
  | { ok: true; course: CenterBookCourse; created: boolean }
  | { ok: false; reason: 'network' | 'no_access' | 'unknown' };

export type MyCenter = CenterOrganization & {
  accessUntil: string;
  /** Доступ идёт сейчас (и договор центра не кончился) */
  active: boolean;
  books: CenterBook[];
};

export type MyCenterUnit = {
  id: string;
  number: number;
  title: string;
  /** Официальный набор юнита — по нему сессия «Изучить» */
  setId: string | null;
  totalCards: number;
  /** Последний юнит книги — «Перейти на следующий уровень» */
  isLast: boolean;
};

export type MyCenterBook = {
  bookId: string;
  currentUnitId: string | null;
  /** Есть, если сервер новее Center 6 и юнит выбран */
  currentUnit?: MyCenterUnit | null;
  isActive: boolean;
  updatedAt: string;
};

export type MyCenters = { organizations: MyCenter[]; myBooks: MyCenterBook[] };

const KNOWN: CenterCodeReason[] = [
  'ok',
  'already_active',
  'not_found',
  'expired',
  'full',
  'contract_ended',
  'rate_limited',
];

async function callCenter(
  action: string,
  init: { method?: 'GET' | 'POST'; params?: Record<string, string>; body?: Record<string, unknown> }
) {
  const token = await getAccessToken();
  if (!token) return { ok: false as const, status: 401, json: null };
  const query = new URLSearchParams({ action, ...(init.params || {}) });
  const res = await apiFetch('books', {
    method: init.method || 'GET',
    query,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    auth: 'none',
    body: init.method === 'POST' ? init.body || {} : undefined,
  });
  if (!res.response) return { ok: false as const, status: 0, json: null };
  return { ok: res.ok, status: res.status, json: res.json };
}

function toCodeResult(res: { ok: boolean; status: number; json: any }): CenterCodeResult {
  if (res.status === 0) return { ok: false, reason: 'network' };
  const json = res.json || {};
  if (res.ok && json.ok && json.organization) {
    return {
      ok: true,
      reason: json.reason === 'already_active' ? 'already_active' : 'ok',
      organization: json.organization,
      accessUntil: json.accessUntil,
    };
  }
  const reason = KNOWN.includes(json.reason) ? (json.reason as CenterCodeReason) : 'unknown';
  return { ok: false, reason };
}

/** Центр в окне «приглашает тебя учителем» и на полке «Книги <центр>» */
export type TeacherCenter = Pick<CenterOrganization, 'id' | 'name' | 'city' | 'logoUrl'>;

export type TeacherInviteResult =
  | { ok: true; organization: TeacherCenter; alreadyMember: boolean }
  | { ok: false; reason: 'not_found' | 'contract_ended' | 'network' | 'unknown' };

/** Книга центра на полке учителя — те же поля, что у книги общего каталога */
export type TeacherCenterBook = {
  id: string;
  title: string;
  edition: string;
  level: string | null;
  subject: string | null;
  languageFrom: string;
  languageTo: string;
  publisher: string | null;
  unitsCount: number;
  cardsCount: number;
};

export type TeacherShelf = TeacherCenter & { books: TeacherCenterBook[] };

function toInviteResult(res: { ok: boolean; status: number; json: any }): TeacherInviteResult {
  if (res.status === 0) return { ok: false, reason: 'network' };
  const json = res.json || {};
  if (res.ok && json.ok && json.organization) {
    return { ok: true, organization: json.organization, alreadyMember: !!json.alreadyMember };
  }
  const reason =
    json.reason === 'not_found' || json.reason === 'contract_ended' ? json.reason : 'unknown';
  return { ok: false, reason };
}

export const CenterService = {
  /** Центр по коду без активации — экран «Центр найден»; место не тратится. */
  async getInfo(code: string): Promise<CenterCodeResult> {
    try {
      return toCodeResult(await callCenter('org-info', { params: { code } }));
    } catch {
      return { ok: false, reason: 'network' };
    }
  },

  /** Активировать код: доступ к книгам центра (или продление — дни складываются). */
  async activate(code: string): Promise<CenterCodeResult> {
    try {
      return toCodeResult(await callCenter('org-activate', { method: 'POST', body: { code } }));
    } catch {
      return { ok: false, reason: 'network' };
    }
  },

  /**
   * Выбрать книгу центра: юнит, сделать текущей (на главной) или убрать из «Моих книг».
   * Прогресс по словам не трогается. ok: false — нет сети или нет доступа к центру.
   */
  async setMyBook(input: {
    bookId: string;
    unitId?: string | null;
    active?: boolean;
    remove?: boolean;
  }): Promise<{ ok: boolean; myBook?: MyCenterBook }> {
    try {
      const res = await callCenter('my-book', { method: 'POST', body: input });
      if (!res.ok || !res.json?.ok) return { ok: false };
      return { ok: true, myBook: res.json.myBook as MyCenterBook | undefined };
    } catch {
      return { ok: false };
    }
  },

  /** Ссылка для учителей /t/<код>: какой центр приглашает и учитель ли я уже (Center 13). */
  async getTeacherInvite(token: string): Promise<TeacherInviteResult> {
    try {
      return toInviteResult(await callCenter('org-teacher-info', { params: { token } }));
    } catch {
      return { ok: false, reason: 'network' };
    }
  },

  /** «Стать учителем центра»: роль учителя центра и учителя в приложении. */
  async joinAsTeacher(token: string): Promise<TeacherInviteResult> {
    try {
      const r = toInviteResult(
        await callCenter('org-teacher-join', { method: 'POST', body: { token } })
      );
      return r.ok ? { ...r, alreadyMember: true } : r;
    } catch {
      return { ok: false, reason: 'network' };
    }
  },

  /** Полки «Книги <центр>» в Библиотеке: центры, где я учитель (Center 14). [] — нет или нет сети. */
  async teacherShelves(): Promise<TeacherShelf[]> {
    try {
      const res = await callCenter('teacher-orgs', {});
      if (!res.ok || !res.json?.ok) return [];
      return (res.json.organizations || []) as TeacherShelf[];
    } catch {
      return [];
    }
  },

  /**
   * Книга центра целиком = мой курс (plan/new/center_books.md, этап 7). Повторный вызов вернёт тот же
   * курс. no_access — кода нет или он закончился (сервер отвечает 404).
   */
  async addBookCourse(bookId: string): Promise<AddBookCourseResult> {
    try {
      const res = await callCenter('book-course', { method: 'POST', body: { bookId } });
      if (res.status === 0) return { ok: false, reason: 'network' };
      if (res.ok && res.json?.ok && res.json.course) {
        return { ok: true, course: res.json.course, created: res.json.created === true };
      }
      return { ok: false, reason: res.status === 404 ? 'no_access' : 'unknown' };
    } catch {
      return { ok: false, reason: 'network' };
    }
  },

  /** Мои центры, их книги и мои выбранные книги. null — нет сети или ошибка. */
  async loadMine(): Promise<MyCenters | null> {
    try {
      const res = await callCenter('my-orgs', {});
      if (!res.ok || !res.json?.ok) return null;
      return {
        organizations: res.json.organizations || [],
        myBooks: res.json.myBooks || [],
      };
    } catch {
      return null;
    }
  },
};
