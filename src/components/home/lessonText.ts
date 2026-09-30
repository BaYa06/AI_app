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

/** Что показывает главная карточка урока (LessonCard) */
export interface LessonCardContent {
  /** Спокойный вид (без заливки, контурная кнопка) — главное на сегодня сделано */
  calm: boolean;
  overline: string;
  title: string;
  /** Состав и время: «10 повторить + 10 новых · ~6 мин» */
  meta: string | null;
  /** Одна-две причины начать или что будет завтра */
  hint: string | null;
  action: string;
  /** Что делает кнопка */
  kind: 'start' | 'extraNew' | 'findSet';
  /** Прогресс дня для кольца; null — кольцо не показываем */
  progress: { done: number; total: number } | null;
}

/** С какого часа вечером предупреждаем о серии */
const STREAK_RISK_FROM_HOUR = 19;
/** Какую серию стоит спасать: 1–2 дня терять не так обидно, а напоминание каждый вечер надоедает */
const STREAK_RISK_MIN_DAYS = 3;

/**
 * Серия под угрозой: вечер, цель дня ещё не выполнена, серия ≥ 3 дней.
 * Возвращает, сколько целых часов осталось до полуночи (0 — меньше часа); null — не под угрозой.
 */
export function streakRiskHoursLeft(now: Date, streakDays: number, goalReached: boolean): number | null {
  if (goalReached || streakDays < STREAK_RISK_MIN_DAYS || now.getHours() < STREAK_RISK_FROM_HOUR) return null;
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / (60 * 60 * 1000));
}

/**
 * Содержимое карточки по плану урока (plan/home_redesign.md, таблица шага 2.3).
 * null — карточку не показываем (нет ни одной карточки: главная показывает своё пустое состояние).
 */
export function lessonCardContent(
  plan: LessonPlan,
  opts: {
    streakDays: number;
    extraNewStep: number;
    /** streakRiskHoursLeft: число — вечером серия под угрозой, заголовок про серию */
    streakRiskHours?: number | null;
  },
): LessonCardContent | null {
  const queued = plan.reviewIds.length + plan.newIds.length + plan.mistakeIds.length;
  const progress = queued > 0 ? { done: plan.doneToday, total: plan.doneToday + queued } : null;
  const time = `~${plan.minutes} мин`;
  const tomorrow =
    plan.tomorrowCount > 0
      ? `Завтра ${plan.tomorrowCount} ${pluralize(plan.tomorrowCount, 'слово', 'слова', 'слов')}`
      : null;

  switch (plan.state) {
    case 'empty':
      return null;
    case 'mistakes': {
      const n = plan.mistakeIds.length;
      return {
        calm: false,
        overline: 'Почти готово',
        title: 'Исправь ошибки',
        meta: `${n} ${pluralize(n, 'слово', 'слова', 'слов')} · ${time}`,
        hint: null,
        action: 'Повторить',
        kind: 'start',
        progress,
      };
    }
    case 'done':
      return {
        calm: true,
        overline: 'Урок дня пройден',
        title: 'Готово на сегодня',
        meta: opts.streakDays > 0 ? `Серия ${opts.streakDays} ${pluralize(opts.streakDays, 'день', 'дня', 'дней')}` : null,
        hint: tomorrow,
        action: `Ещё ${opts.extraNewStep} новых`,
        kind: 'extraNew',
        progress: null,
      };
    case 'finished':
      return {
        calm: true,
        overline: 'Урок дня пройден',
        title: 'Все слова пройдены',
        meta: 'Дальше только повторение',
        hint: tomorrow,
        action: 'Найти новый набор',
        kind: 'findSet',
        progress: null,
      };
    default: {
      const risk = opts.streakRiskHours;
      if (risk != null) {
        // Тот же урок, другой повод: место, цвет и кнопка те же — меняются заголовок и подпись
        return {
          calm: false,
          overline: 'Серия под угрозой',
          title: `Сохрани серию: ${opts.streakDays} ${pluralize(opts.streakDays, 'день', 'дня', 'дней')}`,
          meta: `${lessonComposition(plan)} · ${time}`,
          hint: risk > 0 ? `До полуночи ${risk} ч` : 'До полуночи меньше часа',
          action: 'Начать',
          kind: 'start',
          progress,
        };
      }
      return {
        calm: false,
        overline: plan.state === 'first' ? 'День 1' : plan.state === 'overdue' ? 'Накопилось повторение' : 'Сегодня',
        title: 'Урок дня',
        meta: `${lessonComposition(plan)} · ${time}`,
        hint: lessonHint(plan),
        action: 'Начать',
        kind: 'start',
        progress,
      };
    }
  }
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
