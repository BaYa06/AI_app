/// <reference lib="dom" />
/**
 * Service Worker Recovery & ChunkLoadError protection
 *
 * Решает проблему чёрного экрана после redeploy на Vercel:
 * старый HTML/SW кэш → ссылки на несуществующие чанки → ChunkLoadError.
 *
 * Стратегия:
 * 1. При загрузке: слушаем controllerchange — если SW обновился, делаем reload один раз.
 * 2. Глобальный перехват ChunkLoadError → unregister SW, очистить кэши, reload.
 * 3. Защита от бесконечного цикла: localStorage флаг с TTL 5 минут.
 */

const RECOVERY_KEY = 'flashly_recovered_once';
const RECOVERY_TTL_MS = 5 * 60 * 1000; // 5 минут

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** Проверяем, не было ли recovery недавно (защита от цикла) */
function hasRecentRecovery(): boolean {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Date.now() - ts < RECOVERY_TTL_MS) return true;
    // TTL истёк — убираем флаг
    localStorage.removeItem(RECOVERY_KEY);
    return false;
  } catch {
    return false;
  }
}

/** Ставим флаг recovery */
function markRecovery(): void {
  try {
    localStorage.setItem(RECOVERY_KEY, String(Date.now()));
  } catch {
    // localStorage может быть недоступен в private mode — не критично
  }
}

/** Полная очистка: unregister SW + удалить все кэши */
async function nukeAndReload(): Promise<void> {
  console.warn('[Recovery] Starting nuke: unregister SWs + clear caches + reload');

  // 1) Unregister ALL service workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r: ServiceWorkerRegistration) => r.unregister()));
      console.warn('[Recovery] All SWs unregistered');
    } catch (e) {
      console.warn('[Recovery] SW unregister failed:', e);
    }
  }

  // 2) Clear ALL Cache Storage
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k: string) => caches.delete(k)));
      console.warn('[Recovery] All caches deleted');
    } catch (e) {
      console.warn('[Recovery] Cache delete failed:', e);
    }
  }

  // 3) Reload (без кэша, если браузер поддерживает)
  markRecovery();
  window.location.reload();
}

/** Проверяем, является ли ошибка ChunkLoadError */
function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as Error)?.message || String(error);
  return (
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    // Webpack specific
    msg.includes('Cannot find module') ||
    /loading .+ failed/i.test(msg)
  );
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Инициализировать recovery систему.
 * Вызывать ОДИН раз при загрузке приложения (в index.web.jsx).
 */
export function initSwRecovery(): void {
  // === 1. Слушаем обновление Service Worker (controllerchange) ===
  if ('serviceWorker' in navigator && navigator.serviceWorker) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Новый SW взял контроль — значит deploy обновил ресурсы.
      // Reload один раз, чтобы подхватить свежий HTML/чанки.
      if (refreshing) return;
      refreshing = true;
      console.log('[SW] Controller changed, reloading page...');
      window.location.reload();
    });
  }

  // === 2. Глобальный перехват ChunkLoadError ===
  // 2a. window.onerror — ловит synchronous throws
  const originalOnError = window.onerror;
  window.onerror = function (
    message: string | Event,
    _source?: string,
    _lineno?: number,
    _colno?: number,
    error?: Error,
  ) {
    if (isChunkLoadError(error) || isChunkLoadError(message)) {
      handleChunkLoadError(error || message);
      return true; // подавляем default error
    }
    if (typeof originalOnError === 'function') {
      return (originalOnError as OnErrorEventHandler)?.call(
        window, message, _source, _lineno, _colno, error,
      );
    }
    return false;
  };

  // 2b. unhandledrejection — ловит failed dynamic import()
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      handleChunkLoadError(event.reason);
    }
  });
}

/** Обработка ChunkLoadError с защитой от бесконечного цикла */
function handleChunkLoadError(error: unknown): void {
  console.error('[Recovery] ChunkLoadError detected:', error);
  if (hasRecentRecovery()) {
    console.error(
      '[Recovery] Already attempted recovery recently. Skipping to avoid loop. ' +
      'User needs to manually clear browser data.',
    );
    return;
  }
  nukeAndReload();
}
