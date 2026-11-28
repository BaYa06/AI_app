import { useEffect } from 'react';

/**
 * Пока идёт долгое действие (сборка экзамена, запрос к ИИ), закрытие или обновление вкладки
 * спрашивает подтверждение (Web 27). Браузер сам решает, какой текст показать.
 */
export function useUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
