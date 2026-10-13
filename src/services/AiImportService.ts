/**
 * AiImportService
 * @description Единый ИИ-импорт (plan/ai_import.md): фото, PDF, CSV/TSV и вставленный текст →
 * карточки через api/ai?fn=import-files, и дневной лимит распознаваний (fn=usage).
 * Ошибки сервера превращаются в AiImportError с кодом — экран показывает понятный текст.
 */
import { API_BASE } from '@/config/apiBase';
import { supabase } from './supabaseClient';
import { fetchWithTimeout } from '@/utils/fetchWithTimeout';

/** Файл, подготовленный к отправке (фото уже сжато, PDF/таблица прочитаны) */
export type ImportFileKind = 'image' | 'pdf' | 'table' | 'text';

export interface ImportFile {
  id: string;
  name: string;
  kind: ImportFileKind;
  mimeType: string;
  /** Фото и PDF */
  base64?: string;
  /** CSV/TSV и вставленный текст */
  content?: string;
  /** Для подписи в списке: превью фото (uri или data:) */
  previewUri?: string;
}

export type ImportGoal = 'vocab' | 'pick_words' | 'all_words' | 'terms' | 'qa';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type ImportContentKind = 'vocab' | 'text' | 'exercise' | 'empty';

export interface ImportedCard {
  front: string;
  back: string;
  example?: string;
  wordForm?: string;
  wordType?: 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';
  confidence?: 'low';
}

export interface AiUsage {
  used: number;
  limit: number;
  resetAt: string;
}

export interface ImportResult {
  cards: ImportedCard[];
  suggestedTitle: string;
  kind: ImportContentKind;
  lang: string | null;
  excerpt?: string;
  usage?: AiUsage;
}

export interface ImportRequest {
  files: ImportFile[];
  goal?: ImportGoal;
  level?: CefrLevel;
  prompt?: string;
  languageFrom?: string;
  languageTo?: string;
}

export type AiImportErrorCode =
  | 'ai_busy'      // все модели перегружены — повторить через retryAfter
  | 'daily_limit'  // исчерпан дневной лимит — до resetAt
  | 'too_large'    // больше ~3 МБ за раз
  | 'unauthorized'
  | 'network'
  | 'server';

export class AiImportError extends Error {
  code: AiImportErrorCode;
  retryAfter?: number;
  resetAt?: string;

  constructor(code: AiImportErrorCode, message: string, extra: { retryAfter?: number; resetAt?: string } = {}) {
    super(message);
    this.code = code;
    this.retryAfter = extra.retryAfter;
    this.resetAt = extra.resetAt;
  }
}

/** Лимиты как на сервере (api/_ai/import-files.js): тело запроса Vercel — 4,5 МБ */
export const IMPORT_LIMITS = {
  maxFiles: 5,
  /** Сумма base64 + текста; сервер принимает до 4,2 млн символов, оставляем запас */
  maxTotalChars: 4_000_000,
  /** Сырой PDF: ~3 МБ → ~4 млн символов base64 */
  maxPdfBytes: 3 * 1024 * 1024,
  maxPastedChars: 20_000,
} as const;

/** Сколько символов займёт файл в запросе */
export function payloadSize(file: ImportFile): number {
  return (file.base64?.length ?? 0) + (file.content?.length ?? 0);
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new AiImportError('unauthorized', 'Войди в аккаунт, чтобы создавать карточки с ИИ');
  return { Authorization: `Bearer ${token}` };
}

async function toAiError(response: Response): Promise<AiImportError> {
  const body = await response.json().catch(() => ({} as Record<string, unknown>));
  const error = typeof body.error === 'string' ? body.error : '';
  if (response.status === 429 && error === 'daily_limit') {
    return new AiImportError('daily_limit', 'Лимит распознаваний на сегодня исчерпан', { resetAt: body.resetAt as string });
  }
  if (response.status === 429) {
    return new AiImportError('ai_busy', 'ИИ сейчас перегружен', { retryAfter: Number(body.retryAfter) || 30 });
  }
  if (response.status === 413) return new AiImportError('too_large', 'Слишком много за раз — максимум ~3 МБ');
  if (response.status === 401) return new AiImportError('unauthorized', 'Войди в аккаунт, чтобы создавать карточки с ИИ');
  if (response.status === 504) return new AiImportError('ai_busy', 'ИИ не успел ответить', { retryAfter: 10 });
  return new AiImportError('server', error || 'Не удалось создать карточки');
}

/** Распознать файлы и создать карточки. Ответ ждём до ~2 минут: сервер перебирает модели. */
export async function importFiles(request: ImportRequest): Promise<ImportResult> {
  const headers = await authHeaders();
  const files = request.files.map(f =>
    f.kind === 'image' || f.kind === 'pdf'
      ? { type: 'binary', name: f.name, mimeType: f.mimeType, base64: f.base64 }
      : { type: 'text', name: f.name, mimeType: f.mimeType, content: f.content },
  );

  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE}/ai?fn=import-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        files,
        goal: request.goal,
        level: request.level,
        prompt: request.prompt?.trim() || undefined,
        languageFrom: request.languageFrom,
        languageTo: request.languageTo,
      }),
    }, 120_000);
  } catch {
    throw new AiImportError('network', 'Нет связи с сервером. Проверь интернет');
  }

  if (!response.ok) throw await toAiError(response);
  const data = await response.json();
  return {
    cards: Array.isArray(data.cards) ? data.cards : [],
    suggestedTitle: typeof data.suggestedTitle === 'string' ? data.suggestedTitle : '',
    kind: data.kind ?? 'vocab',
    lang: data.lang ?? null,
    excerpt: data.excerpt,
    usage: data.usage,
  };
}

/** Сколько распознаваний осталось сегодня; null — не удалось узнать (не мешает работе) */
export async function getAiUsage(): Promise<AiUsage | null> {
  try {
    const headers = await authHeaders();
    const response = await fetchWithTimeout(`${API_BASE}/ai?fn=usage`, { headers }, 15_000);
    if (!response.ok) return null;
    return (await response.json()) as AiUsage;
  } catch {
    return null;
  }
}
