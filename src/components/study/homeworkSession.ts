/**
 * Сессия по словам задания учителя (plan/new/teacher_cabinet.md, Teacher 26–27).
 * План — buildHomeworkSessionPlan (без дневного лимита новых, решение 1), этапы — как у сессии
 * набора («Изучить» / «Повторить»). Законченная сессия засчитывает слова сама (StudyResults →
 * homeworkStore.reportSession), отдельной логики сдачи здесь нет.
 */
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCardsStore, useSetsStore, useSettingsStore } from '@/store';
import { buildHomeworkSessionPlan, type StudentHomework } from '@/services/homework';
import { sessionStagesFor } from '@/services/LessonService';
import { firstSessionStep } from '@/services/lessonFlow';
import { Analytics } from '@/services/analytics';
import type { RootStackParamList } from '@/types/navigation';
import type { Card } from '@/types';

/** Запустить сессию по заданию. false — запускать нечего (всё засчитано, слов нет на устройстве). */
export function startHomeworkSession(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  hw: StudentHomework,
  prefer?: 'learn' | 'review'
): boolean {
  const { cards } = useCardsStore.getState();
  const plan = buildHomeworkSessionPlan(hw, cards, { prefer });
  const words = plan.cardIds.map((id) => cards[id]).filter((c): c is Card => !!c);
  if (words.length === 0) return false;
  const setId = words[0].setId;
  const set = useSetsStore.getState().getSet(setId);
  const xpBase = useSettingsStore.getState().todayStats.cardsStudied;
  const step = firstSessionStep(setId, sessionStagesFor(set, plan.kind), words, Date.now(), xpBase);
  if (!step) return false;
  Analytics.setSessionStarted({
    mode: plan.kind,
    words: words.length,
    newCount: plan.kind === 'learn' ? words.length : 0,
    stages: (step.params.session?.stages ?? []).map((s) => s.stage),
    dropped: 0,
    minutes: 0,
    from: 'homework',
  });
  navigation.push(step.screen, step.params);
  return true;
}
