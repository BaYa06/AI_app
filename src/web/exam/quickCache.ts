/**
 * Код и размер только что созданного быстрого теста — лобби показывает код сразу. После перезагрузки
 * страницы берём их из списка идущих тестов (api/test?action=active).
 */
export type QuickInfo = { code: string; questionCount: number };

const cache = new Map<string, QuickInfo>();

export function rememberQuick(sessionId: string, info: QuickInfo): void {
  cache.set(sessionId, info);
}

export function cachedQuick(sessionId: string): QuickInfo | null {
  return cache.get(sessionId) ?? null;
}
