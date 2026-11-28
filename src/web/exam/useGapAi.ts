import { useCallback, useEffect, useRef, useState } from 'react';
import { WebApiError } from '../api';
import { ExamData } from '../data/exam';
import { describeSmartError } from './smartLogic';

export type GapAiState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; written: number; fallback: number }
  | { status: 'error'; message: string };

/**
 * ИИ дописывает «вставь слово» (решение пользователя 28.11.2026). Запускается сам, если в черновике
 * есть заготовки: после сборки, после перезагрузки страницы, после замены такого слова. Результат
 * сохраняется на сервере — повтор только дописывает оставшееся.
 */
export function useGapAi(sessionId: string, pending: number, onChanged: () => void) {
  const [state, setState] = useState<GapAiState>({ status: 'idle' });
  const running = useRef(false);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const run = useCallback(
    async (fallback = false) => {
      if (running.current) return;
      running.current = true;
      setState({ status: 'running' });
      try {
        const r = await ExamData.gapAi(sessionId, fallback);
        setState({ status: 'done', written: r.written, fallback: r.fallback });
        changed.current();
      } catch (e) {
        const err = e instanceof WebApiError ? e : null;
        setState({
          status: 'error',
          message: describeSmartError(err?.status ?? 0, err?.serverError),
        });
      } finally {
        running.current = false;
      }
    },
    [sessionId]
  );

  // Есть заготовки — запускаем сами (один раз на появление заготовок; при ошибке ждём кнопку)
  useEffect(() => {
    if (pending > 0 && state.status !== 'running' && state.status !== 'error') void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return { state, retry: () => run(false), withoutAi: () => run(true) };
}
