/**
 * fetch с ограничением по времени. Без него зависший запрос (сеть, долгий ответ сервера) держал
 * приложение на экране загрузки бесконечно. По таймауту — AbortError, как при обрыве сети.
 */
export const API_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Внешний сигнал (кнопка «Отменить») тоже обрывает запрос
  const external = init.signal;
  const onExternalAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener('abort', onExternalAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}
