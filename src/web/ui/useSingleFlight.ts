import { useCallback, useRef } from 'react';

/**
 * Защита от двойного нажатия (Web 27): пока действие выполняется, повторный вызов игнорируется.
 * Состояние `busy` в React обновляется после кадра, а второй клик приходит раньше — поэтому ref.
 * Важно для действий, которые создают что-то на сервере (сборка экзамена, открытие, старт).
 */
export function useSingleFlight() {
  const running = useRef(false);
  return useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    try {
      return await fn();
    } finally {
      running.current = false;
    }
  }, []);
}
