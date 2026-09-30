/**
 * Состояние урока дня (plan/home_redesign.md, шаг 1.2)
 * @description Что уже сделано в уроке сегодня: утренний снимок повторения, повторённые и новые слова,
 * «ещё 10 новых», выбранный набор. Правила — в LessonService, здесь только хранение.
 *
 * Хранится на устройстве через localCache (ключ привязан к пользователю — после входа другим
 * аккаунтом чужой урок не подхватится). Между устройствами не синхронизируется: на втором
 * телефоне квоты дня считаются отдельно (план, «Не входит в план»).
 */
import { create } from 'zustand';
import { readCache, writeCache } from '@/services/localCache';
import {
  ensureLessonDay,
  recordLessonAnswer,
  addExtraNew,
  setFocusSet,
  type LessonDay,
  type LessonPhase,
} from '@/services/LessonService';
import { localDay } from './challengeStore';

const CACHE_NAME = 'lesson_day';

interface LessonStoreState {
  /** Сегодняшний день урока (null — главную сегодня ещё не открывали) */
  day: LessonDay | null;
  /**
   * Начать или продолжить сегодняшний день. Вызывать при фокусе главной:
   * waitingNow — countWaitingReview, из него при первом за день вызове берётся утренний снимок.
   */
  ensureToday: (waitingNow: number) => LessonDay;
  /** Ответ в уроке (вызывают экраны тренировок, если открыты из урока) */
  recordAnswer: (phase: LessonPhase, cardId: string) => void;
  /** «Ещё 10 новых» */
  addExtraNew: () => void;
  /** «Сменить набор» */
  setFocusSet: (setId: string | null) => void;
}

/** Всегда читаем с устройства: так подхватывается смена пользователя и изменения из другого экрана */
function load(): LessonDay | null {
  return readCache<LessonDay>(CACHE_NAME) ?? null;
}

export const useLessonStore = create<LessonStoreState>((set) => {
  const save = (day: LessonDay) => {
    writeCache(CACHE_NAME, day);
    set({ day });
    return day;
  };

  /** Сегодняшний день для записи ответа. Если сессия перешла через полночь — новый день
   *  без утреннего снимка (берём вчерашний: главную ещё не открывали, лучше оценки нет). */
  const today = (): LessonDay => {
    const prev = load();
    return ensureLessonDay(prev, localDay(), prev?.startWaiting ?? 0);
  };

  return {
    // Читается при первом ensureToday: до входа владелец кэша (пользователь) ещё неизвестен
    day: null,
    ensureToday: (waitingNow) => {
      const prev = load();
      const day = ensureLessonDay(prev, localDay(), waitingNow);
      if (day !== prev) return save(day);
      set({ day });
      return day;
    },
    recordAnswer: (phase, cardId) => {
      const day = today();
      const next = recordLessonAnswer(day, phase, cardId);
      if (next !== day || day.date !== load()?.date) save(next);
    },
    addExtraNew: () => {
      save(addExtraNew(today()));
    },
    setFocusSet: (setId) => {
      const day = today();
      const next = setFocusSet(day, setId);
      if (next !== day) save(next);
    },
  };
});
