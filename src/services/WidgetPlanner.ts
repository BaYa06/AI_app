/**
 * Виджет «Вспомни слово» на экране блокировки iPhone (plan/widgets.md, шаг 1.1)
 * @description Выбирает слова для виджета и заранее строит расписание на 72 часа: каждые 30 минут
 * 20 минут вопрос, 10 минут ответ. Чистые функции — без React и нативного кода. Виджет (Swift)
 * ничего не решает: он только показывает последнюю запись, время которой уже наступило.
 *
 * Правила (источник правды — таблица в плане):
 * - в пул до 8 слов: ошибся сегодня → выучил сегодня → повторял сегодня или вчера → «молодые» (шаг 2–4);
 * - не берём: ещё не встреченные (шаг 0), уверенно выученные (шаг 5+), слова длиннее 24 символов
 *   и слова, которые ждут повторения и сегодня ещё не повторялись (не подсказываем урок);
 * - паузы между показами одного слова: ≥ 1 ч перед вторым, ≥ 3 ч перед каждым следующим; первыми
 *   идут слова, которые показывали реже. Ни одно слово не готово — запись без слова (итог дня):
 *   показ того же слова подряд — зубрёжка, а не повторение с паузами;
 * - шаг 1 — «слово → перевод»; шаг 2+ — третий показ за день наоборот;
 * - тихие часы 23:00–07:00: одна запись с итогом дня, без смены слов.
 * Уровень слов (SRS) здесь не меняется: показ на виджете — не повторение.
 */
import type { Card } from '@/types';
import type { LessonDay, LessonPlan } from './LessonService';
import { estimateMinutes, LESSON_MAX_CARDS } from './LessonService';
import { isCardFading, isCardWaitingReview } from './SRSService';
import { streakRiskHoursLeft } from '@/components/home/lessonText';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const WIDGET_POOL_MAX = 8;
export const CYCLE_QUESTION_MIN = 20;
export const CYCLE_ANSWER_MIN = 10;
const CYCLE_MS = (CYCLE_QUESTION_MIN + CYCLE_ANSWER_MIN) * MINUTE;
export const WIDGET_HORIZON_MS = 72 * HOUR;
/** Слово длиннее — на экране блокировки обрежется, в пул не берём */
export const WIDGET_MAX_TEXT = 24;
export const QUIET_FROM_HOUR = 23;
export const QUIET_TO_HOUR = 7;
/** Паузы перед 2-м показом слова за день и перед каждым следующим */
const SHOW_GAPS_MS = [HOUR, 3 * HOUR];
/** Какой по счёту показ за день — «перевод → слово» (для слов с шага 2) */
const REVERSE_EVERY = 3;

export const WIDGET_SNAPSHOT_VERSION = 1;

export type WidgetState =
  | 'first' //   ни одно слово ещё не учили
  | 'waiting' // урок дня не сделан
  | 'streak' //  урок не сделан, вечер, серия под угрозой
  | 'review' //  урок сделан — закрепление «вопрос → ответ»
  | 'night' //   тихие часы, итог дня
  | 'stale'; //  расписание закончилось — приложение давно не открывали

export interface WidgetEntry {
  /** С какого момента показывать запись (ms) */
  at: number;
  state: WidgetState;
  /** Слово записи: в 'review' — главное, в 'waiting'/'streak' — для строки над часами */
  phase?: 'question' | 'answer';
  /** «Перевод → слово»: prompt — перевод, answer — слово */
  reverse?: boolean;
  prompt?: string;
  answer?: string;
  cardId?: string;
  setId?: string;
  /** Слов ждут повторения в этот момент */
  waiting: number;
  /** Новых слов в уроке (оценка) */
  newCount: number;
  /** Примерное время урока, минуты */
  minutes: number;
  /** Серия, дней */
  streak: number;
  /** До полуночи, целых часов — только в 'streak' */
  hoursLeft?: number;
  /** Слов урока сделано сегодня / всего — кольцо прогресса */
  done: number;
  total: number;
  /** Угасающих слов — для 'stale' */
  fading: number;
}

export type WidgetDirection = 'auto' | 'forward' | 'reverse';

export interface WidgetSnapshot {
  version: number;
  generatedAt: number;
  /** Скрывать перевод, пока iPhone заблокирован (настройка виджета) */
  hideAnswerLocked: boolean;
  entries: WidgetEntry[];
}

export interface WidgetPlanInput {
  /** Карточки наборов урока (текущий курс), без повторов — для счётчиков урока */
  cards: Card[];
  /** Откуда брать слова для виджета, если выбран набор в настройках; по умолчанию — cards */
  poolCards?: Card[];
  /** Направление (настройка виджета), по умолчанию auto */
  direction?: WidgetDirection;
  /** Скрывать перевод, пока iPhone заблокирован */
  hideAnswer?: boolean;
  /** Сегодняшний день урока (null — главную сегодня ещё не открывали) */
  day: LessonDay | null;
  /** План урока на сейчас (buildLessonPlan) */
  plan: LessonPlan;
  /** Настройка «Новых слов в день» */
  newPerDay: number;
  streakDays: number;
  /** Цель дня выполнена (как на главной — для «серии под угрозой») */
  goalReached: boolean;
  now: number;
}

/** Слова, отвеченные в уроке в этот день */
interface Answered {
  reviewed: Set<string>;
  introduced: Set<string>;
}

const stepOf = (card: Card) => card.learningStep || 0;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const addDays = (dayStart: number, n: number) => {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
const atHour = (dayStart: number, hour: number) => {
  const d = new Date(dayStart);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};
const fits = (card: Card) =>
  !!card.frontText?.trim() &&
  !!card.backText?.trim() &&
  card.frontText.trim().length <= WIDGET_MAX_TEXT &&
  card.backText.trim().length <= WIDGET_MAX_TEXT;

/**
 * Пул слов на день, в порядке приоритета (не больше WIDGET_POOL_MAX).
 * now — момент, на который решаем, «ждёт ли слово повторения» (для будущих дней — их утро).
 */
export function pickPool(cards: Card[], answered: Answered, dayStart: number, now: number): Card[] {
  const yesterday = addDays(dayStart, -1);
  const isAnswered = (c: Card) => answered.reviewed.has(c.id) || answered.introduced.has(c.id);
  const groups: Card[][] = [[], [], [], []];

  for (const c of cards) {
    if (!fits(c)) continue;
    const step = stepOf(c);
    const waiting = isCardWaitingReview(c, now);
    const met = step >= 1 || answered.introduced.has(c.id);
    if (!met || step >= 5) continue;
    if (waiting && !isAnswered(c)) continue;

    const mistake = isAnswered(c) && (waiting || (answered.introduced.has(c.id) && step === 0));
    if (mistake) groups[0].push(c);
    else if (answered.introduced.has(c.id)) groups[1].push(c);
    else if (step <= 2 && c.lastReviewDate >= yesterday) groups[2].push(c);
    else if (step >= 2 && c.nextReviewDate > now + DAY) groups[3].push(c);
  }

  const recentFirst = (a: Card, b: Card) => b.lastReviewDate - a.lastReviewDate || a.id.localeCompare(b.id);
  return groups.flatMap((g) => g.sort(recentFirst)).slice(0, WIDGET_POOL_MAX);
}

/** Сколько слов ждут повторения в момент t (не считая уже повторённых сегодня) */
function countWaiting(cards: Card[], answered: Answered, t: number): number {
  let n = 0;
  for (const c of cards) {
    if (isCardWaitingReview(c, t) && !answered.reviewed.has(c.id) && !answered.introduced.has(c.id)) n++;
  }
  return n;
}

function countFading(cards: Card[], t: number): number {
  return cards.filter((c) => isCardFading(c, t)).length;
}

/** Ротация пула в течение одного дня: какое слово показать в слоте t */
class Rotation {
  private shows = new Map<string, { count: number; last: number }>();

  constructor(private pool: Card[]) {}

  next(t: number): { card: Card; showIndex: number } | null {
    if (this.pool.length === 0) return null;
    const stat = (c: Card) => this.shows.get(c.id) ?? { count: 0, last: -Infinity };
    const ready = (c: Card) => {
      const s = stat(c);
      return s.count === 0 || t - s.last >= SHOW_GAPS_MS[Math.min(s.count - 1, SHOW_GAPS_MS.length - 1)];
    };
    // Пул в порядке приоритета; sort стабильный: среди готовых — реже показанные, затем по приоритету
    const card = this.pool.filter(ready).sort((a, b) => stat(a).count - stat(b).count)[0];
    if (!card) return null;
    const s = stat(card);
    this.shows.set(card.id, { count: s.count + 1, last: t });
    return { card, showIndex: s.count };
  }
}

function cardFields(card: Card, showIndex: number, phase: 'question' | 'answer', direction: WidgetDirection) {
  const reverse =
    direction === 'reverse' ||
    (direction === 'auto' && stepOf(card) >= 2 && showIndex % REVERSE_EVERY === REVERSE_EVERY - 1);
  const front = card.frontText.trim();
  const back = card.backText.trim();
  return {
    phase,
    reverse,
    prompt: reverse ? back : front,
    answer: reverse ? front : back,
    cardId: card.id,
    setId: card.setId,
  };
}

/** Расписание виджета на WIDGET_HORIZON_MS вперёд от now */
export function buildTimeline(input: WidgetPlanInput): WidgetEntry[] {
  const { cards, day, plan, newPerDay, streakDays, goalReached, now } = input;
  const poolCards = input.poolCards ?? cards;
  const direction = input.direction ?? 'auto';
  const today = startOfDay(now);
  const end = now + WIDGET_HORIZON_MS;
  const entries: WidgetEntry[] = [];

  const lessonDoneToday = plan.state === 'done' || plan.state === 'finished' || plan.state === 'mistakes';
  const nothingStudied = plan.state === 'first';
  const newLeft = cards.filter((c) => stepOf(c) === 0).length;

  for (let d = 0; ; d++) {
    const dayStart = addDays(today, d);
    if (dayStart >= end) break;
    const isToday = d === 0;
    const answered: Answered = isToday && day
      ? { reviewed: new Set(day.reviewedIds), introduced: new Set(day.introducedIds) }
      : { reviewed: new Set(), introduced: new Set() };
    const done = isToday && lessonDoneToday;
    // Серия в этот день: сегодня — как есть; завтра — сохранится, только если сегодня цель выполнена
    // (иначе приложение откроют и расписание пересчитается); дальше — неизвестно, не предупреждаем
    const dayStreak = d === 0 ? streakDays : d === 1 && goalReached ? streakDays : 0;
    const dayGoal = isToday && goalReached;
    const doneCount = isToday && day ? day.reviewedIds.length + day.introducedIds.length : 0;

    const wakeFrom = atHour(dayStart, QUIET_TO_HOUR);
    const quietFrom = atHour(dayStart, QUIET_FROM_HOUR);
    const poolAt = Math.max(now, wakeFrom);
    const rotation = new Rotation(pickPool(poolCards, answered, dayStart, isToday ? now : poolAt));

    // Ночь до 07:00 (только если сейчас ещё ночь) — итог вчерашнего дня не знаем, показываем сегодняшний
    if (isToday && now < wakeFrom) {
      entries.push(nightEntry(now, doneCount, streakDays));
    }

    const firstSlot = Math.max(wakeFrom, Math.floor(now / CYCLE_MS) * CYCLE_MS);
    for (let slot = firstSlot; slot < quietFrom && slot < end; slot += CYCLE_MS) {
      const waiting = countWaiting(cards, answered, slot);
      const reviewCount = Math.min(waiting, LESSON_MAX_CARDS);
      const newCount = done ? 0 : isToday ? plan.newIds.length : Math.min(newPerDay, newLeft);
      const base = {
        waiting,
        newCount,
        minutes: estimateMinutes(reviewCount, newCount),
        streak: dayStreak,
        done: doneCount,
        total: done ? doneCount : doneCount + reviewCount + newCount,
        fading: 0,
      };

      let state: WidgetState;
      const hoursLeft = done ? null : streakRiskHoursLeft(new Date(slot), dayStreak, dayGoal);
      if (done || reviewCount + newCount === 0) state = 'review';
      else if (isToday && nothingStudied) state = 'first';
      else if (hoursLeft !== null) state = 'streak';
      else state = 'waiting';

      const pick = rotation.next(slot);
      if (!pick) {
        entries.push({ at: slot, state, ...base, ...(hoursLeft !== null && state === 'streak' ? { hoursLeft } : {}) });
        continue;
      }
      const extra = state === 'streak' && hoursLeft !== null ? { hoursLeft } : {};
      entries.push({ at: slot, state, ...base, ...extra, ...cardFields(pick.card, pick.showIndex, 'question', direction) });
      const answerAt = slot + CYCLE_QUESTION_MIN * MINUTE;
      if (answerAt < end) {
        entries.push({ at: answerAt, state, ...base, ...extra, ...cardFields(pick.card, pick.showIndex, 'answer', direction) });
      }
    }

    if (quietFrom < end && quietFrom >= now) {
      entries.push(nightEntry(quietFrom, doneCount, dayStreak));
    } else if (isToday && now >= quietFrom) {
      entries.push(nightEntry(now, doneCount, dayStreak));
    }
  }

  entries.push({
    at: end,
    state: 'stale',
    waiting: countWaiting(cards, { reviewed: new Set(), introduced: new Set() }, end),
    newCount: 0,
    minutes: 0,
    streak: 0,
    done: 0,
    total: 0,
    fading: countFading(cards, end),
  });

  return entries.sort((a, b) => a.at - b.at);
}

function nightEntry(at: number, done: number, streak: number): WidgetEntry {
  return { at, state: 'night', waiting: 0, newCount: 0, minutes: 0, streak, done, total: done, fading: 0 };
}

export function buildWidgetSnapshot(input: WidgetPlanInput): WidgetSnapshot {
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    generatedAt: input.now,
    hideAnswerLocked: !!input.hideAnswer,
    entries: buildTimeline(input),
  };
}
