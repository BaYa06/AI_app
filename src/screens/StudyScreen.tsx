/**
 * Study Screen
 * @description Экран изучения карточек с CSS-анимациями для web
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Pressable,
  Animated,
  AppState,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useCardsStore,
  useSetsStore,
  useStudyStore,
  useThemeColors,
  useSettingsStore,
  selectSetStats,
} from '@/store';
import { Text, Loading } from '@/components/common';
import { Button } from '@/components/ui';
import { StageLayout, sessionStageProgress } from '@/components/study/StageLayout';
import { buildStudyQueue, getCardStatus } from '@/services/SRSService';
import { StatusBadge } from '@/components/cards';
import { ProgressService } from '@/services/ProgressService';
import { lessonPhaseForAnswer, sessionPhaseForAnswer } from '@/services/lessonFlow';
import { useLessonStore } from '@/store/lessonStore';
import { spacing, iconSize, alpha } from '@/constants';
import { DatabaseService, Analytics } from '@/services';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Rating, Card } from '@/types';
import { Settings, Volume2 } from 'lucide-react-native';
import {
  speak,
  resolveSpeechLang,
  prefetchSpeech,
  cardSpeechLangs,
  isCardSpeakable,
} from '@/utils/speech';
import { triggerHaptic } from '@/utils/haptic';
import { fitText, fitWordWithExample } from '@/utils/fitText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  runOnJS,
  withDelay,
  withSequence,
  useReducedMotion,
  Extrapolation,
  Easing as REasing,
} from 'react-native-reanimated';
import { log } from '@/utils/logger';
import { cardFront, cardBack } from '@/utils/cardText';
import {
  CARD_WIDTH,
  DEFAULT_TEXT_BOX,
  WORD_FIT,
  EXAMPLE_FIT,
  EXAMPLE_GAP,
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
  SWIPE_OUT_MS,
  CARD_IN_MS,
  CARD_IN_DELAY_MS,
  SCREEN_WIDTH,
} from './study/layout';
import { styles } from './study/styles';
import { StudySettingsModal } from './study/StudySettingsModal';
import { FlashcardFace } from './study/FlashcardFace';

type Props = RootStackScreenProps<'Study'>;

export function StudyScreen({ navigation, route }: Props) {
  const {
    setId,
    mode,
    errorCardsFronts,
    studyAll,
    cardLimit,
    onlyHard,
    dueCardIds,
    phaseId,
    totalPhaseCards,
    studiedInPhase = 0,
    phaseOffset = 0,
    phaseFailedIds,
    lesson,
    session: sessionRoute,
  } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore((s) => s.settings);
  const incrementTodayCards = useSettingsStore((s) => s.incrementTodayCards);
  const finishStudySession = useSettingsStore((s) => s.finishStudySession);
  const isErrorReview = Boolean(errorCardsFronts && errorCardsFronts.length > 0);
  const phaseFailedList = React.useMemo(
    () => phaseFailedIds || [],
    [phaseFailedIds ? phaseFailedIds.join('|') : '']
  );

  // Генерируем phaseId при первом запуске (если не передан)
  const currentPhaseId = useRef(
    phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);
  // Количество ошибочных карточек из прошлых порций в текущей очереди
  const pendingCardsInQueueRef = useRef(0);
  // Длина очереди без повторов «Почти» — по ней итоги сессии; повторы идут после неё
  const baseQueueLengthRef = useRef(0);
  // Сессия «Изучить»: слова с ошибкой, ещё не исправленные. Ошибка уходит в конец той же очереди —
  // экран не закрывается ради новой порции, полоска стоит, пока слово не отвечено верно
  const sessionRetryIdsRef = useRef<Set<string>>(new Set());
  const [sessionRetryCount, setSessionRetryCount] = useState(0);
  // Analytics: момент показа текущей карточки
  const cardShownAtRef = useRef(Date.now());
  // Один ответ на карточку: повторное нажатие или свайп до показа следующей игнорируются
  const answeringRef = useRef(false);
  // Анимация переворота карточки (reanimated для native + web)
  const flipProgress = useSharedValue(0);
  // Свайп: сдвиг карточки за пальцем и «карточка улетает» — пока летит, кнопки не принимаются
  const swipeX = useSharedValue(0);
  const swipeFlying = useSharedValue(false);
  // Палец за порогом свайпа — вибрация при каждом пересечении порога
  const swipePastThreshold = useSharedValue(false);
  // Видимость карточки — на UI-потоке вместе со сдвигом: отвеченная прячется в том же кадре,
  // в котором возвращается в центр, и следующая проявляется уже со своим текстом (одна анимация)
  const cardOpacity = useSharedValue(1);
  const cardScale = useSharedValue(1);
  // Подсказка свайпа новичку: первые сессии, пока не сделал свайп — карточка покачивается
  // и внизу «← Не знаю · Уверенно →» (только на первой карточке)
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const swipeHintCheckedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  // Store
  const updateLastStudied = useSetsStore((s) => s.updateLastStudied);
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const getCardsBySet = useCardsStore((s) => s.getCardsBySet);

  // Study store
  const session = useStudyStore((s) => s.session);
  const isFlipped = useStudyStore((s) => s.isFlipped);
  const startSession = useStudyStore((s) => s.startSession);
  const showAnswer = useStudyStore((s) => s.showAnswer);
  const hideAnswer = useStudyStore((s) => s.hideAnswer);
  const endSession = useStudyStore((s) => s.endSession);
  const getProgress = useStudyStore((s) => s.getProgress);

  // Локальное состояние
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [textBox, setTextBox] = useState(DEFAULT_TEXT_BOX);
  const [errorCards, setErrorCards] = useState<
    Array<{ id: string; front: string; back: string; rating: number }>
  >([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Индекс карточки, которая уже показана, — по нему проявляем следующую (повтор «Почти» — та же карточка)
  const [shownIndex, setShownIndex] = useState(-1);
  const reverseEnabled = useSettingsStore((s) => s.settings.reverseCards);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const sheetTranslate = useRef(new Animated.Value(-220)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const currentStatus = currentCard ? getCardStatus(currentCard) : 'new';
  const handleSpeak = useCallback((text: string, langHint?: string, counterpart?: string) => {
    const normalized = (text || '').trim();
    if (!normalized) return;
    const lang = resolveSpeechLang(normalized, langHint, counterpart);
    speak(normalized, lang).catch((error) => {
      log.warn('Study', 'TTS error', error);
    });
  }, []);

  // Инициализация сессии
  useEffect(() => {
    let cards: Card[];
    // If dueCardIds passed (cross-set mode from HomeScreen), load those specific cards
    if (dueCardIds && dueCardIds.length > 0) {
      const state = useCardsStore.getState();
      cards = dueCardIds.map((id) => state.cards[id]).filter(Boolean) as Card[];
    } else {
      cards = getCardsBySet(setId);
    }
    const onlyUnmastered = Boolean(onlyHard);

    if (phaseId) {
      // Собираем карточки для фазы: сначала невыполненные ошибки прошлых порций, потом оставшиеся по offset
      const pendingIds = phaseFailedList || [];
      const state = useCardsStore.getState();

      // Получаем ошибочные карточки по ID
      const pendingCards: Card[] = pendingIds
        .map((id) => state.getCard(id))
        .filter((c): c is Card => Boolean(c));

      // Если не смогли найти карточки по ID, пробуем найти их в текущем наборе
      if (pendingIds.length > 0 && pendingCards.length === 0) {
        log.warn('Study', 'Не удалось найти ошибочные карточки по ID, пробуем найти в наборе');
        const pendingSet = new Set(pendingIds);
        const foundInSet = cards.filter((c) => pendingSet.has(c.id));
        pendingCards.push(...foundInSet);
      }

      // Получаем оставшиеся карточки по offset
      const remaining = phaseOffset > 0 ? cards.slice(phaseOffset) : cards;

      // Исключаем из remaining те, что уже есть в pendingCards (ошибочные)
      const pendingIdsSet = new Set(pendingCards.map((c) => c.id));
      const filteredRemaining = remaining.filter((c) => !pendingIdsSet.has(c.id));

      // Собираем уникальные карточки: сначала ошибочные, потом новые
      const map = new Map<string, Card>();
      [...pendingCards, ...filteredRemaining].forEach((card) => {
        if (!map.has(card.id)) {
          map.set(card.id, card);
        }
      });
      cards = Array.from(map.values());

      log.debug('Study', 'Фаза', {
        phaseId,
        phaseOffset,
        pendingIds: pendingIds.length,
        pendingCards: pendingCards.length,
        remaining: filteredRemaining.length,
        total: cards.length,
      });

      // Сохраняем количество ошибочных карточек для правильного расчёта phaseOffset
      pendingCardsInQueueRef.current = pendingCards.length;
    } else {
      pendingCardsInQueueRef.current = 0;
    }

    // Если переданы ошибочные карточки, фильтруем только их
    if (isErrorReview && errorCardsFronts) {
      cards = cards.filter((card) => {
        const front = cardFront(card);
        return errorCardsFronts.includes(front);
      });
      // В фазах повторяем ошибки сразу, без проверки расписания SRS (nextReviewDate)
      if (!phaseId) {
        const now = Date.now();
        cards = cards.filter((card) => card.nextReviewDate <= now);
      }
      // Очищаем список ошибок для новой сессии повторения
      setErrorCards([]);
    }

    // Если выбран режим "Учить всё" + "только не запомнил", оставляем только невыученные
    // НО: исключаем из фильтра ошибочные карточки фазы (phaseFailedIds), они должны быть показаны независимо от nextReviewDate
    if (studyAll && onlyUnmastered) {
      const now = Date.now();
      const failedIdsSet = new Set(phaseFailedList || []);
      cards = cards.filter((card) => {
        // Ошибочные карточки фазы всегда включаем
        if (failedIdsSet.has(card.id)) {
          return true;
        }
        // "Не запомнил" = карточки с nextReview <= сейчас
        return card.nextReviewDate <= now;
      });
    }

    const limitCards = (list: Card[]) => {
      if (!cardLimit) return list;
      // Если используем фазы (phaseId), берём карточки последовательно, без перемешивания
      if (phaseId) {
        return list.slice(0, Math.min(cardLimit, list.length));
      }
      // Без фаз - перемешиваем как раньше
      const shuffled = [...list].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(cardLimit, shuffled.length));
    };

    const queue = isErrorReview
      ? // Для повторения ошибок берем только ошибочные карточки, игнорируя расписание SRS
        cards
      : studyAll
        ? // "Учить всё" — включаем все карточки набора (или выбранное число) вне зависимости от статуса
          limitCards(cards)
        : buildStudyQueue(cards, settings.dailyNewCardsLimit, settings.dailyReviewLimit);

    log.debug('Study', 'Очередь сформирована', {
      queueLength: queue.length,
      cardsLength: cards.length,
      isErrorReview,
      studyAll,
      cardLimit,
      phaseId,
      phaseOffset,
      phaseFailedList: phaseFailedList?.length || 0,
    });

    if (queue.length === 0) {
      log.warn('Study', 'Пустая очередь');

      // Если есть ошибочные карточки, но очередь пустая - это баг, логируем детали
      if (phaseFailedList && phaseFailedList.length > 0) {
        log.error('Study', 'Есть ошибочные карточки, но очередь пустая!', {
          phaseFailedList,
          allCards: getCardsBySet(setId).map((c) => c.id),
        });
      }

      navigation.goBack();
      return;
    }

    baseQueueLengthRef.current = queue.length;
    sessionRetryIdsRef.current = new Set();
    setSessionRetryCount(0);
    startSession(
      {
        setId,
        mode,
        newCardsLimit: settings.dailyNewCardsLimit,
        reviewCardsLimit: settings.dailyReviewLimit,
        shuffleCards: !phaseId, // Не перемешиваем если используем фазы
        prioritizeOverdue: true,
        showTimer: false,
      },
      queue
    );

    setCurrentCard(queue[0]);
    updateLastStudied(setId);

    // На вебе свайпа нет — и подсказки тоже
    if (!swipeHintCheckedRef.current && Platform.OS !== 'web') {
      swipeHintCheckedRef.current = true;
      const hintsLeft = useSettingsStore.getState().settings.swipeHintsLeft;
      if (hintsLeft > 0) {
        updateSettings({ swipeHintsLeft: hintsLeft - 1 });
        DatabaseService.saveSettings();
        setShowSwipeHint(true);
      }
    }
  }, [
    setId,
    errorCardsFronts,
    studyAll,
    cardLimit,
    onlyHard,
    dueCardIds,
    phaseId,
    phaseOffset,
    phaseFailedList,
  ]);

  // Получить текущую карточку из очереди
  useEffect(() => {
    if (session && session.queue[session.currentIndex]) {
      const cardId = session.queue[session.currentIndex];
      const card = useCardsStore.getState().getCard(cardId);
      setCurrentCard(card || null);
      setShownIndex(session.currentIndex);
      cardShownAtRef.current = Date.now();
      // Новая карточка — на месте и лицевой стороной, без анимации переворота
      answeringRef.current = false;
      swipeFlying.value = false;
      swipeX.value = 0;
      swipePastThreshold.value = false;
      flipProgress.value = 0;
    }
  }, [session?.currentIndex]);

  // Новая карточка уже отрисована — проявляем её (после ответа она спрятана). Пауза в пару кадров:
  // на старой архитектуре текст до экрана доходит позже, чем анимация стартует на UI-потоке
  useEffect(() => {
    const duration = reduceMotion ? 0 : CARD_IN_MS;
    cardScale.value = withDelay(CARD_IN_DELAY_MS, withTiming(1, { duration }));
    cardOpacity.value = withDelay(CARD_IN_DELAY_MS, withTiming(1, { duration }));
  }, [shownIndex]);

  // Покачивание карточки — после сброса позиции в эффекте выше, поэтому объявлено ниже него
  useEffect(() => {
    if (!showSwipeHint || reduceMotion) return;
    swipeX.value = withDelay(
      700,
      withSequence(
        withTiming(-28, { duration: 220 }),
        withTiming(28, { duration: 320 }),
        withTiming(0, { duration: 220 })
      )
    );
  }, [showSwipeHint]);

  // Обработка оценки
  const handleRate = useCallback(
    async (rating: Rating, input: 'button' | 'swipe' = 'button') => {
      if (!currentCard || answeringRef.current) {
        // Свайп не засчитан — карточку, спрятанную после вылета, возвращаем
        if (input === 'swipe') {
          swipeFlying.value = false;
          cardScale.value = 1;
          cardOpacity.value = withTiming(1, { duration: CARD_IN_MS });
        }
        return;
      }
      if (input === 'button' && swipeFlying.value) return;
      answeringRef.current = true;
      triggerHaptic('selection');

      // Логика: 1,2 = ошибка, 3,4 = правильно
      const isCorrect = rating >= 3;
      // Повтор слова, на которое ответили «Почти»: в статистику дня, урок и аналитику не идёт —
      // это то же слово. Уровень по-прежнему отправляем, сервер сам решит (plan/done/card_rating.md)
      const isRepeat = Boolean(session) && session!.currentIndex >= baseQueueLengthRef.current;
      // «Почти» — слово ещё раз в конце сессии: один раз и только если после него есть другие слова
      const repeatLater =
        rating === 3 &&
        !isRepeat &&
        Boolean(session) &&
        session!.currentIndex + 1 < session!.queue.length;
      // Сессия: ошибка — то же слово ещё раз в конце очереди, пока не ответят верно (и на повторе тоже)
      const sessionRetry = Boolean(sessionRoute) && Boolean(session) && !isCorrect;
      if (sessionRoute) {
        const retryIds = sessionRetryIdsRef.current;
        if (isCorrect) retryIds.delete(currentCard.id);
        else retryIds.add(currentCard.id);
        setSessionRetryCount(retryIds.size);
      }

      // Analytics: card_answered
      const ratingMap: Record<number, 'again' | 'hard' | 'good' | 'easy'> = {
        1: 'again',
        2: 'hard',
        3: 'good',
        4: 'easy',
      };
      if (!isRepeat) {
        Analytics.cardAnswered({
          correct: isCorrect,
          rating: ratingMap[rating],
          timeSpentMs: Date.now() - cardShownAtRef.current,
          mode: 'flashcard',
          input,
        });
      }

      // Если ошибка, добавляем в список ошибочных карточек (с id для фаз)
      if (!isCorrect) {
        setErrorCards((prev) => [
          ...prev,
          {
            id: currentCard.id,
            front: cardFront(currentCard),
            back: cardBack(currentCard),
            rating,
          },
        ]);
      }

      // Урок дня: считаем по состоянию карточки до ответа
      const lessonPhase =
        lessonPhaseForAnswer(lesson?.part, currentCard) ??
        (sessionRoute ? sessionPhaseForAnswer(currentCard) : null);
      if (lessonPhase && !isRepeat)
        useLessonStore.getState().recordAnswer(lessonPhase, currentCard.id);
      // Самооценка: уровень считает сервер (очков рейтинга она не даёт — план §1.3), экран обновляется сразу
      ProgressService.recordAnswer(currentCard, {
        mode: 'flashcard',
        correct: isCorrect,
        selfRating: rating,
        timeSpentMs: Date.now() - cardShownAtRef.current,
      });
      // Обновляем статистику набора (Запомнил/Не запомнил)
      const statsSnapshot = selectSetStats(setId);
      updateSetStats(setId, {
        cardCount: statsSnapshot.total,
        newCount: statsSnapshot.newCount,
        learningCount: statsSnapshot.learningCount,
        youngCount: statsSnapshot.youngCount,
        matureCount: statsSnapshot.matureCount,
        reviewCount: statsSnapshot.reviewCount,
        masteredCount: statsSnapshot.masteredCount,
      });

      // Обновляем статистику только для правильных ответов (rating >= 3), повтор не считаем
      if (isCorrect && !isRepeat) {
        incrementTodayCards();
      }

      // Переход к следующей карточке
      if (session && session.currentIndex + 1 >= session.queue.length && !sessionRetry) {
        // Переходим на экран результатов
        const totalCards = baseQueueLengthRef.current;
        let finalErrorCards = isCorrect
          ? errorCards
          : [
              ...errorCards,
              {
                id: currentCard.id,
                front: cardFront(currentCard),
                back: cardBack(currentCard),
                rating,
              },
            ];
        // В сессии слово могли ошибиться несколько раз — в итогах считаем его один раз
        if (sessionRoute) {
          const seen = new Set<string>();
          finalErrorCards = finalErrorCards.filter((c) =>
            seen.has(c.id) ? false : (seen.add(c.id), true)
          );
        }
        const learnedCards = totalCards - finalErrorCards.length;
        const timeSpent = Math.floor((Date.now() - session.startedAt) / 1000);
        const errors = finalErrorCards.length;
        const state = useCardsStore.getState();
        const queueCards: Card[] = (session.queue || [])
          .map((id) => state.getCard(id))
          .filter((c): c is Card => Boolean(c));
        const resolveErrorId = (card: { id?: string; front: string; back: string }) => {
          if (card.id) return card.id;
          const match = queueCards.find((c) => {
            const front = cardFront(c);
            const back = cardBack(c);
            return front === card.front && back === card.back;
          });
          return match?.id;
        };
        const errorCardsWithIds = finalErrorCards.map((card) => ({
          ...card,
          id: resolveErrorId(card) ?? card.id,
        }));

        // Обновляем прогресс фазы
        // Считаем сколько НОВЫХ карточек было в этой порции (не включая повторные ошибки)
        const newCardsInBatch = totalCards - pendingCardsInQueueRef.current;
        const newStudiedInPhase = studiedInPhase + learnedCards;
        // phaseOffset увеличивается только на количество НОВЫХ карточек, не на ошибочные
        const newPhaseOffset = isErrorReview ? phaseOffset : phaseOffset + newCardsInBatch;
        const phaseTotal = currentTotalPhaseCards.current || totalCards;
        const resolvedErrorIds = errorCardsWithIds
          .map((c) => c.id)
          .filter((id): id is string => Boolean(id));
        // Если не смогли сопоставить id ошибок, считаем все карточки очереди нерешёнными, чтобы не потерять их в фазе
        const effectiveErrorIds =
          resolvedErrorIds.length === finalErrorCards.length
            ? resolvedErrorIds
            : Array.from(new Set([...(session.queue || []), ...resolvedErrorIds]));
        const errorIds = new Set(effectiveErrorIds);

        // Обновляем список незавершенных карточек фазы: добавляем ошибки и убираем те, что исправлены
        const prevFailed = new Set(phaseFailedList || []);
        const queueIds = session.queue || [];
        queueIds.forEach((id) => {
          if (!errorIds.has(id)) {
            prevFailed.delete(id); // исправили
          }
        });
        effectiveErrorIds.forEach((id) => {
          if (id) {
            prevFailed.add(id);
          }
        });
        // Сессия: все ошибки исправлены в этой же очереди — этап пройден
        const newPhaseFailedIds = sessionRoute ? [] : Array.from(prevFailed);

        log.debug('Study', 'Завершение порции', {
          totalCards,
          newCardsInBatch,
          pendingCardsInQueue: pendingCardsInQueueRef.current,
          learnedCards,
          errors,
          errorCardsWithIds: errorCardsWithIds.map((c) => ({ id: c.id, front: c.front })),
          effectiveErrorIds,
          newPhaseFailedIds,
          newStudiedInPhase,
          newPhaseOffset,
          phaseTotal,
        });

        // Завершаем сессию и проверяем стрик
        const streakResult = await finishStudySession();

        navigation.replace('StudyResults', {
          setId,
          totalCards,
          learnedCards,
          timeSpent,
          errors,
          errorCards: errorCardsWithIds,
          modeTitle: 'Карточки',
          cardLimit,
          dueCardIds,
          nextMode: 'study',
          // Параметры фазы
          phaseId: currentPhaseId.current,
          totalPhaseCards: phaseTotal,
          studiedInPhase: newStudiedInPhase,
          phaseOffset: newPhaseOffset,
          phaseFailedIds: newPhaseFailedIds,
          onlyHard,
          // Streak celebration
          streakIncreased: streakResult.streakIncreased,
          newStreakCount: streakResult.newStreakCount,
          lesson,
          session: sessionRoute,
        });
      } else {
        // Отвеченную карточку прячем до смены текста — следующую проявит эффект на shownIndex
        cardOpacity.value = 0;
        cardScale.value = 0.96;
        useStudyStore.setState((s) => ({
          ...s,
          session: s.session
            ? {
                ...s.session,
                currentIndex: s.session.currentIndex + 1,
                // Повтор «Почти» и ошибка в сессии — в конец очереди; знаменатель прогресса растёт, чтобы полоса не ушла за 100%
                ...(repeatLater || sessionRetry
                  ? {
                      queue: [...s.session.queue, currentCard.id],
                      totalCards: s.session.totalCards + 1,
                    }
                  : {}),
              }
            : null,
          isFlipped: false,
        }));
      }
    },
    [
      currentCard,
      incrementTodayCards,
      session,
      setId,
      updateSetStats,
      navigation,
      errorCards,
      studiedInPhase,
      phaseOffset,
      isErrorReview,
      lesson,
      sessionRoute,
    ]
  );

  const openSettings = useCallback(() => {
    sheetTranslate.setValue(-220);
    backdropOpacity.setValue(0);
    setIsSettingsOpen(true);

    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(sheetTranslate, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  }, [backdropOpacity, sheetTranslate]);

  const closeSettings = useCallback(() => {
    Animated.parallel([
      Animated.timing(sheetTranslate, { toValue: -220, duration: 180, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setIsSettingsOpen(false));
  }, [backdropOpacity, sheetTranslate]);

  const handleToggleReverse = useCallback(
    (value: boolean) => {
      updateSettings({ reverseCards: value });
      DatabaseService.saveSettings();
    },
    [updateSettings]
  );

  // Переворот карточки (переключение туда-обратно)
  const handleToggleCard = useCallback(() => {
    triggerHaptic('selection');
    if (isFlipped) {
      hideAnswer();
    } else {
      showAnswer();
    }
  }, [hideAnswer, isFlipped, showAnswer]);

  // Завершить сессию (досрочный выход)
  const handleFinish = useCallback(() => {
    if (session) {
      Analytics.studySessionAbandoned({
        setId,
        mode: 'flashcard',
        cardsCompleted: session.currentIndex,
        totalCards: session.queue.length,
        timeSpentSec: Math.round((Date.now() - session.startedAt) / 1000),
      });
    }
    finishStudySession();
    endSession();
    if (sessionRoute) navigation.navigate('SetDetail', { setId: sessionRoute.setId });
    else navigation.goBack();
  }, [finishStudySession, endSession, navigation, session, setId, sessionRoute]);

  // Сохраняем активность при уходе в background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        finishStudySession();
      }
    });
    return () => sub.remove();
  }, [finishStudySession]);

  // Прогресс
  const progress = getProgress();

  useEffect(() => {
    flipProgress.value = withTiming(isFlipped ? 1 : 0, {
      duration: 400,
      easing: REasing.inOut(REasing.ease),
    });
  }, [isFlipped]);

  const frontAnimStyle = useAnimatedStyle(() => {
    'worklet';
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [1, 1, 0, 0]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden' as const,
    };
  });

  const backAnimStyle = useAnimatedStyle(() => {
    'worklet';
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [0, 0, 1, 1]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden' as const,
    };
  });

  // Свайп влево — «Не знаю», вправо — «Уверенно»; работает на обеих сторонах (plan/done/card_rating.md).
  // Касание ловит Pressable карточки — протягивание его отменяет. На вебе только кнопки
  const handleSwipe = useCallback(
    (direction: number) => {
      // Свайп освоен — подсказка больше не нужна
      if (useSettingsStore.getState().settings.swipeHintsLeft > 0) {
        updateSettings({ swipeHintsLeft: 0 });
        DatabaseService.saveSettings();
      }
      handleRate(direction > 0 ? 4 : 1, 'swipe');
    },
    [handleRate, updateSettings]
  );

  const cardSwipeGesture = Gesture.Pan()
    .enabled(Platform.OS !== 'web' && !isSettingsOpen)
    .activeOffsetX([-15, 15])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      if (swipeFlying.value) return;
      swipeX.value = e.translationX;
      const past = Math.abs(e.translationX) >= SWIPE_DISTANCE;
      if (past !== swipePastThreshold.value) {
        swipePastThreshold.value = past;
        runOnJS(triggerHaptic)('selection');
      }
    })
    .onEnd((e) => {
      if (swipeFlying.value) return;
      const flick =
        Math.abs(e.velocityX) > SWIPE_VELOCITY &&
        Math.sign(e.velocityX) === Math.sign(e.translationX);
      if (Math.abs(e.translationX) < SWIPE_DISTANCE && !flick) {
        swipeX.value = withSpring(0, { damping: 18, stiffness: 220 });
        swipePastThreshold.value = false;
        return;
      }
      const direction = e.translationX > 0 ? 1 : -1;
      swipeFlying.value = true;
      swipeX.value = withTiming(
        direction * SCREEN_WIDTH * 1.2,
        { duration: SWIPE_OUT_MS },
        (finished) => {
          if (!finished) return;
          // Улетела — прячем и возвращаем в центр лицом в одном кадре, пока на экране ещё её текст
          cardOpacity.value = 0;
          cardScale.value = 0.96;
          swipeX.value = 0;
          flipProgress.value = 0;
          runOnJS(handleSwipe)(direction);
        }
      );
    });

  const swipeStyle = useAnimatedStyle(() => {
    'worklet';
    const rotate = interpolate(
      swipeX.value,
      [-CARD_WIDTH, 0, CARD_WIDTH],
      [-12, 0, 12],
      Extrapolation.CLAMP
    );
    return {
      opacity: cardOpacity.value,
      transform: [
        { translateX: swipeX.value },
        { rotate: `${rotate}deg` },
        { scale: cardScale.value },
      ],
    };
  });
  // Подписи свайпа проступают вместе со сдвигом и на пороге видны полностью
  const swipeLeftStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: interpolate(-swipeX.value, [0, SWIPE_DISTANCE], [0, 1], Extrapolation.CLAMP),
    };
  });
  const swipeRightStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: interpolate(swipeX.value, [0, SWIPE_DISTANCE], [0, 1], Extrapolation.CLAMP) };
  });

  // Заранее озвучиваем вопрос и ответ текущей и следующей карточки — кнопка динамика играет сразу
  useEffect(() => {
    if (!session) return;
    const ids = [
      session.queue[session.currentIndex],
      session.queue[session.currentIndex + 1],
    ].filter(Boolean);
    const items: Array<{ text: string; lang: string }> = [];
    for (const id of ids) {
      const card = useCardsStore.getState().cards[id];
      if (!card || !isCardSpeakable(card)) continue;
      const langs = cardSpeechLangs(card);
      const front = cardFront(card).trim();
      const back = cardBack(card).trim();
      if (front) items.push({ text: front, lang: resolveSpeechLang(front, langs.front, back) });
      if (back) items.push({ text: back, lang: resolveSpeechLang(back, langs.back, front) });
    }
    prefetchSpeech(items);
  }, [session?.currentIndex, session?.queue]);

  // Загрузка
  if (!currentCard) {
    return <Loading fullScreen message="Подготовка карточек..." />;
  }

  const baseFront = cardFront(currentCard);
  const baseBack = cardBack(currentCard);
  const example = (currentCard as any).example ?? '';

  const questionText = reverseEnabled ? baseBack : baseFront;
  const answerText = reverseEnabled ? baseFront : baseBack;
  // Длинный текст — шрифт мельче, чтобы не выходил за карточку
  const questionFit = fitText(questionText, {
    width: textBox.width,
    height: textBox.front,
    weight: 'bold',
    ...WORD_FIT,
  });
  const answerFit = fitWordWithExample(answerText, example, {
    width: textBox.width,
    height: textBox.back,
    gap: EXAMPLE_GAP,
    word: WORD_FIT,
    example: EXAMPLE_FIT,
  });
  const measureTextBox = (side: 'front' | 'back') => (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const sideHeight = height - spacing.xxs;
    setTextBox((box) =>
      box.width === width && box[side] === sideHeight ? box : { ...box, width, [side]: sideHeight }
    );
  };
  const { front: frontLang, back: backLang } = cardSpeechLangs(currentCard);
  const questionLang = reverseEnabled ? backLang : frontLang;
  const answerLang = reverseEnabled ? frontLang : backLang;
  const canSpeak = isCardSpeakable(currentCard);

  // Кнопки оценки: цвета оценок SRS, текст — «текстовые» токены; «Уверенно» — главная кнопка.
  // Оценки 2 («Сомневаюсь») больше нет, сервер её по-прежнему принимает от старых версий (plan/done/card_rating.md)
  const ratingOptions: Array<{ rating: Rating; label: string; bg: string; text: string }> = [
    { rating: 1, label: 'Не знаю', bg: alpha(colors.ratingAgain, 10), text: colors.errorText },
    { rating: 3, label: 'Почти', bg: alpha(colors.ratingEasy, 10), text: colors.info },
    { rating: 4, label: 'Уверенно', bg: colors.primaryFill, text: colors.onPrimary },
  ];

  const renderCardTop = (onSpeak: () => void) => (
    <View style={styles.cardTopRow}>
      <View style={styles.statusPlaceholder}>
        {/* Статус слова — тот же кружок, что в наборе; у нового слова пусто */}
        {currentStatus !== 'new' ? <StatusBadge status={currentStatus} /> : null}
      </View>
      {canSpeak ? (
        <Pressable
          style={({ pressed }) => [
            styles.audioButton,
            { backgroundColor: pressed ? alpha(colors.primary, 20) : colors.surfaceMuted },
          ]}
          hitSlop={spacing.xxs}
          accessibilityRole="button"
          accessibilityLabel="Прослушать"
          onPress={(e) => {
            e.stopPropagation();
            triggerHaptic('selection');
            onSpeak();
          }}
        >
          <Volume2 size={iconSize.s} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <StageLayout
      session={sessionRoute}
      progress={
        sessionRoute
          ? // Повтор «Почти» в конце очереди не двигает полоску этапа: считаем только основную очередь
            sessionStageProgress(
              studiedInPhase,
              Math.min(Math.max(0, progress.current - 1), baseQueueLengthRef.current),
              sessionRetryCount,
              currentTotalPhaseCards.current || baseQueueLengthRef.current
            )
          : { done: Math.max(0, progress.current - 1), total: progress.total }
      }
      task="Вспомни перевод"
      taskAction={
        <Button
          variant="icon"
          icon={Settings}
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel="Настройки"
          onPress={openSettings}
        />
      }
      onExit={handleFinish}
      showIntro={phaseOffset === 0 && !phaseFailedIds?.length}
      scroll={false}
      footer={
        <View>
          <Text
            variant="bodySmall"
            align="center"
            style={[styles.rateHint, { color: colors.textSecondary }]}
          >
            Оцени, насколько уверенно знаешь
          </Text>
          <View style={styles.ratingGrid}>
            {ratingOptions.map(({ rating, label, bg, text }) => (
              <Pressable
                key={rating}
                onPress={() => handleRate(rating)}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={({ pressed }) => [
                  styles.ratingButton,
                  { backgroundColor: bg },
                  pressed && styles.pressed,
                ]}
              >
                <Text variant="label" numberOfLines={1} style={{ color: text }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      }
    >
      {/* Основной контент */}
      <View style={styles.mainContent}>
        {/* Флеш-карточка */}
        <GestureDetector gesture={cardSwipeGesture}>
          <ReAnimated.View style={swipeStyle}>
            <FlashcardFace
              colors={colors}
              session={session}
              isFlipped={isFlipped}
              handleToggleCard={handleToggleCard}
              handleSpeak={handleSpeak}
              renderCardTop={renderCardTop}
              measureTextBox={measureTextBox}
              questionText={questionText}
              answerText={answerText}
              example={example}
              questionLang={questionLang}
              answerLang={answerLang}
              questionFit={questionFit}
              answerFit={answerFit}
              frontAnimStyle={frontAnimStyle}
              backAnimStyle={backAnimStyle}
              swipeLeftStyle={swipeLeftStyle}
              swipeRightStyle={swipeRightStyle}
              showSwipeHint={showSwipeHint}
            />
          </ReAnimated.View>
        </GestureDetector>
      </View>

      <StudySettingsModal
        colors={colors}
        isSettingsOpen={isSettingsOpen}
        closeSettings={closeSettings}
        backdropOpacity={backdropOpacity}
        sheetTranslate={sheetTranslate}
        insets={insets}
        reverseEnabled={reverseEnabled}
        handleToggleReverse={handleToggleReverse}
      />
    </StageLayout>
  );
}
