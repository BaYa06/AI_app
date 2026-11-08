/**
 * Multiple Choice Screen
 * @description Экран выбора перевода
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, ScrollView, AppState } from 'react-native';
import { triggerHaptic } from '@/utils/haptic';
import { Layers } from 'lucide-react-native';
import { Container, Text, Loading } from '@/components/common';
import {
  Button,
  CelebrationIcon,
  EmptyState,
  ProgressBar,
  ScreenHeader,
  type CelebrationKind,
} from '@/components/ui';
import {
  useCardsStore,
  useSetsStore,
  useThemeColors,
  useSettingsStore,
  selectSetStats,
} from '@/store';
import { ProgressService } from '@/services/ProgressService';
import { lessonPhaseForAnswer, sessionPhaseForAnswer } from '@/services/lessonFlow';
import { useLessonStore } from '@/store/lessonStore';
import { reportWidgetReview } from '@/services/WidgetService';
import {
  speak,
  resolveSpeechLang,
  prefetchSpeech,
  cardSpeechLangs,
  isCardSpeakable,
} from '@/utils/speech';
import { playCorrectSound, playSessionSfx, preloadSessionSfx, preloadSound } from '@/utils/sound';
import { buildDistractorPool, pickSimilarDistractors } from '@/utils/choiceDistractors';
import { Analytics } from '@/services/analytics';
import { useChallengeStore } from '@/store';
import { StageLayout, AnswerPanel, sessionStageProgress } from '@/components/study/StageLayout';
import { isSubjectSet } from '@/utils/setKind';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card, Rating } from '@/types';
import { pluralize } from '@/utils';
import { log } from '@/utils/logger';
import { cardFront, cardBack } from '@/utils/cardText';
import { styles } from './multipleChoice/styles';
import { type ChallengeResult, type OptionState, type Option } from './multipleChoice/types';
import { QuestionView } from './multipleChoice/QuestionView';

type Props = RootStackScreenProps<'MultipleChoice'>;

export function MultipleChoiceScreen({ navigation, route }: Props) {
  const {
    setId,
    cardLimit,
    dueCardIds,
    phaseId,
    totalPhaseCards,
    studiedInPhase = 0,
    phaseOffset = 0,
    phaseFailedIds,
    challengeMode,
    timeLimit: paramTimeLimit,
    sniperMode,
    forgottenMode,
    lesson,
    session,
    listen,
  } = route.params;
  const colors = useThemeColors();
  const set = useSetsStore((s) => s.getSet(setId));
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const incrementTodayCards = useSettingsStore((s) => s.incrementTodayCards);
  const finishStudySession = useSettingsStore((s) => s.finishStudySession);

  // Мемоизируем список ошибочных карточек из фазы
  const phaseFailedList = useMemo(
    () => phaseFailedIds || [],
    [phaseFailedIds ? phaseFailedIds.join('|') : '']
  );
  const initKey = useMemo(
    () =>
      [
        setId,
        cardLimit ?? 'all',
        phaseId || 'noPhase',
        phaseOffset,
        phaseFailedList.join(','),
      ].join('|'),
    [setId, cardLimit, phaseId, phaseOffset, phaseFailedList]
  );

  // Генерируем phaseId при первом запуске (если не передан)
  const currentPhaseId = useRef(
    phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);
  // Количество ошибочных карточек из прошлых порций в текущей очереди
  const pendingCardsInQueueRef = useRef(0);
  // Сессия «Изучить»: вопросов в порции без повторов и слова с ошибкой, ещё не исправленные.
  // Ошибка уходит в конец той же очереди — экран не закрывается ради новой порции
  const baseQuestionsRef = useRef(0);
  const sessionRetryIdsRef = useRef<Set<string>>(new Set());
  const [sessionRetryCount, setSessionRetryCount] = useState(0);

  const [questions, setQuestions] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [errors, setErrors] = useState(0);
  const [errorCards, setErrorCards] = useState<
    Array<{ id: string; front: string; back: string; rating: number }>
  >([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const cardShownAtRef = useRef<number>(Date.now());

  // Challenge mode state
  const [timeLeft, setTimeLeft] = useState(paramTimeLimit ?? 120);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult>(null);

  // Обычный тест (не мини-игра главной): общий скелет режима, после ответа — панель с кнопкой
  const isPlainTest = !challengeMode && !sniperMode && !forgottenMode;
  // «На слух» (этап сессии): вместо слова звучит озвучка, варианты — сами слова
  const isListen = isPlainTest && !!listen;
  // Озвучка — только когда экран «Этап N из M» ушёл, иначе она звучит под ним
  const [introDone, setIntroDone] = useState(false);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    nextErrors: number;
    updatedErrorCards: Array<{ id: string; front: string; back: string; rating: number }>;
  } | null>(null);

  // Sniper mode state
  const [sniperStreak, setSniperStreak] = useState(0);
  const TARGET_STREAK = 5;

  const getFront = (card: Card) => cardFront(card);
  const getBack = (card: Card) => cardBack(card);

  // Ответ в тесте: уровень карточки считает сервер (сверяет выбранный вариант), экран обновляется сразу
  const applySrsUpdate = React.useCallback(
    (card: Card, isCorrect: boolean, chosenCardId: string, timeSpentMs: number) => {
      // Урок дня: считаем по состоянию карточки до ответа
      const lessonPhase =
        lessonPhaseForAnswer(lesson?.part, card) ?? (session ? sessionPhaseForAnswer(card) : null);
      if (lessonPhase) useLessonStore.getState().recordAnswer(lessonPhase, card.id);
      // Замер виджета (plan/new/widgets.md, 4.1): точность на словах из виджета и контрольной половины
      if (lessonPhase === 'review') reportWidgetReview(card.id, isCorrect);
      ProgressService.recordAnswer(card, {
        mode: 'test',
        correct: isCorrect,
        chosen: chosenCardId,
        timeSpentMs,
      });

      if (isCorrect) {
        incrementTodayCards();
      }

      const statsSnapshot = selectSetStats(card.setId);
      updateSetStats(card.setId, {
        cardCount: statsSnapshot.total,
        newCount: statsSnapshot.newCount,
        learningCount: statsSnapshot.learningCount,
        youngCount: statsSnapshot.youngCount,
        matureCount: statsSnapshot.matureCount,
        reviewCount: statsSnapshot.reviewCount,
        masteredCount: statsSnapshot.masteredCount,
      });
    },
    [updateSetStats, incrementTodayCards, lesson?.part, session]
  );

  const shuffle = <T,>(arr: T[]): T[] => {
    return arr
      .map((item) => ({ item, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ item }) => item);
  };

  useEffect(() => {
    const state = useCardsStore.getState();
    let cards: Card[];
    if (dueCardIds && dueCardIds.length > 0) {
      cards = dueCardIds.map((id) => state.cards[id]).filter(Boolean) as Card[];
    } else {
      const ids = state.cardsBySet[setId] || [];
      const now = Date.now();
      cards = ids
        .map((id) => state.cards[id])
        .filter((c): c is Card => Boolean(c) && c.nextReviewDate <= now);
    }

    let questionCards: Card[] = [];

    if (phaseId) {
      // Собираем карточки для фазы: сначала ошибочные из прошлых порций, потом новые по offset
      const pendingIds = phaseFailedList || [];

      // Получаем ошибочные карточки по ID
      const pendingCards: Card[] = pendingIds
        .map((id) => cards.find((c) => c.id === id))
        .filter((c): c is Card => Boolean(c));

      // Получаем оставшиеся карточки по offset
      const remaining = phaseOffset > 0 ? cards.slice(phaseOffset) : cards;

      // Исключаем из remaining те, что уже есть в pendingCards
      const pendingIdsSet = new Set(pendingCards.map((c) => c.id));
      const filteredRemaining = remaining.filter((c) => !pendingIdsSet.has(c.id));

      // Собираем: сначала ошибочные, потом новые
      const combined = [...pendingCards, ...filteredRemaining];

      // Применяем лимит
      const limited = cardLimit && cardLimit > 0 ? combined.slice(0, cardLimit) : combined;
      questionCards = shuffle(limited);

      // Сохраняем количество ошибочных карточек в очереди
      const pendingInQueue = limited.filter((c) => pendingIdsSet.has(c.id)).length;
      pendingCardsInQueueRef.current = pendingInQueue;

      log.debug('MultipleChoice', 'Фаза', {
        phaseId,
        phaseOffset,
        pendingIds: pendingIds.length,
        pendingCards: pendingCards.length,
        remaining: filteredRemaining.length,
        pendingInQueue,
        total: questionCards.length,
      });
    } else {
      // Без фазы - просто берём карточки
      const availableCards = cards.slice(phaseOffset);
      const limited =
        !cardLimit || cardLimit <= 0 ? availableCards : availableCards.slice(0, cardLimit);
      questionCards = shuffle(limited);
      pendingCardsInQueueRef.current = 0;
    }

    // Одна карточка — один вопрос: дубли давали повторяющиеся варианты с одинаковым key,
    // и React не убирал старые кнопки (вариантов становилось 5, 6, …)
    const seen = new Set<string>();
    questionCards = questionCards.filter((c) => !seen.has(c.id) && seen.add(c.id));

    setQuestions(questionCards);
    baseQuestionsRef.current = questionCards.length;
    sessionRetryIdsRef.current = new Set();
    setSessionRetryCount(0);
    setCurrentIndex(0);
    setSelectedOption(null);
    setShowResult(false);
    setErrors(0);
    setErrorCards([]);
    startedAtRef.current = Date.now();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [initKey, phaseFailedList, phaseId, phaseOffset, cardLimit, setId, dueCardIds]);

  // Обработчик озвучивания
  const handleSpeak = React.useCallback(
    (text: string, counterpartText?: string, langHint?: string, rate?: number) => {
      if (!text) return;
      const normalized = text.trim().split(/\r?\n/)[0].trim();
      if (!normalized) return;
      const lang = resolveSpeechLang(normalized, langHint, counterpartText);
      speak(normalized, lang, rate ? { rate } : undefined).catch((error) => {
        log.warn('MultipleChoice', 'Speech error', error);
      });
    },
    []
  );

  const totalQuestions = questions.length;
  const currentCard = questions[currentIndex];

  // Заранее озвучиваем слово текущей и следующей карточки — кнопка динамика играет сразу
  useEffect(() => {
    const upcoming = [questions[currentIndex], questions[currentIndex + 1]].filter(
      (c): c is Card => !!c && isCardSpeakable(c)
    );
    prefetchSpeech(
      upcoming.map((c) => ({
        text: getFront(c),
        counterpart: getBack(c),
        lang: cardSpeechLangs(c).front,
      }))
    );
  }, [questions, currentIndex]);
  const playWord = React.useCallback(
    (slow = false) => {
      if (!currentCard) return;
      handleSpeak(
        getFront(currentCard),
        getBack(currentCard),
        cardSpeechLangs(currentCard).front,
        slow ? 0.6 : undefined
      );
    },
    [currentCard, handleSpeak]
  );
  // «На слух»: слово звучит само при каждом новом вопросе
  useEffect(() => {
    if (!isListen || !introDone || !currentCard) return;
    const timer = setTimeout(() => playWord(), 250);
    return () => clearTimeout(timer);
  }, [isListen, introDone, currentCard?.id, currentIndex]);

  const progressPercent = totalQuestions
    ? Math.round(((currentIndex + 1) / totalQuestions) * 100)
    : 0;

  const options = useMemo(() => {
    if (!currentCard) return [];
    // Неверные варианты — из всего набора (не только из порции) и похожие на правильный ответ
    const { cards: cardsMap, cardsBySet } = useCardsStore.getState();
    const pool = buildDistractorPool(
      currentCard,
      cardsBySet,
      cardsMap,
      useSetsStore.getState().sets
    );
    const distractors = pickSimilarDistractors(currentCard, pool, 3);
    const baseOptions = shuffle([currentCard, ...distractors]).slice(0, 4);
    const labels = ['A', 'B', 'C', 'D'];

    return baseOptions.map((card, idx) => ({
      id: card.id,
      label: labels[idx] || '?',
      text: isListen ? getFront(card) : getBack(card),
      isCorrect: card.id === currentCard.id,
    }));
  }, [currentCard, questions, isListen]);

  const optionState = (option: Option): OptionState => {
    if (!showResult) return 'neutral';
    if (option.isCorrect) return 'correct';
    if (selectedOption === option.id) return 'wrong';
    return 'neutral';
  };

  // Предзагружаем звук при монтировании компонента
  // В сессии — свои звуки ответа (plan/new/session_results.md), в свободной практике — прежний
  useEffect(() => {
    if (session) preloadSessionSfx(['correct', 'error']);
    else preloadSound('/correct.wav');
  }, []);

  // Analytics: сбрасываем таймер при переходе к следующей карточке
  useEffect(() => {
    cardShownAtRef.current = Date.now();
  }, [currentIndex]);

  // Challenge timer
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleTimeUp = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setChallengeResult({ finished: false, timesUp: true });
  }, []);

  useEffect(() => {
    if (!challengeMode || sniperMode || forgottenMode) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [challengeMode, sniperMode, forgottenMode, handleTimeUp]);

  const restartChallenge = useCallback(() => {
    setChallengeResult(null);
    setCurrentIndex(0);
    setErrors(0);
    setErrorCards([]);
    setSelectedOption(null);
    setShowResult(false);
    setTimeLeft(paramTimeLimit ?? 120);
    startedAtRef.current = Date.now();
    // Restart timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [paramTimeLimit, handleTimeUp]);

  const finishQuiz = React.useCallback(
    async (
      errorsCount: number,
      errorList: Array<{ id: string; front: string; back: string; rating: number }>
    ) => {
      const timeSpent = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      // В сессии очередь растёт за счёт повторов ошибок — итоги по исходной порции
      const portionTotal = session ? baseQuestionsRef.current : totalQuestions;
      const learnedCards = Math.max(0, portionTotal - errorsCount);

      // Считаем сколько НОВЫХ карточек было в этой порции
      const newCardsInBatch = portionTotal - pendingCardsInQueueRef.current;

      // Обновляем прогресс фазы
      const newStudiedInPhase = studiedInPhase + learnedCards;
      // phaseOffset увеличивается только на количество НОВЫХ карточек
      const newPhaseOffset = phaseOffset + newCardsInBatch;
      const phaseTotal = currentTotalPhaseCards.current || portionTotal;

      // Собираем ID ошибочных карточек
      const errorIds = new Set(errorList.map((c) => c.id).filter(Boolean));

      // Обновляем список незавершенных карточек фазы
      const prevFailed = new Set(phaseFailedList || []);
      // Убираем те, что исправили (были в очереди, но не в ошибках)
      questions.forEach((card) => {
        if (!errorIds.has(card.id)) {
          prevFailed.delete(card.id);
        }
      });
      // Добавляем новые ошибки
      errorIds.forEach((id) => {
        if (id) {
          prevFailed.add(id);
        }
      });
      // Сессия: все ошибки исправлены в этой же очереди — этап пройден
      const newPhaseFailedIds = session ? [] : Array.from(prevFailed);

      log.debug('MultipleChoice', 'Завершение порции', {
        totalQuestions,
        newCardsInBatch,
        pendingCardsInQueue: pendingCardsInQueueRef.current,
        learnedCards,
        errorsCount,
        errorIds: Array.from(errorIds),
        newPhaseFailedIds,
        newStudiedInPhase,
        newPhaseOffset,
        phaseTotal,
      });

      // Серия: результат нужен экрану итогов — там праздник, если день засчитан впервые
      const streakResult = await finishStudySession();

      navigation.replace('StudyResults', {
        setId,
        totalCards: portionTotal,
        learnedCards,
        timeSpent,
        errors: errorsCount,
        errorCards: errorList,
        modeTitle: 'Тест',
        cardLimit,
        dueCardIds,
        nextMode: 'multipleChoice',
        // Параметры фазы
        phaseId: currentPhaseId.current,
        totalPhaseCards: phaseTotal,
        studiedInPhase: newStudiedInPhase,
        phaseOffset: newPhaseOffset,
        phaseFailedIds: newPhaseFailedIds,
        streakIncreased: streakResult.streakIncreased,
        newStreakCount: streakResult.newStreakCount,
        lesson,
        session,
      });
    },
    [
      finishStudySession,
      navigation,
      setId,
      totalQuestions,
      cardLimit,
      dueCardIds,
      studiedInPhase,
      phaseOffset,
      phaseFailedList,
      questions,
      lesson,
      session,
    ]
  );

  const handleSelectOption = (option: Option) => {
    if (!currentCard || selectedOption) return;

    const isCorrect = option.isCorrect;
    const rating: Rating = isCorrect ? 3 : 2;

    Analytics.cardAnswered({
      correct: isCorrect,
      timeSpentMs: Date.now() - cardShownAtRef.current,
      mode: 'quiz',
    });
    const nextErrors = errors + (isCorrect ? 0 : 1);
    const updatedErrorCards = isCorrect
      ? errorCards
      : [
          ...errorCards,
          {
            id: currentCard.id,
            front: getFront(currentCard),
            back: getBack(currentCard),
            rating,
          },
        ];

    // Ответ записывается и в мини-играх: они сначала берут слова, которым пришло время повторения,
    // и так незаметно повторяют их (план §3.2). Повторный ответ раньше срока уровень не меняет.
    applySrsUpdate(currentCard, isCorrect, option.id, Date.now() - cardShownAtRef.current);
    if (isCorrect) {
      triggerHaptic('notificationSuccess');
      if (session) playSessionSfx('correct');
      else playCorrectSound();
    } else {
      triggerHaptic('notificationError');
      if (session) playSessionSfx('error');
    }

    setSelectedOption(option.id);
    setShowResult(true);
    if (!isCorrect) {
      setErrors(nextErrors);
      setErrorCards(updatedErrorCards);
    }

    // ── Sniper mode ──
    if (sniperMode) {
      if (isCorrect) {
        const newStreak = sniperStreak + 1;
        setSniperStreak(newStreak);
        if (newStreak >= TARGET_STREAK) {
          useChallengeStore.getState().completeChallenge('sniper');
          timeoutRef.current = setTimeout(() => {
            setChallengeResult({ finished: true, timesUp: false });
          }, 650);
          return;
        }
      } else {
        setSniperStreak(0);
      }

      timeoutRef.current = setTimeout(
        () => {
          if (isCorrect) {
            // Advance to next card, or loop if at end
            const isLast = currentIndex >= totalQuestions - 1;
            if (isLast) {
              // Reshuffle and restart from 0
              setQuestions((prev) => {
                const shuffled = [...prev];
                for (let i = shuffled.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                return shuffled;
              });
              setCurrentIndex(0);
            } else {
              setCurrentIndex((idx) => idx + 1);
            }
          }
          // Wrong answer: stay on same card (don't change currentIndex)
          setSelectedOption(null);
          setShowResult(false);
        },
        isCorrect ? 650 : 1000
      );
      return;
    }

    // ── Forgotten mode ──
    if (forgottenMode) {
      const isLast = currentIndex >= totalQuestions - 1;
      timeoutRef.current = setTimeout(() => {
        if (isLast) {
          const correctCount = totalQuestions - nextErrors;
          // Награда только за раунд без единой ошибки
          if (correctCount === totalQuestions) {
            useChallengeStore.getState().completeChallenge('forgotten');
          }
          setChallengeResult({
            finished: true,
            timesUp: false,
            correct: correctCount,
            total: totalQuestions,
          });
          return;
        }
        setCurrentIndex((idx) => idx + 1);
        setSelectedOption(null);
        setShowResult(false);
      }, 1000);
      return;
    }

    // ── Quick round challenge: fail immediately on first error ──
    if (challengeMode && !isCorrect) {
      timeoutRef.current = setTimeout(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setChallengeResult({
          finished: false,
          timesUp: false,
          correct: currentIndex,
          total: totalQuestions,
          timeSpent: (paramTimeLimit ?? 120) - timeLeft,
        });
      }, 650);
      return;
    }

    // Обычный тест: дальше — по кнопке в нижней панели (handleNextQuestion)
    if (isPlainTest) {
      if (session) {
        const retryIds = sessionRetryIdsRef.current;
        if (isCorrect) retryIds.delete(currentCard.id);
        else retryIds.add(currentCard.id);
        setSessionRetryCount(retryIds.size);
      }
      setFeedback({ correct: isCorrect, nextErrors, updatedErrorCards });
      return;
    }

    const isLast = currentIndex >= totalQuestions - 1;
    timeoutRef.current = setTimeout(() => {
      if (isLast) {
        if (challengeMode) {
          // All correct — challenge won!
          if (timerRef.current) clearInterval(timerRef.current);
          useChallengeStore.getState().completeChallenge('quick_round');
          setChallengeResult({
            finished: true,
            timesUp: false,
            correct: totalQuestions,
            total: totalQuestions,
            timeSpent: (paramTimeLimit ?? 120) - timeLeft,
          });
          return;
        }
        finishQuiz(nextErrors, updatedErrorCards);
        return;
      }
      setCurrentIndex((idx) => idx + 1);
      setSelectedOption(null);
      setShowResult(false);
    }, 650);
  };

  const handleNextQuestion = () => {
    if (!feedback) return;
    // Сессия: ошибка — тот же вопрос ещё раз в конце очереди, пока не ответят верно.
    // Добавляем здесь, а не при ответе: иначе варианты текущего вопроса перемешались бы на глазах
    const retry = !!session && !feedback.correct && !!currentCard;
    if (!retry && currentIndex >= totalQuestions - 1) {
      if (session) {
        // Слово могли ошибиться несколько раз — в итогах считаем его один раз
        const seen = new Set<string>();
        const unique = feedback.updatedErrorCards.filter((c) =>
          seen.has(c.id) ? false : (seen.add(c.id), true)
        );
        finishQuiz(unique.length, unique);
        return;
      }
      finishQuiz(feedback.nextErrors, feedback.updatedErrorCards);
      return;
    }
    if (retry) setQuestions((prev) => [...prev, currentCard]);
    setFeedback(null);
    setCurrentIndex((idx) => idx + 1);
    setSelectedOption(null);
    setShowResult(false);
  };

  // Сохраняем активность при уходе в background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        finishStudySession();
      }
    });
    return () => sub.remove();
  }, [finishStudySession]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // До раннего return: хуки вызываются в одном порядке на каждом рендере
  const handleClose = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    finishStudySession();
    navigation.navigate('Main', { screen: 'Home' });
  }, [challengeMode, finishStudySession, navigation]);

  if (!set) {
    return <Loading fullScreen message="Загрузка..." />;
  }

  const screenTitle = sniperMode
    ? 'Снайпер'
    : forgottenMode
      ? 'Вспомни забытое'
      : challengeMode
        ? 'Быстрый раунд'
        : 'Тест';

  if (!totalQuestions) {
    return (
      <Container padded={false}>
        <ScreenHeader title={screenTitle} onBack={() => navigation.goBack()} />
        <EmptyState
          icon={Layers}
          title="Нет карточек для игры"
          description="Добавь карточки в набор, чтобы начать тест"
        />
      </Container>
    );
  }

  // Итоговый экран мини-игры: иконка → заголовок → текст → кнопки
  const renderChallengeResult = ({
    kind,
    title,
    subtitle,
    onRetry,
  }: {
    kind: CelebrationKind;
    title: string;
    subtitle: string;
    onRetry?: () => void;
  }) => (
    <Container padded={false}>
      <View style={styles.challengeResultContainer}>
        <CelebrationIcon kind={kind} style={styles.challengeResultIcon} />
        <Text
          variant="h2"
          align="center"
          accessibilityRole="header"
          style={[styles.challengeResultTitle, { color: colors.textPrimary }]}
        >
          {title}
        </Text>
        <Text
          variant="body"
          align="center"
          style={[styles.challengeResultSubtitle, { color: colors.textSecondary }]}
        >
          {subtitle}
        </Text>
        <View style={styles.challengeResultButtons}>
          {onRetry ? <Button title="Повторить" onPress={onRetry} fullWidth /> : null}
          <Button
            variant={onRetry ? 'secondary' : 'primary'}
            title="Закрыть"
            onPress={handleClose}
            fullWidth
          />
        </View>
      </View>
    </Container>
  );

  // Sniper result screen
  if (sniperMode && challengeResult) {
    const restartSniper = () => {
      setSniperStreak(0);
      setCurrentIndex(0);
      setErrors(0);
      setErrorCards([]);
      setSelectedOption(null);
      setShowResult(false);
      setChallengeResult(null);
    };

    return renderChallengeResult({
      kind: 'target',
      title: 'Снайпер!',
      subtitle: '5 правильных подряд без единой ошибки',
      onRetry: restartSniper,
    });
  }

  // Forgotten mode result screen
  if (forgottenMode && challengeResult) {
    const forgottenWon = challengeResult.correct === challengeResult.total;
    const restartForgotten = () => {
      setCurrentIndex(0);
      setErrors(0);
      setErrorCards([]);
      setSelectedOption(null);
      setShowResult(false);
      setChallengeResult(null);
    };

    return renderChallengeResult({
      kind: forgottenWon ? 'memory' : 'strength',
      title: forgottenWon ? 'Память освежена!' : 'Почти получилось',
      subtitle: forgottenWon
        ? `Все ${challengeResult.total} правильно — забери награду на главной`
        : `Правильно: ${challengeResult.correct} из ${challengeResult.total}. Для награды нужны все ответы без ошибок`,
      onRetry: restartForgotten,
    });
  }

  // Quick round challenge result screen
  if (challengeMode && challengeResult) {
    const isSuccess = challengeResult.finished && challengeResult.correct === challengeResult.total;

    return renderChallengeResult({
      kind: isSuccess ? 'trophy' : challengeResult.timesUp ? 'time' : 'strength',
      title: isSuccess
        ? 'Поздравляем!'
        : challengeResult.timesUp
          ? 'Время вышло!'
          : 'Не получилось...',
      subtitle: isSuccess
        ? `Все ${challengeResult.total} ${pluralize(challengeResult.total ?? 0, 'слово', 'слова', 'слов')} угаданы без ошибок за ${formatTime(challengeResult.timeSpent ?? 0)}! Алмазы ждут тебя на главной.`
        : challengeResult.timesUp
          ? `Ты успел ответить на ${currentIndex} из ${totalQuestions}`
          : 'Чтобы забрать алмазы, угадай все слова за 2 минуты без единой ошибки. Ты справишься!',
      onRetry: isSuccess ? undefined : restartChallenge,
    });
  }

  const questionView = (
    <QuestionView
      colors={colors}
      currentCard={currentCard}
      getFront={getFront}
      getBack={getBack}
      options={options}
      optionState={optionState}
      handleSelectOption={handleSelectOption}
      handleSpeak={handleSpeak}
      playWord={playWord}
      isListen={isListen}
      isPlainTest={isPlainTest}
      showResult={showResult}
    />
  );

  if (isPlainTest) {
    const exitTest = () => {
      finishStudySession();
      if (session) navigation.navigate('SetDetail', { setId: session.setId });
      else navigation.goBack();
    };
    // «Не могу слушать»: этап пропускается целиком, итоги сессии решают, что дальше
    const skipListen = () => {
      if (!session) return;
      navigation.replace('StudyResults', {
        setId,
        totalCards: 0,
        learnedCards: 0,
        timeSpent: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        errors: 0,
        errorCards: [],
        modeTitle: 'На слух',
        session,
        sessionStageSkipped: true,
      });
    };
    return (
      <StageLayout
        session={session}
        progress={
          session
            ? sessionStageProgress(
                studiedInPhase,
                Math.min(currentIndex + (showResult ? 1 : 0), baseQuestionsRef.current),
                sessionRetryCount,
                currentTotalPhaseCards.current || baseQuestionsRef.current
              )
            : { done: currentIndex + (showResult ? 1 : 0), total: totalQuestions }
        }
        task={
          isListen ? 'Что вы слышите?' : isSubjectSet(set) ? 'Выберите ответ' : 'Как переводится?'
        }
        taskAction={
          isListen && session && !showResult ? (
            <Button variant="quiet" size="s" title="Не могу слушать" onPress={skipListen} />
          ) : null
        }
        onExit={exitTest}
        showIntro={phaseOffset === 0 && !phaseFailedList.length}
        onIntroDone={() => setIntroDone(true)}
        footer={
          feedback ? (
            <AnswerPanel
              correct={feedback.correct}
              answer={isListen ? getFront(currentCard) : getBack(currentCard)}
              hint={{
                front: getFront(currentCard),
                back: getBack(currentCard),
                example: currentCard.example || undefined,
              }}
              onNext={handleNextQuestion}
            />
          ) : null
        }
      >
        {questionView}
      </StageLayout>
    );
  }

  return (
    <Container padded={false}>
      <ScreenHeader
        title={screenTitle}
        onBack={() => {
          if (timerRef.current) clearInterval(timerRef.current);
          finishStudySession();
          navigation.goBack();
        }}
        right={
          challengeMode && !sniperMode && !forgottenMode ? (
            <Text
              variant="button"
              accessibilityLabel={`Осталось ${timeLeft} секунд`}
              style={[
                styles.timerText,
                { color: timeLeft <= 10 ? colors.errorText : colors.textPrimary },
              ]}
            >
              {formatTime(timeLeft)}
            </Text>
          ) : null
        }
      />

      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text variant="bodySmall" style={[styles.semibold, { color: colors.textPrimary }]}>
            {sniperMode
              ? `Серия: ${sniperStreak}/${TARGET_STREAK}`
              : `Вопрос: ${currentIndex + 1}/${totalQuestions}`}
          </Text>
        </View>
        <ProgressBar
          progress={sniperMode ? Math.round((sniperStreak / TARGET_STREAK) * 100) : progressPercent}
          accessibilityLabel="Прогресс"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {questionView}
      </ScrollView>
    </Container>
  );
}
