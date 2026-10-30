/**
 * Наборы по ссылке (plan/new/share_set.md). Все запросы — через backend (api/share.js),
 * пользователь определяется по Supabase JWT.
 */

import { Platform, Share, Clipboard } from 'react-native';
import { supabase } from './supabaseClient';
import { API_BASE } from '@/config/apiBase';
import { fetchWithTimeout } from '@/utils/fetchWithTimeout';
import { pluralize } from '@/utils';

const SHARE_API = `${API_BASE}/share`;

export interface ShareLink {
  code: string;
  url: string;
}

export interface SharePreview {
  code: string;
  url: string;
  set: {
    title: string;
    description: string;
    category: string;
    languageFrom: string | null;
    languageTo: string | null;
    cardsCount: number;
  };
  author: { name: string | null };
  cards: { front: string; back: string; example: string | null; wordForm: string | null }[];
  /** null — без входа */
  viewer: {
    isOwner: boolean;
    ownSetId: string | null;
    courses: { id: string; title: string }[];
    imports: { courseId: string | null; setId: string }[];
  } | null;
}

export interface SharedCard {
  front: string;
  back: string;
  example: string | null;
  wordForm: string | null;
  wordType: string | null;
}

export interface BlockedAuthor {
  userId: string;
  name: string | null;
  blockedAt: string;
}

export type ShareReportReason = 'offensive' | 'spam' | 'inappropriate' | 'copyright' | 'other';

export interface ShareLinkStatus extends ShareLink {
  views: number;
  imports: number;
}

/** Ошибка api/share.js: `code` — машинный код сервера (empty_set, not_found, …). */
export class ShareApiError extends Error {
  constructor(public code: string, public status: number, public payload: Record<string, unknown> = {}) {
    super(code);
  }
}

async function callShareApi<T>(
  action: string,
  { method = 'GET', params, body }: { method?: 'GET' | 'POST'; params?: Record<string, string>; body?: object } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const query = new URLSearchParams({ action, ...params });
  const resp = await fetchWithTimeout(`${SHARE_API}?${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new ShareApiError(json?.error || `http_${resp.status}`, resp.status, json);
  return json as T;
}

/**
 * Текст для мессенджеров. Ссылка — внутри текста, а не отдельным `url`: на iOS при url + message
 * WhatsApp и часть приложений берут только ссылку и теряют текст.
 */
export function buildShareMessage(title: string, cardCount: number, url: string): string {
  const cards = `${cardCount} ${pluralize(cardCount, 'карточка', 'карточки', 'карточек')}`;
  return `Вот мой набор «${title}» — ${cards}. Давай учить вместе во Flashly!\n${url}`;
}

/** Результат системного меню «Поделиться»: куда отправили (iOS сообщает приложение), отмена или скопировано. */
export type ShareSheetResult =
  | { kind: 'shared'; app: string | null }
  | { kind: 'dismissed' }
  | { kind: 'copied' };

async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  Clipboard.setString(text);
  return true;
}

class ShareServiceClass {
  /** Ссылка на свой набор; повторный вызов отдаёт ту же. */
  createLink(setId: string): Promise<ShareLink> {
    return callShareApi<ShareLink>('create', { method: 'POST', body: { setId } });
  }

  /** Действующая ссылка своего набора или null. */
  async getStatus(setId: string): Promise<ShareLinkStatus | null> {
    const { share } = await callShareApi<{ share: ShareLinkStatus | null }>('status', { params: { setId } });
    return share;
  }

  /** Закрыть доступ: ссылка перестаёт работать, следующее «Поделиться» создаст новую. */
  async disable(setId: string): Promise<void> {
    await callShareApi('disable', { method: 'POST', body: { setId } });
  }

  /** Превью по коду; с сессией — ещё viewer (свои курсы, куда уже добавлял). */
  preview(code: string): Promise<SharePreview> {
    return callShareApi<SharePreview>('preview', { params: { code } });
  }

  /** Все карточки — гость копирует набор на устройство (на сервере у него нет записи). */
  async getAllCards(code: string): Promise<SharedCard[]> {
    const { cards } = await callShareApi<{ cards: SharedCard[] }>('cards', { params: { code } });
    return cards;
  }

  /**
   * Копия набора себе на сервере. 409 already_imported → ShareApiError с payload.setId.
   * @returns id нового набора
   */
  async importSet(code: string, courseId: string | null): Promise<string> {
    const { newSetId } = await callShareApi<{ newSetId: string }>('import', { method: 'POST', body: { code, courseId } });
    return newSetId;
  }

  async report(code: string, reason: ShareReportReason, comment?: string): Promise<void> {
    await callShareApi('report', { method: 'POST', body: { code, reason, comment } });
  }

  async blockAuthor(code: string): Promise<void> {
    await callShareApi('block', { method: 'POST', body: { code } });
  }

  /** Профиль → «Заблокированные авторы». */
  async listBlocks(): Promise<BlockedAuthor[]> {
    const { blocks } = await callShareApi<{ blocks: BlockedAuthor[] }>('blocks');
    return blocks;
  }

  async unblock(userId: string): Promise<void> {
    await callShareApi('unblock', { method: 'POST', body: { userId } });
  }

  /**
   * Системное меню «Поделиться». На вебе без Web Share API (компьютер) — копируем в буфер.
   * @throws если и меню, и буфер недоступны
   */
  async openShareSheet(message: string): Promise<ShareSheetResult> {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
      if (await copyToClipboard(message)) return { kind: 'copied' };
      throw new Error('clipboard_unavailable');
    }
    let result;
    try {
      result = await Share.share({ message });
    } catch (e) {
      // Web Share API: закрытие меню — AbortError, это не ошибка
      if ((e as Error)?.name === 'AbortError') return { kind: 'dismissed' };
      throw e;
    }
    if (result.action === Share.dismissedAction) return { kind: 'dismissed' };
    return { kind: 'shared', app: result.activityType ?? null };
  }
}

export const ShareService = new ShareServiceClass();
