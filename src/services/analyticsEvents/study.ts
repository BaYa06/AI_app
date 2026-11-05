/** События: Учёба: сессии, урок дня, сессия набора (Clean 9 — из Analytics без изменений). */
import { type StudyMode, type CardRating, log } from './core';

export const studyEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // СЕССИИ ОБУЧЕНИЯ
  // Зачем: это ключевые события. Funnel:
  //   set_viewed → study_mode_selected → study_session_start → study_session_complete
  // Провал на любом шаге = проблема UX.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер выбрал режим изучения (но ещё не начал).
   * Зачем: видим распределение режимов. Если quiz не выбирают — может, кнопка неудобная.
   */
  studyModeSelected: (mode: StudyMode, cardCount: number) =>
    log('study_mode_selected', { mode, card_count: cardCount }),

  /**
   * Сессия изучения началась.
   * Зачем: считаем DAU (daily active users) по факту начала обучения, не просто открытия приложения.
   */
  studySessionStart: (params: {
    setId: string;
    mode: StudyMode;
    cardCount: number;
    isReview: boolean; // повторение по SRS или первое изучение
    phaseId?: string;
  }) =>
    log('study_session_start', {
      set_id: params.setId,
      mode: params.mode,
      card_count: params.cardCount,
      is_review: params.isReview,
      phase_id: params.phaseId ?? '',
    }),

  /**
   * Юзер ответил на карточку.
   * Зачем: смотрим среднюю точность по всем юзерам.
   * Если accuracy < 50% — карточки слишком сложные или режим не работает.
   */
  cardAnswered: (params: {
    correct: boolean;
    rating?: CardRating; // только для flashcard-режима
    timeSpentMs: number;
    mode: StudyMode;
    input?: 'button' | 'swipe'; // только для flashcard-режима: кнопка или свайп
  }) =>
    log('card_answered', {
      correct: params.correct,
      rating: params.rating ?? '',
      time_spent_ms: params.timeSpentMs,
      mode: params.mode,
      input: params.input ?? '',
    }),

  /**
   * Сессия завершена (дошли до конца набора / порции).
   * Зачем: считаем completion rate. Если мало — юзеры бросают на середине.
   * timeSpentSec + cardCount = средний темп обучения.
   */
  studySessionComplete: (params: {
    setId: string;
    mode: StudyMode;
    cardCount: number;
    correctAnswers: number;
    timeSpentSec: number;
    phaseComplete: boolean; // завершена вся фаза или только порция
  }) =>
    log('study_session_complete', {
      set_id: params.setId,
      mode: params.mode,
      card_count: params.cardCount,
      correct_answers: params.correctAnswers,
      accuracy: Math.round((params.correctAnswers / params.cardCount) * 100),
      time_spent_sec: params.timeSpentSec,
      phase_complete: params.phaseComplete,
    }),

  /**
   * Юзер бросил сессию до конца (нажал ×).
   * Зачем: если exit_ratio высокий для конкретного режима — он неудобный.
   */
  studySessionAbandoned: (params: {
    setId: string;
    mode: StudyMode;
    cardsCompleted: number;
    totalCards: number;
    timeSpentSec: number;
  }) =>
    log('study_session_abandoned', {
      set_id: params.setId,
      mode: params.mode,
      cards_completed: params.cardsCompleted,
      total_cards: params.totalCards,
      exit_percent: Math.round((params.cardsCompleted / params.totalCards) * 100),
      time_spent_sec: params.timeSpentSec,
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // УРОК ДНЯ
  // Зачем: главная метрика редизайна главной — сколько людей начинают и заканчивают урок дня
  // (plan/done/home_redesign.md, 6.1). «Ещё 10 новых» и «Сменить набор» — также в home_action.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Карточка урока показана (один раз за заход на главную).
   * state — lesson / first / overdue / mistakes / done / finished; streak_risk — вечерний вариант «Сохрани серию».
   */
  lessonCardViewed: (params: {
    state: string;
    reviewCount: number;
    newCount: number;
    streakRisk: boolean;
  }) =>
    log('lesson_card_viewed', {
      state: params.state,
      review_count: params.reviewCount,
      new_count: params.newCount,
      streak_risk: params.streakRisk,
    }),

  /**
   * Урок запущен с главной. Доля lesson_started среди lesson_card_viewed — конверсия карточки.
   */
  lessonStarted: (params: {
    state: string;
    reviewCount: number;
    newCount: number;
    minutes: number;
    pushId?: string;
  }) =>
    log('lesson_started', {
      state: params.state,
      review_count: params.reviewCount,
      new_count: params.newCount,
      minutes: params.minutes,
      ...(params.pushId ? { source: 'push', push_id: params.pushId } : null),
    }),

  /**
   * Пройдена последняя часть урока. lesson_completed / lesson_started — доля доведённых до конца;
   * duration_sec сравниваем с обещанным «~N мин».
   */
  lessonCompleted: (params: {
    reviewCount: number;
    newCount: number;
    durationSec: number;
    pushId?: string;
  }) =>
    log('lesson_completed', {
      review_count: params.reviewCount,
      new_count: params.newCount,
      duration_sec: params.durationSec,
      ...(params.pushId ? { source: 'push', push_id: params.pushId } : null),
    }),

  /**
   * «Сменить набор»: выбран набор вручную или снова «Выбирать автоматически».
   */
  lessonFocusChanged: (auto: boolean) => log('lesson_focus_changed', { auto }),

  // ═══════════════════════════════════════════════════════════════════════════
  // СЕССИЯ НАБОРА «ИЗУЧИТЬ» (plan/new/study_session.md, Session 13)
  // Зачем: доводят ли сессию до конца, на каком этапе бросают, какие этапы пропускают
  // и сходится ли время с обещанным «около N минут» — по этому решаем, не сократить ли этапы.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Сессия запущена: из шторки набора (sheet) или с итогов прошлой («Продолжить», results).
   * stages — этапы после отбора слов, dropped — сколько этапов убрано до старта (нет подходящих слов).
   */
  setSessionStarted: (params: {
    mode: string;
    words: number;
    newCount: number;
    stages: string[];
    dropped: number;
    minutes: number;
    from: 'sheet' | 'results';
  }) =>
    log('set_session_started', {
      mode: params.mode,
      words: params.words,
      new_count: params.newCount,
      stages: params.stages.join(','),
      stage_count: params.stages.length,
      dropped: params.dropped,
      minutes: params.minutes,
      from: params.from,
    }),

  /** Этап пройден (done) или пропущен кнопкой «Не могу слушать» (skipped). index — с 1 */
  setSessionStage: (params: {
    stage: string;
    index: number;
    total: number;
    result: 'done' | 'skipped';
  }) =>
    log('set_session_stage', {
      stage: params.stage,
      index: params.index,
      total: params.total,
      result: params.result,
    }),

  /** Вышли посреди сессии через окно «Выйти из сессии?». index — этап, на котором вышли, с 1 */
  setSessionExited: (params: {
    stage: string;
    index: number;
    total: number;
    durationSec: number;
  }) =>
    log('set_session_exited', {
      stage: params.stage,
      index: params.index,
      total: params.total,
      duration_sec: params.durationSec,
    }),

  /** Сессия пройдена до итогов. duration_sec сравниваем с minutes из set_session_started */
  setSessionCompleted: (params: {
    words: number;
    weak: number;
    stages: number;
    durationSec: number;
    xp: number;
  }) =>
    log('set_session_completed', {
      words: params.words,
      weak: params.weak,
      stages: params.stages,
      duration_sec: params.durationSec,
      xp: params.xp,
    }),
};
