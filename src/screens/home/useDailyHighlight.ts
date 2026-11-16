/**
 * «Новое» на главной (plan/new/new_user_activation.md, Start 4.2): что подсветить сегодня,
 * показ и закрытие. Правила — в services/dailyHighlight.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  dismissHighlight,
  loadHighlightState,
  pickHighlight,
  saveHighlightState,
  type HighlightId,
} from '@/services/dailyHighlight';
import { isLockScreenWidgetAvailable } from '@/services/widgetPrompt';
import { Analytics } from '@/services/analytics';
import { useStartTasksStore } from '@/store';
import { localDay } from '@/store/challengeStore';

export function useDailyHighlight(enabled: boolean) {
  const [state, setState] = useState(loadHighlightState);
  const startedAt = useStartTasksStore((s) => s.startedAt);
  const done = useStartTasksStore((s) => s.done);

  // Итоги урока записали день — подхватываем, когда главная снова видна
  useFocusEffect(
    useCallback(() => {
      setState(loadHighlightState());
    }, [])
  );

  const picked = enabled
    ? pickHighlight(state, localDay(), {
        isNewStudent: !!startedAt,
        doneTasks: done,
        widgetAvailable: isLockScreenWidgetAvailable(),
      })
    : null;

  const shownId = picked?.id;
  useEffect(() => {
    if (picked) Analytics.newFeatureShown(picked.id, picked.day);
  }, [shownId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback((id: HighlightId, tapped: boolean) => {
    const next = dismissHighlight(loadHighlightState(), id);
    saveHighlightState(next);
    setState(next);
    if (tapped) Analytics.newFeatureTapped(id);
    else Analytics.newFeatureDismissed(id);
  }, []);

  return { highlight: picked, dismiss };
}
