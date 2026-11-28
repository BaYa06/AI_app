import { useCallback, useEffect, useRef, useState } from 'react';
import { WebApiError, handleUnauthorized } from './api';

export type LoadState<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
};

/**
 * Загрузка данных экрана. `refreshMs` — опрос (монитор экзамена): идёт только пока вкладка
 * видна и стоит, пока она скрыта. Ошибка опроса не стирает уже загруженные данные.
 * 401 — выходим из аккаунта (экран входа вернёт на это же место).
 * Данные учеников в localStorage не кэшируем: компьютер может быть общим.
 */
export function useLoad<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  opts: { refreshMs?: number; skip?: boolean } = {}
): LoadState<T> {
  const { refreshMs, skip } = opts;
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null,
    error: null,
    loading: !skip,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const load = useCallback(async (initial: boolean) => {
    const id = ++seq.current;
    if (initial) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (error instanceof WebApiError && error.kind === 'unauthorized') {
        void handleUnauthorized();
      }
      if (id === seq.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (skip) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, ...deps]);

  useEffect(() => {
    if (skip || !refreshMs) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => void load(false), refreshMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load(false); // сразу свежие данные при возврате на вкладку
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [skip, refreshMs, load]);

  const reload = useCallback(() => void load(true), [load]);
  return { ...state, reload };
}
