/**
 * Контроль выхода из приложения во время живого теста (plan/done/exam_lockdown.md, Exam 2).
 *
 * Запретить выход на iOS нельзя, поэтому хук только сообщает серверу:
 * - `away` — приложение ушло в фон (или открыто рядом с другим в iPad Split View);
 * - `back` — вернулось. Сколько ученик отсутствовал, считает сервер: до 3 с прощается,
 *   дольше — попытка завершена, и хук вызывает onLeft с итогом.
 *
 * `inactive` (Пункт управления, шторка уведомлений, начатый и отменённый жест «домой») выходом
 * не считается — только `background`. На вебе react-native-web переводит AppState в
 * `background` по document.visibilitychange, отдельный код не нужен.
 *
 * Если `back` не дошёл (нет сети), сервер всё равно не даст ответить: get-question/answer
 * вернут 409 после льготы — это обрабатывает сам экран теста.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Platform, useWindowDimensions, type AppStateStatus } from 'react-native';
import { supabase } from '@/services/supabaseClient';
import { API_BASE } from '@/config/apiBase';

export type ExamLeftReason = 'manual' | 'background' | 'relaunch';

/** Итог досрочно завершённой попытки — так его отдаёт сервер (attemptSummary в api/test.js). */
export type ExamAttemptSummary = {
  left: boolean;
  leftReason: ExamLeftReason | null;
  answered: number;
  correct: number;
  total: number;
  score: number;
};

/** Окно уже экрана — значит рядом открыто другое приложение (iPad Split View, Android). */
const SPLIT_WIDTH_RATIO = 0.8;

/** Сколько ждать уже отправленный `away`, прежде чем слать `back` (иначе `back` может прийти первым). */
const AWAY_WAIT_MS = 3000;

async function postExam(action: string, body: Record<string, unknown>) {
  const { data: authData } = await supabase.auth.getSession();
  const token = authData.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE}/test?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

/** Ученик сам завершил тест (кнопка «Завершить»). */
export function leaveExam(participantId: string): Promise<ExamAttemptSummary> {
  return postExam('leave', { participantId });
}

function useSplitView(enabled: boolean) {
  const window = useWindowDimensions();
  // На вебе окно браузера почти всегда уже экрана — там это не признак Split View.
  if (!enabled || Platform.OS === 'web') return false;
  return window.width < Dimensions.get('screen').width * SPLIT_WIDTH_RATIO;
}

type Options = {
  participantId: string;
  /** Контроль выхода включён учителем для этого теста */
  enabled: boolean;
  /** Попытка завершена из-за выхода — показать итог */
  onLeft: (summary: ExamAttemptSummary) => void;
};

/**
 * Возвращает `splitView: true`, пока приложение открыто рядом с другим, — экран теста прячет
 * вопрос и просит развернуть приложение; `checking` — пока сервер решает, продолжать ли.
 */
export function useExamExitGuard({ participantId, enabled, onLeft }: Options) {
  const splitView = useSplitView(enabled);
  const [checking, setChecking] = useState(false);

  const awayRef = useRef<Promise<unknown> | null>(null);
  const splitRef = useRef(splitView);
  splitRef.current = splitView;
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;

  const goAway = useCallback((reason: 'background' | 'split') => {
    if (awayRef.current) return;
    // Ответ не нужен; ошибку глотаем — тогда `back` сам засчитает выход.
    awayRef.current = postExam('away', { participantId, reason }).catch(() => {});
  }, [participantId]);

  const comeBack = useCallback(async () => {
    const pendingAway = awayRef.current;
    if (!pendingAway) return;
    awayRef.current = null;
    setChecking(true);
    try {
      await Promise.race([pendingAway, new Promise((r) => setTimeout(r, AWAY_WAIT_MS))]);
      const result = await postExam('back', { participantId });
      if (result.continue === false) {
        onLeftRef.current(result as ExamAttemptSummary);
        return;
      }
      // Вернулся из фона, но приложение всё ещё рядом с другим — снова «ушёл».
      if (splitRef.current) goAway('split');
    } catch (e) {
      // Нет сети — сервер не даст ответить после льготы (409 в get-question/answer).
      console.warn('exam back failed:', e);
    } finally {
      setChecking(false);
    }
  }, [participantId, goAway]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') goAway('background');
      else if (next === 'active') comeBack();
    });
    return () => sub.remove();
  }, [enabled, goAway, comeBack]);

  // Split View — тот же уход/возврат, только по ширине окна.
  useEffect(() => {
    if (!enabled) return;
    if (splitView) goAway('split');
    else comeBack();
  }, [enabled, splitView, goAway, comeBack]);

  return { splitView, checking };
}
