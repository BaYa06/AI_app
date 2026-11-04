/**
 * Тонкий HTTP-клиент к нашему backend (Vercel `api/*.js`) — plan/new/code_cleanup.md, Clean 5c.
 *
 * Зачем: каждый сервис (`callDataApi`, `callTeacherApi`, `callBooksApi`, `callShareApi`, …) сам
 * собирал URL, доставал токен, ставил заголовки, таймаут и разбирал ответ. Клиент делает только
 * эту механику, а решения — что вернуть вызывающему коду (null / ApiResult / reason / исключение
 * своего типа), что залогировать — остаются в сервисе. Поэтому сервисы переводятся на клиент
 * (Clean 5d) без изменения поведения.
 *
 * Правила:
 * - **Никаких новых заголовков** (версии приложения и т.п.): на web любой нестандартный
 *   заголовок — это CORS preflight и изменение контракта с сервером. Клиент ставит только
 *   `Content-Type: application/json` (когда есть тело) и `Authorization` (когда есть токен);
 *   остальное — явно через `headers`.
 * - **Повторы выключены** (`retry: 0` по умолчанию; сейчас повторов нет нигде). Повтор — только
 *   GET и только при сетевой ошибке (`code: 'network'`): не при таймауте, не при отмене, не при
 *   HTTP-ошибке. POST не повторяется никогда (answer, join, buyStreakFreeze — повтор опасен).
 * - **Не бросает** на HTTP-ошибках, сетевой ошибке, таймауте, отмене и отсутствии токена —
 *   всегда возвращает {@link ApiResponse}. Так сервис повторяет любую свою текущую ветку:
 *   вернуть null / `{ ok: false, status: 0 }` / бросить свою ошибку (для Library/Share — исходную
 *   ошибку fetch, она лежит в `error.original`). Бросает только то, что бросал бы прямой код вне
 *   своего try: исключение `getAccessToken()` (см. auth/session.ts — «нет сети» не должно
 *   превратиться в «не авторизован») и `JSON.stringify` тела.
 * - **Без логов**: сервисы логируют сами, со своими тегами и текстом (Neon — warn/error по
 *   статусу, Library/Share/Books — никак). Лог в клиенте задвоил бы одни и добавил бы новые
 *   другим.
 * - Импортирует только apiBase, fetchWithTimeout и auth/session. В баррел `@/services` не
 *   добавлять (сторы импортируют клиент напрямую — иначе циклы).
 *
 * @example
 * const res = await apiFetch<{ data: Stats }>('data', {
 *   method: 'GET',
 *   query: { action: 'getUserStats' },
 *   headers: { 'Content-Type': 'application/json' }, // как раньше — и на GET
 * });
 * if (res.error?.code === 'no_token') return null;
 * if (!res.ok) return null; // res.status, res.json?.error
 * return res.json.data;
 */
import { API_BASE } from '@/config/apiBase';
import { API_TIMEOUT_MS, fetchWithTimeout } from '@/utils/fetchWithTimeout';
import { getAccessToken } from '@/services/auth/session';

/**
 * - `required` — без токена запрос не делается, ответ `{ ok: false, status: 0, error.code: 'no_token' }`;
 * - `optional` — токен подставляется, если есть; без него — запрос без `Authorization`;
 * - `none` — токен не читается вовсе (getAccessToken не вызывается).
 */
export type ApiAuth = 'required' | 'optional' | 'none';

/**
 * - `no_token` — auth 'required', а сессии нет; запроса не было (status 0);
 * - `network` — fetch упал (нет сети, DNS, обрыв) (status 0);
 * - `timeout` — сработал таймаут клиента (status 0);
 * - `aborted` — запрос отменён внешним `signal` (status 0);
 * - `http` — сервер ответил не 2xx (status — код ответа, body — разобранное тело).
 */
export type ApiErrorCode = 'no_token' | 'network' | 'timeout' | 'aborted' | 'http';

/** Единая ошибка запроса к API. Клиент её не бросает — кладёт в `ApiResponse.error`. */
export class ApiError extends Error {
  /** HTTP-код; 0 — ответа не было (no_token/network/timeout/aborted) */
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Разобранное тело ответа (для 'http') */
  readonly body?: unknown;
  /** Исходное исключение fetch (для network/timeout/aborted) — его можно пробросить как есть */
  readonly original?: unknown;

  constructor(code: ApiErrorCode, status: number, body?: unknown, original?: unknown) {
    super(
      code === 'http'
        ? `HTTP ${status}`
        : original instanceof Error && original.message
          ? original.message
          : code
    );
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.body = body;
    this.original = original;
  }
}

export type ApiQueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  /** По умолчанию 'GET' */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /**
   * Query-параметры. Объект: ключи в порядке передачи, `undefined`/`null` пропускаются,
   * остальное — `String(value)`. Нужна иная фильтрация (например, пропуск '') или точное
   * повторение `new URLSearchParams({...})` — передайте готовый `URLSearchParams`, он берётся
   * как есть. Пустой query — URL без `?`.
   */
  query?: Record<string, ApiQueryValue> | URLSearchParams;
  /**
   * Тело — `JSON.stringify(body)`; `undefined`/`null` — без тела. Когда тело есть, клиент
   * ставит `Content-Type: application/json`.
   */
  body?: unknown;
  /**
   * Свои заголовки. Итоговый набор: `Content-Type` (если есть тело) → `headers` →
   * `Authorization` (если есть токен). Чтобы повторить старый код, славший `Content-Type` и на
   * GET, передайте его здесь.
   */
  headers?: Record<string, string>;
  /** По умолчанию 'required' */
  auth?: ApiAuth;
  /**
   * Таймаут, мс. По умолчанию `API_TIMEOUT_MS` (fetchWithTimeout). `false` — без таймаута,
   * голый `fetch` (как сейчас в push-модулях и pushPrompt).
   */
  timeoutMs?: number | false;
  /** Внешняя отмена (кнопка «Отменить») → `error.code: 'aborted'` */
  signal?: AbortSignal;
  /**
   * База URL вместо `API_BASE`, например `'/api'` для web-push (относительный путь, текущий
   * origin). Абсолютный `endpoint` (http/https) берётся как есть, без базы.
   */
  baseUrl?: string;
  /** Сколько раз повторить GET при сетевой ошибке. По умолчанию 0 — повторов нет */
  retry?: number;
  /**
   * 'json' (по умолчанию) — безопасный разбор: невалидный/пустой JSON → `{}`, как
   * `resp.json().catch(() => ({}))` в сервисах. 'none' — тело не читается (`json: undefined`),
   * его читает вызывающий из `response` — для мест, где невалидный JSON должен бросать
   * (`await resp.json()` без catch: AiImport, diamondStore, pushPrompt).
   */
  parse?: 'json' | 'none';
}

type NoResponse = { ok: false; status: 0; json: null; response: null; error: ApiError };

/**
 * Итог запроса. Ветки:
 * - `ok: true` — 2xx; `json` — разобранное тело;
 * - `ok: false`, `response` есть — HTTP-ошибка (`error.code: 'http'`), `json` — тело ошибки
 *   (`{}`, если не JSON) — сервис берёт оттуда `error`, `reason` и т.п.;
 * - `ok: false`, `response: null`, `status: 0` — ответа не было: no_token/network/timeout/aborted.
 */
export type ApiResponse<T = any> =
  | { ok: true; status: number; json: T; response: Response; error: null }
  | { ok: false; status: number; json: any; response: Response; error: ApiError }
  | NoResponse;

/** Собрать URL: база + endpoint + query (экспорт — для тестов и редких мест с голым URL) */
export function buildApiUrl(
  endpoint: string,
  query?: ApiRequestOptions['query'],
  baseUrl: string = API_BASE
): string {
  const url = /^https?:\/\//.test(endpoint)
    ? endpoint
    : `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
  let qs = '';
  if (query instanceof URLSearchParams) {
    qs = query.toString();
  } else if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    qs = params.toString();
  }
  if (!qs) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

function classifyFetchError(error: unknown, signal?: AbortSignal): ApiErrorCode {
  if (signal?.aborted) return 'aborted';
  // Другого источника abort, кроме таймаута fetchWithTimeout, у клиента нет
  if ((error as { name?: string } | null)?.name === 'AbortError') return 'timeout';
  return 'network';
}

/**
 * Запрос к API. Не бросает на ошибках запроса — см. шапку файла и {@link ApiResponse}.
 *
 * @param endpoint путь от `API_BASE` без слеша: `'data'`, `'teacher'`, `'push'`; или абсолютный URL
 */
export async function apiFetch(
  endpoint: string,
  options: ApiRequestOptions & { parse: 'none' }
): Promise<ApiResponse<undefined>>;
export async function apiFetch<T = any>(
  endpoint: string,
  options?: ApiRequestOptions
): Promise<ApiResponse<T>>;
export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T | undefined>> {
  const {
    method = 'GET',
    query,
    body,
    headers: extraHeaders,
    auth = 'required',
    timeoutMs = API_TIMEOUT_MS,
    signal,
    baseUrl,
    retry = 0,
    parse = 'json',
  } = options;

  // Исключение getAccessToken не ловим — как прямой вызов вне try в сервисах
  const token = auth === 'none' ? null : await getAccessToken();
  if (auth === 'required' && !token) {
    return { ok: false, status: 0, json: null, response: null, error: new ApiError('no_token', 0) };
  }

  const hasBody = body !== undefined && body !== null;
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(extraHeaders || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const init: RequestInit = {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  };
  if (signal) init.signal = signal;

  const url = buildApiUrl(endpoint, query, baseUrl);
  const attempts = 1 + (method === 'GET' ? Math.max(0, Math.floor(retry)) : 0);

  let response: Response | null = null;
  let lastError: ApiError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      response =
        timeoutMs === false ? await fetch(url, init) : await fetchWithTimeout(url, init, timeoutMs);
      break;
    } catch (error) {
      lastError = new ApiError(classifyFetchError(error, signal), 0, undefined, error);
      if (lastError.code !== 'network') break;
    }
  }
  if (!response) {
    return { ok: false, status: 0, json: null, response: null, error: lastError as ApiError };
  }

  const json = parse === 'none' ? undefined : await response.json().catch(() => ({}));
  if (response.ok) {
    return { ok: true, status: response.status, json: json as T, response, error: null };
  }
  return {
    ok: false,
    status: response.status,
    json,
    response,
    error: new ApiError('http', response.status, json),
  };
}
