/**
 * Когда показать «Заморозка спасла серию» на главной (plan/new/streak_freeze_display.md, Freeze 4).
 * Ждёт, пока главная в фокусе и свободна, а очередь окон пуста: никого не вытесняет — закрыть одно
 * окно и открыть другое в одном кадре на iOS 26 роняет приложение (коммит a12afa6).
 */
import { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { isGateBusy, isLaunchInterrupted, setGateOpen, subscribeGate } from '@/services/modalGate';
import {
  isFreezeNoticeSeen,
  markFreezeNoticeSeen,
  type FreezeNotice,
} from '@/services/freezeNotice';
import { Analytics } from '@/services/analytics';

/** Чуть позже «Что нового» (1 с): если оно решило показаться, заморозка подождёт его */
const SHOW_DELAY_MS = 1500;

export function useFreezeNoticeOnHome({
  candidate,
  blocked,
}: {
  candidate: FreezeNotice | null;
  /** На главной открыто своё окно (поиск, меню, окно серии) */
  blocked: boolean;
}) {
  const isFocused = useIsFocused();
  const [shown, setShown] = useState<FreezeNotice | null>(null);
  const [visible, setVisible] = useState(false);
  const [gateTick, setGateTick] = useState(0);

  useEffect(() => subscribeGate(() => setGateTick((t) => t + 1)), []);

  useEffect(() => {
    if (!candidate || visible || !isFocused || blocked) return;
    // Уже показано (в этом запуске или раньше) — кандидат остаётся тем же, пока неделя не обновится
    if (isFreezeNoticeSeen(candidate.date)) return;
    if (isLaunchInterrupted() || isGateBusy('freezeNotice')) return;
    const timer = setTimeout(() => {
      if (isLaunchInterrupted() || isGateBusy('freezeNotice')) return;
      // Очередь занимаем сразу, до отрисовки: «Что нового» в том же кадре уже не откроется
      setGateOpen('freezeNotice', true);
      markFreezeNoticeSeen(candidate.date);
      Analytics.freezeNoticeShown({ streak: candidate.streak, freezesLeft: candidate.freezesLeft });
      setShown(candidate);
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [candidate, visible, isFocused, blocked, gateTick]);

  useEffect(() => {
    setGateOpen('freezeNotice', visible);
  }, [visible]);
  useEffect(() => () => setGateOpen('freezeNotice', false), []);

  const onClose = useCallback(() => setVisible(false), []);
  return { notice: shown, visible, onClose };
}
