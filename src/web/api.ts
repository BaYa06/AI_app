/**
 * Обёртка над запросами к серверу для веб-кабинета (plan/new/web_cabinet.md, Web 4).
 * Единый вид ошибки и понятные тексты; без повторов у POST (повтор опасен).
 */
export type ApiErrorKind =
  | 'unauthorized' // 401 — сессия кончилась
  | 'forbidden' // 403 — не твой курс
  | 'not_found' // 404
  | 'update_required' // 426 — у учеников старая версия приложения
  | 'rate_limited' // 429
  | 'server' // 5xx
  | 'network' // нет связи
  | 'unknown';

export class WebApiError extends Error {
  kind: ApiErrorKind;
  status: number;
  constructor(kind: ApiErrorKind, status = 0) {
    super(kind);
    this.name = 'WebApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function classifyStatus(status: number): ApiErrorKind {
  if (status === 0) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 426) return 'update_required';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Текст для человека: на «ты», без технических слов */
export function describeApiError(error: unknown): string {
  const kind = error instanceof WebApiError ? error.kind : 'unknown';
  switch (kind) {
    case 'unauthorized':
      return 'Сессия закончилась. Войди снова.';
    case 'forbidden':
      return 'Это не твой курс.';
    case 'not_found':
      return 'Здесь ничего не нашлось.';
    case 'update_required':
      return 'Ученикам нужно обновить Flashly.';
    case 'rate_limited':
      return 'Слишком много запросов. Подожди минуту и попробуй снова.';
    case 'server':
      return 'Сервер не отвечает. Попробуй через минуту.';
    case 'network':
      return 'Нет связи. Проверь интернет.';
    default:
      return 'Что-то пошло не так. Попробуй ещё раз.';
  }
}

/** Результат вида { ok, status, data } (как у ExamApi) → данные или WebApiError */
export function unwrap<T>(result: { ok: boolean; status: number; data: T }): T {
  if (result.ok) return result.data;
  throw new WebApiError(classifyStatus(result.status), result.status);
}

/** Сессия кончилась: выходим, экран входа вернёт на то же место (returnTo) */
export async function handleUnauthorized(): Promise<void> {
  try {
    // Лениво: чистые функции выше проверяются тестами без Supabase
    const { supabase } = await import('@/services/supabaseClient');
    await supabase.auth.signOut();
  } catch {
    // уже вышли
  }
}
