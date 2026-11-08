/** События: Ошибки и технические события (Clean 9 — из Analytics без изменений). */
import { log } from './core';

export const errorsEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ОШИБКИ И ТЕХНИЧЕСКИЕ СОБЫТИЯ
  // Зачем: видим user-facing ошибки до того как они попадут в отзывы.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Произошла ошибка синхронизации с сервером.
   */
  syncError: (errorCode: string) => log('sync_error', { error_code: errorCode }),

  /**
   * Юзер увидел экран ошибки (error boundary).
   */
  errorBoundaryTriggered: (screen: string) => log('error_boundary_triggered', { screen }),
};
