/**
 * Тексты урока дня для главной (plan/home_redesign.md, шаги 1.4 и 2.3)
 * @description Состав («10 повторить + 10 новых»), время и подпись-причина по плану урока.
 */
import { pluralize } from '@/utils';
import type { LessonPlan } from '@/services/LessonService';

/** Есть что запустить кнопкой урока */
export function isLessonStartable(plan: LessonPlan): boolean {
  return plan.reviewIds.length + plan.newIds.length + plan.mistakeIds.length > 0;
}

/** «10 повторить + 10 новых», «30 повторить», «10 новых слов» */
export function lessonComposition(plan: Pick<LessonPlan, 'reviewIds' | 'newIds'>): string {
  const r = plan.reviewIds.length;
  const n = plan.newIds.length;
  if (r > 0 && n > 0) return `${r} повторить + ${n} ${pluralize(n, 'новое', 'новых', 'новых')}`;
  if (r > 0) return `${r} повторить`;
  return `${n} ${pluralize(n, 'новое слово', 'новых слова', 'новых слов')}`;
}

/** Главная строка кнопки: «Урок дня · 10 повторить + 10 новых · ~6 мин» */
export function lessonTitle(plan: LessonPlan): string {
  if (plan.state === 'mistakes') {
    const n = plan.mistakeIds.length;
    return `Исправь ошибки · ${n} ${pluralize(n, 'слово', 'слова', 'слов')} · ~${plan.minutes} мин`;
  }
  return `Урок дня · ${lessonComposition(plan)} · ~${plan.minutes} мин`;
}

/** Подпись под кнопкой — одна-две причины начать; null — подписи нет */
export function lessonHint(plan: LessonPlan): string | null {
  const parts: string[] = [];
  if (plan.fadingCount > 0) parts.push(`${plan.fadingCount} начинают забываться`);
  if (plan.state === 'overdue') {
    parts.push('Новые слова вернутся завтра');
  } else if (plan.newIds.length > 0 && plan.focusSetTitle) {
    parts.push(
      plan.state === 'first'
        ? `Начинаем с «${plan.focusSetTitle}»`
        : `${plan.focusSetTitle} · ${plan.focusSetSeen} из ${plan.focusSetTotal}`,
    );
  }
  const left = plan.waitingTotal - plan.reviewIds.length;
  if (plan.state !== 'mistakes' && left > 0 && plan.reviewIds.length > 0) parts.push(`ещё ждут ${left}`);
  return parts.length > 0 ? parts.slice(0, 2).join(' · ') : null;
}
