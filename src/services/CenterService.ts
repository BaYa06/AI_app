/**
 * Книги учебного центра по коду — клиент к api/books.js (org-info, org-activate, my-orgs, my-book).
 * План: plan/new/center_books.md, Center 3 (сервер) и Center 5–7 (приложение).
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
};

export type MyCenter = CenterOrganization & {
  accessUntil: string;
  /** Доступ идёт сейчас (и договор центра не кончился) */
  active: boolean;
  books: CenterBook[];
};

export type MyCenterBook = {
  bookId: string;
  currentUnitId: string | null;
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
