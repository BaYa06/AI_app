/**
 * Тексты шторки набора для кнопки сессии «Изучить» (plan/new/study_session.md, решения 4, 5, 15).
 * Одни и те же для RN-шторки (StudyModeSheet.tsx) и нативной iOS (StudyModeSheet.swift):
 * Swift ничего не считает, только показывает.
 */
import { pluralize } from '@/utils';
import { buildSessionStages } from '@/services/lessonFlow';
import type { SetSessionPlan } from '@/services/LessonService';
import type { SessionStage } from '@/types/navigation';
import type { Card } from '@/types';
import { SESSION_STAGE_INFO } from './StageLayout';

const words = (n: number) => `${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;
const minutes = (n: number) => `${n} ${pluralize(n, 'минута', 'минуты', 'минут')}`;

export type SessionSheetText =
  | { kind: 'button'; title: string; caption: string; route: string; stageCount: number }
  | { kind: 'empty'; title: string; text: string };

/** «40 слов · изучали 15» под названием набора */
export function sessionSheetMeta(plan: SetSessionPlan): string {
  if (plan.totalCount === 0) return 'Пока нет слов';
  const studied = plan.studiedCount > 0 ? `изучали ${plan.studiedCount}` : 'ещё не начинали';
  return `${words(plan.totalCount)} · ${studied}`;
}

/** Этапы после отбора слов: слово без примера не попадёт в «Слово в контексте» и т.п. */
export function sessionSheetStages(plan: SetSessionPlan, cardsMap: Record<string, Card | undefined>): SessionStage[] {
  const cards = plan.cardIds.map((id) => cardsMap[id]).filter((c): c is Card => !!c);
  return buildSessionStages(plan.stages, cards).map((s) => s.stage);
}

export function sessionSheetText(plan: SetSessionPlan, stages: SessionStage[]): SessionSheetText {
  if (plan.mode === 'empty') {
    return { kind: 'empty', title: 'В наборе пока нет слов', text: 'Добавьте хотя бы 4 слова, и приложение соберёт первую сессию.' };
  }
  if (plan.mode === 'tooFew') {
    return {
      kind: 'empty',
      title: `Добавьте ещё ${words(plan.missingCards)}`,
      text: 'Для теста нужно хотя бы 4 слова: иначе не из чего выбирать ответ.',
    };
  }

  const n = plan.cardIds.length;
  const time = `около ${minutes(plan.minutes)}`;
  let title: string;
  let caption: string;
  switch (plan.mode) {
    case 'review':
      title = `Повторить ${words(n)}`;
      caption = `Пора повторить · ${time}`;
      break;
    case 'more':
      title = `Изучить ещё ${n}`;
      caption = 'План на сегодня выполнен · по желанию';
      break;
    case 'again':
      title = 'Повторить набор';
      caption = 'Тренировка · уровень слов не растёт';
      break;
    default: {
      const what =
        plan.newCount < n
          ? `${plan.newCount} ${pluralize(plan.newCount, 'новое', 'новых', 'новых')} + ${n - plan.newCount} на закрепление`
          : words(n);
      title = 'Изучить';
      caption = `${what} · ${time}`;
    }
  }
  const route =
    stages.length > 3
      ? `${stages.length} ${pluralize(stages.length, 'этап', 'этапа', 'этапов')} · начнём с ${stages[0] === 'cards' ? 'Карточек' : SESSION_STAGE_INFO[stages[0]].title}`
      : stages.map((s) => SESSION_STAGE_INFO[s].title).join(' → ');
  return { kind: 'button', title, caption, route, stageCount: stages.length };
}
