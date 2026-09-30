/**
 * Урок дня (plan/home_redesign.md, этап 1)
 * @description Собирает урок для главной: сначала слова, которым пришло время повторения,
 * потом порция новых слов из одного «текущего» набора. Чистые функции — без React и хранилищ:
 * состояние дня (LessonDay) хранит и передаёт вызывающий код.
 *
 * Правила:
 * - повторение — все слова с isCardWaitingReview, самые просроченные первыми;
 * - урок не больше LESSON_MAX_CARDS карточек;
 * - квота новых на день = min(newPerDay, LESSON_MAX_CARDS − ждали повторения утром) + «ещё» по кнопке;
 *   «утро» — снимок startWaiting при первом открытии главной за день, чтобы после 30 повторений
 *   из 40 квота новых не «возвращалась»;
 * - новые — из текущего набора по порядку добавления; закончился — следующий по списку;
 * - текущий набор: выбранный вручную → последний изученный с новыми словами → первый в списке.
 * Правила SRS (шаги, интервалы) здесь не меняются — только выбор слов.
 */
import type { Card, CardSet } from '@/types';
import { isCardWaitingReview, isCardFading } from './SRSService';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Потолок урока (как прежний DAILY_REVIEW_MAX «Повторения дня») */
export const LESSON_MAX_CARDS = 30;
/** Варианты настройки «Новых слов в день» */
export const NEW_PER_DAY_OPTIONS = [5, 10, 20] as const;
export const DEFAULT_NEW_PER_DAY = 10;
/** Сколько новых добавляет кнопка «Ещё 10 новых» */
export const EXTRA_NEW_STEP = 10;

/** Примерное время на карточку, секунды: повторение быстрее, новое слово — показ + проверка */
const REVIEW_SEC = 15;
const NEW_SEC = 22;

/** Состояние урока за один день (хранится вызывающим кодом) */
export interface LessonDay {
  /** Локальная дата YYYY-MM-DD */
  date: string;
  /** Сколько слов ждали повторения при первом открытии главной за день */
  startWaiting: number;
  /** Слова, повторённые сегодня в уроке */
  reviewedIds: string[];
  /** Новые слова, впервые показанные сегодня в уроке */
  introducedIds: string[];
  /** Добавлено кнопкой «Ещё 10 новых» */
  extraNew: number;
  /** Набор, выбранный через «Сменить набор» (переживает смену дня) */
  focusSetId: string | null;
}

export type LessonState =
  | 'empty' //    нет ни одной карточки
  | 'first' //    ни одно слово ещё не учили — урок из новых слов
  | 'lesson' //   обычный урок
  | 'overdue' //  утром ждали повторения ≥ LESSON_MAX_CARDS: только повторение, новые завтра
  | 'mistakes' // квоты выполнены, но слова с сегодняшними ошибками снова ждут
  | 'done' //     на сегодня всё
  | 'finished'; // на сегодня всё, и новых слов больше нет ни в одном наборе

export interface LessonPlan {
  state: LessonState;
  /** Очередь повторения (тест) */
  reviewIds: string[];
  /** Очередь новых слов (сначала карточки, потом проверка) */
  newIds: string[];
  /** Слова с сегодняшними ошибками — только в состоянии 'mistakes' */
  mistakeIds: string[];
  /** Текущий набор, из которого берутся новые слова */
  focusSetId: string | null;
  focusSetTitle: string | null;
  /** Сколько слов текущего набора уже учили хотя бы раз / всего — для «Английский B1 · 18 из 30» */
  focusSetSeen: number;
  focusSetTotal: number;
  /** Примерное время урока, минуты (≥ 1, если урок не пустой) */
  minutes: number;
  /** Всего слов ждут повторения сейчас (включая не вошедшие в урок) */
  waitingTotal: number;
  /** Из очереди повторения — сколько «угасает» (просрочено дольше интервала) */
  fadingCount: number;
  /** Сколько слов придёт на повторение в ближайшие сутки */
  tomorrowCount: number;
  /** Сколько слов ещё ни разу не учили во всех наборах */
  newLeftTotal: number;
  /** Квота новых на сегодня (с учётом «ещё») */
  newQuota: number;
}

export interface LessonInput {
  /** Наборы текущего курса в порядке списка на главной */
  sets: CardSet[];
  /** id карточек по наборам и сами карточки — как в cardsStore */
  cardsBySet: Record<string, string[] | undefined>;
  cards: Record<string, Card | undefined>;
  /** Настройка «Новых слов в день» */
  newPerDay: number;
  day: LessonDay;
  now: number;
}

type SetCards = { set: CardSet; cards: Card[] };

/** Карточки наборов без повторов (одна карточка может встречаться в двух наборах курса) */
function collectCards(sets: CardSet[], cardsBySet: LessonInput['cardsBySet'], cards: LessonInput['cards']): SetCards[] {
  const seen = new Set<string>();
  return sets.map((set) => {
    const list: Card[] = [];
    for (const id of cardsBySet[set.id] || []) {
      const card = cards[id];
      if (!card || seen.has(id)) continue;
      seen.add(id);
      list.push(card);
    }
    return { set, cards: list };
  });
}

const stepOf = (card: Card) => card.learningStep || 0;
const byCreated = (a: Card, b: Card) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** Сколько слов ждут повторения — для утреннего снимка LessonDay.startWaiting */
export function countWaitingReview(
  sets: CardSet[],
  cardsBySet: LessonInput['cardsBySet'],
  cards: LessonInput['cards'],
  now: number,
): number {
  let n = 0;
  for (const { cards: list } of collectCards(sets, cardsBySet, cards)) {
    for (const card of list) if (isCardWaitingReview(card, now)) n++;
  }
  return n;
}

/**
 * Состояние дня: вчерашнее — сбрасывается (выбранный набор остаётся), сегодняшнее — как есть.
 * waitingNow — countWaitingReview на момент первого открытия главной.
 */
export function ensureLessonDay(prev: LessonDay | null, date: string, waitingNow: number): LessonDay {
  if (prev && prev.date === date) return prev;
  return {
    date,
    startWaiting: waitingNow,
    reviewedIds: [],
    introducedIds: [],
    extraNew: 0,
    focusSetId: prev?.focusSetId ?? null,
  };
}

export function estimateMinutes(reviewCount: number, newCount: number): number {
  if (reviewCount + newCount === 0) return 0;
  return Math.max(1, Math.round((reviewCount * REVIEW_SEC + newCount * NEW_SEC) / 60));
}

export function buildLessonPlan({ sets, cardsBySet, cards, newPerDay, day, now }: LessonInput): LessonPlan {
  const bySet = collectCards(sets, cardsBySet, cards);
  const all = bySet.flatMap((s) => s.cards);
  const answeredToday = new Set([...day.reviewedIds, ...day.introducedIds]);
  const introduced = new Set(day.introducedIds);

  // --- Повторение ---
  const waiting = all.filter((c) => isCardWaitingReview(c, now)).sort((a, b) => a.nextReviewDate - b.nextReviewDate);
  const freshWaiting = waiting.filter((c) => !answeredToday.has(c.id));
  // Ошибки сегодняшнего урока: повторённое слово снова ждёт, новое осталось на шаге 0 («Не знаю»)
  const mistakes = all.filter(
    (c) => answeredToday.has(c.id) && (isCardWaitingReview(c, now) || (introduced.has(c.id) && stepOf(c) === 0)),
  );
  const reviewBudget = Math.max(0, LESSON_MAX_CARDS - day.reviewedIds.length);
  const review = freshWaiting.slice(0, reviewBudget);

  // --- Новые ---
  const newQuota = Math.min(newPerDay, Math.max(0, LESSON_MAX_CARDS - day.startWaiting)) + day.extraNew;
  const newRemaining = Math.max(0, newQuota - day.introducedIds.length);
  const newRoom = Math.max(0, LESSON_MAX_CARDS - review.length);

  const unseenOf = (list: Card[]) => list.filter((c) => stepOf(c) === 0 && !introduced.has(c.id)).sort(byCreated);
  const withNew = bySet.filter((s) => unseenOf(s.cards).length > 0);

  const chosen = withNew.find((s) => s.set.id === day.focusSetId);
  const recent = withNew
    .filter((s) => s.set.lastStudiedAt)
    .sort((a, b) => (b.set.lastStudiedAt ?? 0) - (a.set.lastStudiedAt ?? 0))[0];
  const focus = chosen ?? recent ?? withNew[0] ?? null;

  const newCards: Card[] = [];
  const take = Math.min(newRemaining, newRoom);
  if (focus && take > 0) {
    // Текущий набор, затем остальные по порядку списка
    const queue = [focus, ...withNew.filter((s) => s !== focus)];
    for (const s of queue) {
      for (const c of unseenOf(s.cards)) {
        if (newCards.length >= take) break;
        newCards.push(c);
      }
      if (newCards.length >= take) break;
    }
  }

  // --- Сводка ---
  let tomorrowCount = 0;
  for (const c of all) {
    if (stepOf(c) >= 1 && !isCardWaitingReview(c, now) && c.nextReviewDate <= now + DAY_MS) tomorrowCount++;
  }
  const newLeftTotal = all.filter((c) => stepOf(c) === 0).length;
  const focusCards = focus?.cards ?? [];

  let state: LessonState;
  let reviewIds = review.map((c) => c.id);
  let newIds = newCards.map((c) => c.id);
  let mistakeIds: string[] = [];

  if (all.length === 0) {
    state = 'empty';
  } else if (reviewIds.length + newIds.length > 0) {
    const nothingStudied = all.every((c) => stepOf(c) === 0) && day.introducedIds.length === 0;
    if (nothingStudied) state = 'first';
    else if (day.startWaiting >= LESSON_MAX_CARDS && newIds.length === 0) state = 'overdue';
    else state = 'lesson';
  } else if (mistakes.length > 0) {
    state = 'mistakes';
    mistakeIds = mistakes.slice(0, LESSON_MAX_CARDS).map((c) => c.id);
  } else if (all.every((c) => stepOf(c) >= 1)) {
    state = 'finished';
  } else {
    state = 'done';
  }
  if (state === 'empty') {
    reviewIds = [];
    newIds = [];
  }

  const fadingCount = review.filter((c) => isCardFading(c, now)).length;
  const minutes =
    state === 'mistakes' ? estimateMinutes(mistakeIds.length, 0) : estimateMinutes(reviewIds.length, newIds.length);

  return {
    state,
    reviewIds,
    newIds,
    mistakeIds,
    focusSetId: focus?.set.id ?? null,
    focusSetTitle: focus?.set.title ?? null,
    focusSetSeen: focusCards.filter((c) => stepOf(c) >= 1 || introduced.has(c.id)).length,
    focusSetTotal: focusCards.length,
    minutes,
    waitingTotal: waiting.length,
    fadingCount,
    tomorrowCount,
    newLeftTotal,
    newQuota,
  };
}
