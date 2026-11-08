/**
 * Сессия набора «Изучить» (plan/new/study_session.md): план по текущим данным и запуск.
 * Чистые правила — в LessonService (buildSetSessionPlan) и lessonFlow (этапы); здесь только
 * чтение хранилищ и навигация. Используют шторка набора и итоги сессии.
 */
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCardsStore, useSetsStore, useSettingsStore } from '@/store';
import { useLessonStore } from '@/store/lessonStore';
import { localDay } from '@/store/challengeStore';
import {
  buildSetSessionPlan,
  countWaitingReview,
  ensureLessonDay,
  type SetSessionPlan,
} from '@/services/LessonService';
import { firstSessionStep } from '@/services/lessonFlow';
import { isCardWaitingReview } from '@/services/SRSService';
import { Analytics } from '@/services/analytics';
import type { RootStackParamList } from '@/types/navigation';
import type { Card } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SetSessionInfo {
  plan: SetSessionPlan;
  /** Сколько слов набора придёт на повторение в ближайшие сутки — «завтра N слов на повторение» */
  tomorrowCount: number;
}

function setCards(setId: string): Card[] {
  const { cards, cardsBySet } = useCardsStore.getState();
  return (cardsBySet[setId] || []).map((id) => cards[id]).filter((c): c is Card => !!c);
}

/** План сессии набора по данным на сейчас; null — набора нет */
export function currentSetSessionPlan(
  setId: string,
  now: number = Date.now()
): SetSessionInfo | null {
  const set = useSetsStore.getState().getSet(setId);
  if (!set) return null;
  const cards = setCards(setId);
  const { cards: cardsMap, cardsBySet } = useCardsStore.getState();
  const sets = Object.values(useSetsStore.getState().sets);
  // День урока общий с главной; до первого открытия главной за день — считаем, что день начинается сейчас
  const stored = useLessonStore.getState().day;
  const today = localDay();
  const day =
    stored?.date === today
      ? stored
      : ensureLessonDay(stored, today, countWaitingReview(sets, cardsBySet, cardsMap, now));
  const plan = buildSetSessionPlan({
    set,
    cards,
    newPerDay: useSettingsStore.getState().settings.lessonNewPerDay,
    day,
    now,
  });
  const tomorrowCount = cards.filter(
    (c) =>
      (c.learningStep || 0) >= 1 && !isCardWaitingReview(c, now) && c.nextReviewDate <= now + DAY_MS
  ).length;
  return { plan, tomorrowCount };
}

/**
 * Запустить сессию по плану: push — из набора (этап поверх него), replace — с итогов прошлой сессии.
 * false — запускать нечего (пустой набор, ни одному этапу слова не подошли).
 */
export function startSetSession(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  setId: string,
  plan: SetSessionPlan,
  how: 'push' | 'replace' = 'push'
): boolean {
  if (plan.cardIds.length === 0) return false;
  const { cards } = useCardsStore.getState();
  const words = plan.cardIds.map((id) => cards[id]).filter((c): c is Card => !!c);
  const xpBase = useSettingsStore.getState().todayStats.cardsStudied;
  const step = firstSessionStep(setId, plan.stages, words, Date.now(), xpBase);
  if (!step) return false;
  const stages = step.params.session?.stages ?? [];
  Analytics.setSessionStarted({
    mode: plan.mode,
    words: words.length,
    newCount: plan.newCount,
    stages: stages.map((s) => s.stage),
    dropped: plan.stages.length - stages.length,
    minutes: plan.minutes,
    from: how === 'replace' ? 'results' : 'sheet',
  });
  if (how === 'replace') navigation.replace(step.screen, step.params);
  else navigation.push(step.screen, step.params);
  return true;
}
