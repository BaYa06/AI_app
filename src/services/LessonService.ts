/**
 * Урок дня (plan/done/home_redesign.md, этап 1)
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
import type { SessionStage } from '@/types/navigation';
import { isSubjectSet } from '@/utils/setKind';
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

/** Набор, в котором ещё есть новые слова — для «Сменить набор» */
export interface NewWordsSet {
  setId: string;
  title: string;
  /** Сколько новых слов ещё ни разу не показывали */
  newLeft: number;
}

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
  /** Сколько слов урока уже сделано сегодня (повторено + впервые показано) — для кольца прогресса */
  doneToday: number;
  /** Наборы с новыми словами в порядке списка — для «Сменить набор» */
  newSets: NewWordsSet[];
  /** Текущий набор выбран вручную («Сменить набор»), а не автоматически */
  focusManual: boolean;
  /**
   * Через сколько дней после сегодняшнего придут последние новые слова при нынешнем темпе
   * (0 — всё новое уже в сегодняшнем уроке). Оценка: дни большого повторения темп замедляют.
   */
  newDaysLeft: number;
}

export interface LessonInput {
  /** Все наборы пользователя: повторение — из всех курсов, чтобы слова других курсов не забывались */
  sets: CardSet[];
  /** Откуда брать новые слова — наборы открытого курса в порядке списка. Нет — из sets */
  newFrom?: CardSet[];
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
function collectCards(
  sets: CardSet[],
  cardsBySet: LessonInput['cardsBySet'],
  cards: LessonInput['cards']
): SetCards[] {
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
  now: number
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
export function ensureLessonDay(
  prev: LessonDay | null,
  date: string,
  waitingNow: number
): LessonDay {
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

/** Часть урока, в которой дан ответ: повторение (тест) или новые слова (карточки) */
export type LessonPhase = 'review' | 'new';

/** Ответ в уроке: слово попадает в повторённые или впервые показанные за день (повторный ответ — без изменений) */
export function recordLessonAnswer(day: LessonDay, phase: LessonPhase, cardId: string): LessonDay {
  const key = phase === 'review' ? 'reviewedIds' : 'introducedIds';
  if (day.reviewedIds.includes(cardId) || day.introducedIds.includes(cardId)) return day;
  return { ...day, [key]: [...day[key], cardId] };
}

/** Кнопка «Ещё 10 новых» */
export function addExtraNew(day: LessonDay): LessonDay {
  return { ...day, extraNew: day.extraNew + EXTRA_NEW_STEP };
}

/** «Сменить набор»: null — снова выбирать автоматически */
export function setFocusSet(day: LessonDay, setId: string | null): LessonDay {
  return day.focusSetId === setId ? day : { ...day, focusSetId: setId };
}

/**
 * Квота новых слов на сегодня (с учётом «ещё»). Одна для урока дня и сессии набора:
 * утром ждали повторения много — новых меньше, чтобы урок не превысил LESSON_MAX_CARDS.
 */
export function newQuotaOf(day: LessonDay, newPerDay: number): number {
  return Math.min(newPerDay, Math.max(0, LESSON_MAX_CARDS - day.startWaiting)) + day.extraNew;
}

export function estimateMinutes(reviewCount: number, newCount: number): number {
  if (reviewCount + newCount === 0) return 0;
  return Math.max(1, Math.round((reviewCount * REVIEW_SEC + newCount * NEW_SEC) / 60));
}

export function buildLessonPlan({
  sets,
  newFrom,
  cardsBySet,
  cards,
  newPerDay,
  day,
  now,
}: LessonInput): LessonPlan {
  const all = collectCards(sets, cardsBySet, cards).flatMap((s) => s.cards);
  const bySet = newFrom
    ? collectCards(newFrom, cardsBySet, cards)
    : collectCards(sets, cardsBySet, cards);
  const answeredToday = new Set([...day.reviewedIds, ...day.introducedIds]);
  const introduced = new Set(day.introducedIds);

  // --- Повторение ---
  const waiting = all
    .filter((c) => isCardWaitingReview(c, now))
    .sort((a, b) => a.nextReviewDate - b.nextReviewDate);
  const freshWaiting = waiting.filter((c) => !answeredToday.has(c.id));
  // Ошибки сегодняшнего урока: повторённое слово снова ждёт, новое осталось на шаге 0 («Не знаю»)
  const mistakes = all.filter(
    (c) =>
      answeredToday.has(c.id) &&
      (isCardWaitingReview(c, now) || (introduced.has(c.id) && stepOf(c) === 0))
  );
  const reviewBudget = Math.max(0, LESSON_MAX_CARDS - day.reviewedIds.length);
  const review = freshWaiting.slice(0, reviewBudget);

  // --- Новые ---
  const newQuota = newQuotaOf(day, newPerDay);
  const newRemaining = Math.max(0, newQuota - day.introducedIds.length);
  const newRoom = Math.max(0, LESSON_MAX_CARDS - review.length);

  const unseenOf = (list: Card[]) =>
    list.filter((c) => stepOf(c) === 0 && !introduced.has(c.id)).sort(byCreated);
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
    if (stepOf(c) >= 1 && !isCardWaitingReview(c, now) && c.nextReviewDate <= now + DAY_MS)
      tomorrowCount++;
  }
  // Новые слова берутся только из newFrom — и считаем их там же
  const newLeftTotal = bySet.reduce((n, s) => n + s.cards.filter((c) => stepOf(c) === 0).length, 0);
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
    state === 'mistakes'
      ? estimateMinutes(mistakeIds.length, 0)
      : estimateMinutes(reviewIds.length, newIds.length);

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
    doneToday: day.reviewedIds.length + day.introducedIds.length,
    newSets: withNew.map((s) => ({
      setId: s.set.id,
      title: s.set.title,
      newLeft: unseenOf(s.cards).length,
    })),
    focusManual: !!chosen,
    newDaysLeft:
      newPerDay > 0 ? Math.ceil(Math.max(0, newLeftTotal - newCards.length) / newPerDay) : 0,
  };
}

// ─── Сессия набора «Изучить» (plan/new/study_session.md, Session 1) ───
//
// Главная кнопка шторки набора. Правила выбора слов те же, что у урока дня, и квота новых общая
// (newQuotaOf, LessonDay.introducedIds), только слова берутся из одного набора.
// - новое слово — ни разу не отвечали: шаг 0 и нет lastReviewDate (и не показано сегодня в уроке);
//   слово, упавшее после ошибки на шаг 0, — не новое, а слабое: оно идёт в «Повторить»;
// - слова берутся снизу вверх по уровню (new → learning → young → mature),
//   внутри уровня — раньше всех тот, чей срок раньше, затем по порядку добавления.

export type { SessionStage };

export type SetSessionMode =
  | 'empty' //  в наборе нет слов → «Добавить слова»
  | 'tooFew' // слов меньше SESSION_MIN_CARDS — тесту не хватит вариантов → «Добавьте ещё N слов»
  | 'review' // слабые слова или пора повторить → «Повторить N слов»
  | 'learn' //  новые слова, квота дня не выбрана → «Изучить»
  | 'more' //   квота дня выбрана, новые ещё есть → «Изучить ещё 5»
  | 'again'; // новых нет, повторять рано → «Повторить набор» (уровень слов не растёт)

/** Новых слов в одной сессии */
export const SESSION_NEW_WORDS = 5;
/** Слов в одной сессии повторения */
export const SESSION_REVIEW_MAX = 10;
/** Меньше — в тесте не собрать 4 варианта ответа */
export const SESSION_MIN_CARDS = 4;

const LANGUAGE_STAGES: Record<'learn' | 'review', SessionStage[]> = {
  learn: ['cards', 'pairs', 'test', 'listen', 'context', 'build'],
  // Без карточек: самооценка знание не проверяет
  review: ['test', 'listen', 'build'],
};
// Предмет (plan/new/set_kind.md): нет озвучки, «Собери слово» и «Слова в контексте»
const SUBJECT_STAGES: Record<'learn' | 'review', SessionStage[]> = {
  learn: ['cards', 'pairs', 'test'],
  review: ['test'],
};

/** Примерное время на одно задание этапа, секунды: у новых слов дольше (показ, перевод) */
const SESSION_LEARN_SEC = 14;
const SESSION_REVIEW_SEC = 8;

export interface SetSessionInput {
  set: Pick<CardSet, 'kind'>;
  /** Карточки набора */
  cards: Card[];
  /** Настройка «Новых слов в день» */
  newPerDay: number;
  day: LessonDay;
  now: number;
}

export interface SetSessionPlan {
  mode: SetSessionMode;
  /** Слова сессии в порядке показа (пусто для empty / tooFew) */
  cardIds: string[];
  /** Сколько из cardIds новых; остальные — добор из learning («3 новых + 2 на закрепление») */
  newCount: number;
  /** Этапы по порядку; неподходящие слова и пустые этапы убирает цепочка этапов (Session 2) */
  stages: SessionStage[];
  /** Примерное время, минуты (≥ 1, если сессия не пустая) */
  minutes: number;
  /** «40 слов · изучали 15» */
  totalCount: number;
  studiedCount: number;
  /** tooFew: сколько слов добавить до минимума */
  missingCards: number;
}

/** Отвечали ли на слово хоть раз (иначе оно новое) */
function wasAnswered(card: Card, introduced: Set<string>): boolean {
  return stepOf(card) >= 1 || card.lastReviewDate > 0 || introduced.has(card.id);
}

/** Снизу вверх по уровню, внутри уровня — срок раньше, затем порядок добавления */
const byLevel = (a: Card, b: Card) =>
  stepOf(a) - stepOf(b) || a.nextReviewDate - b.nextReviewDate || byCreated(a, b);

export function buildSetSessionPlan({
  set,
  cards,
  newPerDay,
  day,
  now,
}: SetSessionInput): SetSessionPlan {
  const introduced = new Set(day.introducedIds);
  const answered = cards.filter((c) => wasAnswered(c, introduced));
  const stages = isSubjectSet(set) ? SUBJECT_STAGES : LANGUAGE_STAGES;
  const base = { totalCount: cards.length, studiedCount: answered.length, missingCards: 0 };
  const plan = (
    mode: SetSessionMode,
    list: Card[],
    newCount: number,
    kind: 'learn' | 'review'
  ): SetSessionPlan => {
    const sec = kind === 'learn' ? SESSION_LEARN_SEC : SESSION_REVIEW_SEC;
    const minutes =
      list.length > 0 ? Math.max(1, Math.round((list.length * stages[kind].length * sec) / 60)) : 0;
    return {
      ...base,
      mode,
      cardIds: list.map((c) => c.id),
      newCount,
      stages: stages[kind],
      minutes,
    };
  };

  if (cards.length === 0) return { ...plan('empty', [], 0, 'learn'), stages: [] };
  if (cards.length < SESSION_MIN_CARDS) {
    return {
      ...plan('tooFew', [], 0, 'learn'),
      stages: [],
      missingCards: SESSION_MIN_CARDS - cards.length,
    };
  }

  // Слабые (ошибка вернула на шаг 0) и те, кому пришло время повторения
  const review = answered
    .filter((c) => stepOf(c) === 0 || isCardWaitingReview(c, now))
    .sort(byLevel);
  if (review.length > 0) return plan('review', review.slice(0, SESSION_REVIEW_MAX), 0, 'review');

  const fresh = cards
    .filter((c) => !wasAnswered(c, introduced))
    .sort(byCreated)
    .slice(0, SESSION_NEW_WORDS);
  if (fresh.length > 0) {
    // Новых меньше 5 — добираем learning (шаг 1–2) с самым низким уровнем
    const fill = answered
      .filter((c) => stepOf(c) <= 2)
      .sort(byLevel)
      .slice(0, SESSION_NEW_WORDS - fresh.length);
    // Квота общая с уроком дня; последняя сессия дня может её чуть превысить — сессия не дробится
    const quotaLeft = newQuotaOf(day, newPerDay) - day.introducedIds.length;
    return plan(quotaLeft > 0 ? 'learn' : 'more', [...fresh, ...fill], fresh.length, 'learn');
  }

  return plan('again', [...answered].sort(byLevel).slice(0, SESSION_NEW_WORDS), 0, 'review');
}
