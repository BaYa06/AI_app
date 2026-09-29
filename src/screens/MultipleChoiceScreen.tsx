/**
 * Multiple Choice Screen
 * @description Экран выбора перевода
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, AppState } from 'react-native';
import { triggerHaptic } from '@/utils/haptic';
import { Check, Layers, Volume2, X } from 'lucide-react-native';
import { Container, Text, Loading } from '@/components/common';
import { Button, CelebrationIcon, EmptyState, ProgressBar, ScreenHeader, type CelebrationKind } from '@/components/ui';
import { useCardsStore, useSetsStore, useThemeColors, useSettingsStore, selectSetStats } from '@/store';
import { spacing, borderRadius, heights, iconSize, screenPadding, alpha } from '@/constants';
import { ProgressService } from '@/services/ProgressService';
import { speak, resolveSpeechLang, prefetchSpeech, cardSpeechLangs } from '@/utils/speech';
import { playCorrectSound, preloadSound } from '@/utils/sound';
import { buildDistractorPool, pickSimilarDistractors } from '@/utils/choiceDistractors';
import { Analytics } from '@/services/analytics';
import { useChallengeStore } from '@/store';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card, Rating } from '@/types';

type Props = RootStackScreenProps<'MultipleChoice'>;

type ChallengeResult = {
  finished: boolean;
  timesUp: boolean;
  correct?: number;
  total?: number;
  timeSpent?: number;
} | null;

type OptionState = 'neutral' | 'correct' | 'wrong';
type Option = { id: string; label: string; text: string; isCorrect: boolean };

export function MultipleChoiceScreen({ navigation, route }: Props) {
  const { setId, cardLimit, dueCardIds, phaseId, totalPhaseCards, studiedInPhase = 0, phaseOffset = 0, phaseFailedIds, challengeMode, timeLimit: paramTimeLimit, sniperMode, forgottenMode } = route.params;
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
    () => [
      setId,
      cardLimit ?? 'all',
      phaseId || 'noPhase',
      phaseOffset,
      phaseFailedList.join(','),
    ].join('|'),
    [setId, cardLimit, phaseId, phaseOffset, phaseFailedList]
  );
  
  // Генерируем phaseId при первом запуске (если не передан)
  const currentPhaseId = useRef(phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);
  // Количество ошибочных карточек из прошлых порций в текущей очереди
  const pendingCardsInQueueRef = useRef(0);

  const [questions, setQuestions] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [errors, setErrors] = useState(0);
  const [errorCards, setErrorCards] = useState<Array<{ id: string; front: string; back: string; rating: number }>>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const cardShownAtRef = useRef<number>(Date.now());

  // Challenge mode state
  const [timeLeft, setTimeLeft] = useState(paramTimeLimit ?? 120);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult>(null);

  // Sniper mode state
  const [sniperStreak, setSniperStreak] = useState(0);
  const TARGET_STREAK = 5;

  const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
  const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';

  // Ответ в тесте: уровень карточки считает сервер (сверяет выбранный вариант), экран обновляется сразу
  const applySrsUpdate = React.useCallback(
    (card: Card, isCorrect: boolean, chosenCardId: string, timeSpentMs: number) => {
      ProgressService.recordAnswer(card, { mode: 'test', correct: isCorrect, chosen: chosenCardId, timeSpentMs });

      if (isCorrect) {
        incrementTodayCards();
      }

      const statsSnapshot = selectSetStats(card.setId);
      updateSetStats(card.setId, {
        cardCount: statsSnapshot.total,
        newCount: statsSnapshot.newCount,
        learningCount: statsSnapshot.learningCount,
        reviewCount: statsSnapshot.reviewCount,
        masteredCount: statsSnapshot.masteredCount,
      });
    },
    [updateSetStats, incrementTodayCards]
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
      cards = ids.map((id) => state.cards[id]).filter((c): c is Card => Boolean(c) && c.nextReviewDate <= now);
    }

    let questionCards: Card[] = [];
    
    if (phaseId) {
      // Собираем карточки для фазы: сначала ошибочные из прошлых порций, потом новые по offset
      const pendingIds = phaseFailedList || [];
      
      // Получаем ошибочные карточки по ID
      const pendingCards: Card[] = pendingIds
        .map((id) => cards.find(c => c.id === id))
        .filter((c): c is Card => Boolean(c));
      
      // Получаем оставшиеся карточки по offset
      const remaining = phaseOffset > 0 ? cards.slice(phaseOffset) : cards;
      
      // Исключаем из remaining те, что уже есть в pendingCards
      const pendingIdsSet = new Set(pendingCards.map(c => c.id));
      const filteredRemaining = remaining.filter(c => !pendingIdsSet.has(c.id));
      
      // Собираем: сначала ошибочные, потом новые
      const combined = [...pendingCards, ...filteredRemaining];
      
      // Применяем лимит
      const limited = cardLimit && cardLimit > 0 ? combined.slice(0, cardLimit) : combined;
      questionCards = shuffle(limited);
      
      // Сохраняем количество ошибочных карточек в очереди
      const pendingInQueue = limited.filter(c => pendingIdsSet.has(c.id)).length;
      pendingCardsInQueueRef.current = pendingInQueue;
      
      console.log('[MultipleChoice] Фаза:', {
        phaseId,
        phaseOffset,
        pendingIds: pendingIds.length,
        pendingCards: pendingCards.length,
        remaining: filteredRemaining.length,
        pendingInQueue,
        total: questionCards.length
      });
    } else {
      // Без фазы - просто берём карточки
      const availableCards = cards.slice(phaseOffset);
      const limited = !cardLimit || cardLimit <= 0 ? availableCards : availableCards.slice(0, cardLimit);
      questionCards = shuffle(limited);
      pendingCardsInQueueRef.current = 0;
    }
    
    // Одна карточка — один вопрос: дубли давали повторяющиеся варианты с одинаковым key,
    // и React не убирал старые кнопки (вариантов становилось 5, 6, …)
    const seen = new Set<string>();
    questionCards = questionCards.filter((c) => !seen.has(c.id) && seen.add(c.id));

    setQuestions(questionCards);
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
    (text: string, counterpartText?: string, langHint?: string) => {
      if (!text) return;
      const normalized = text.trim().split(/\r?\n/)[0].trim();
      if (!normalized) return;
      const lang = resolveSpeechLang(normalized, langHint, counterpartText);
      speak(normalized, lang).catch((error) => {
        console.warn('[MultipleChoice] Speech error:', error);
      });
    },
    [],
  );

  const totalQuestions = questions.length;
  const currentCard = questions[currentIndex];

  // Заранее озвучиваем слово текущей и следующей карточки — кнопка динамика играет сразу
  useEffect(() => {
    const upcoming = [questions[currentIndex], questions[currentIndex + 1]].filter(Boolean) as Card[];
    prefetchSpeech(upcoming.map((c) => ({ text: getFront(c), counterpart: getBack(c), lang: cardSpeechLangs(c).front })));
  }, [questions, currentIndex]);
  const progressPercent = totalQuestions ? Math.round(((currentIndex + 1) / totalQuestions) * 100) : 0;

  const options = useMemo(() => {
    if (!currentCard) return [];
    // Неверные варианты — из всего набора (не только из порции) и похожие на правильный ответ
    const { cards: cardsMap, cardsBySet } = useCardsStore.getState();
    const pool = buildDistractorPool(currentCard, cardsBySet, cardsMap, useSetsStore.getState().sets);
    const distractors = pickSimilarDistractors(currentCard, pool, 3);
    const baseOptions = shuffle([currentCard, ...distractors]).slice(0, 4);
    const labels = ['A', 'B', 'C', 'D'];

    return baseOptions.map((card, idx) => ({
      id: card.id,
      label: labels[idx] || '?',
      text: getBack(card),
      isCorrect: card.id === currentCard.id,
    }));
  }, [currentCard, questions]);

  const optionState = (option: Option): OptionState => {
    if (!showResult) return 'neutral';
    if (option.isCorrect) return 'correct';
    if (selectedOption === option.id) return 'wrong';
    return 'neutral';
  };

  // Предзагружаем звук при монтировании компонента
  useEffect(() => {
    preloadSound('/correct.wav');
  }, []);

  // Analytics: сбрасываем таймер при переходе к следующей карточке
  useEffect(() => {
    cardShownAtRef.current = Date.now();
  }, [currentIndex]);

  // Challenge timer
  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
    (errorsCount: number, errorList: Array<{ id: string; front: string; back: string; rating: number }>) => {
      const timeSpent = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const learnedCards = Math.max(0, totalQuestions - errorsCount);
      
      // Считаем сколько НОВЫХ карточек было в этой порции
      const newCardsInBatch = totalQuestions - pendingCardsInQueueRef.current;
      
      // Обновляем прогресс фазы
      const newStudiedInPhase = studiedInPhase + learnedCards;
      // phaseOffset увеличивается только на количество НОВЫХ карточек
      const newPhaseOffset = phaseOffset + newCardsInBatch;
      const phaseTotal = currentTotalPhaseCards.current || totalQuestions;
      
      // Собираем ID ошибочных карточек
      const errorIds = new Set(errorList.map(c => c.id).filter(Boolean));
      
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
      const newPhaseFailedIds = Array.from(prevFailed);
      
      console.log('[MultipleChoice] Завершение порции:', {
        totalQuestions,
        newCardsInBatch,
        pendingCardsInQueue: pendingCardsInQueueRef.current,
        learnedCards,
        errorsCount,
        errorIds: Array.from(errorIds),
        newPhaseFailedIds,
        newStudiedInPhase,
        newPhaseOffset,
        phaseTotal
      });
      
      finishStudySession();

      navigation.replace('StudyResults', {
        setId,
        totalCards: totalQuestions,
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
      });
    },
    [finishStudySession, navigation, setId, totalQuestions, cardLimit, dueCardIds, studiedInPhase, phaseOffset, phaseFailedList, questions]
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
      playCorrectSound();
    } else {
      triggerHaptic('notificationError');
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

      timeoutRef.current = setTimeout(() => {
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
      }, isCorrect ? 650 : 1000);
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

  const handleClose = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    finishStudySession();
    navigation.navigate('Main', { screen: 'Home' });
  }, [challengeMode, finishStudySession, navigation]);

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
        <Text variant="h2" align="center" accessibilityRole="header" style={[styles.challengeResultTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <Text variant="body" align="center" style={[styles.challengeResultSubtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        <View style={styles.challengeResultButtons}>
          {onRetry ? <Button title="Повторить" onPress={onRetry} fullWidth /> : null}
          <Button variant={onRetry ? 'secondary' : 'primary'} title="Закрыть" onPress={handleClose} fullWidth />
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
      title: isSuccess ? 'Поздравляем!' : challengeResult.timesUp ? 'Время вышло!' : 'Не получилось...',
      subtitle: isSuccess
        ? `Все ${challengeResult.total} слов угаданы без ошибок за ${formatTime(challengeResult.timeSpent ?? 0)}! Алмазы ждут тебя на главной.`
        : challengeResult.timesUp
          ? `Ты успел ответить на ${currentIndex} из ${totalQuestions}`
          : 'Чтобы забрать алмазы, угадай все слова за 2 минуты без единой ошибки. Ты справишься!',
      onRetry: isSuccess ? undefined : restartChallenge,
    });
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
              style={[styles.timerText, { color: timeLeft <= 10 ? colors.errorText : colors.textPrimary }]}
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
          progress={sniperMode
            ? Math.round((sniperStreak / TARGET_STREAK) * 100)
            : progressPercent}
          accessibilityLabel="Прогресс"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardChip}>
            <Text variant="overline" style={{ color: colors.primary }}>
              Выбери правильный ответ
            </Text>
          </View>
          <Text variant="h1" style={[styles.word, { color: colors.textPrimary }]}>
            {getFront(currentCard)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Прослушать слово"
            style={({ pressed }) => [
              styles.audioButton,
              {
                backgroundColor: pressed ? alpha(colors.primary, 20) : colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
            onPress={() => handleSpeak(getFront(currentCard), getBack(currentCard), cardSpeechLangs(currentCard).front)}
          >
            <Volume2 size={iconSize.m} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.optionsBlock}>
          {options.map((option) => {
            const state = optionState(option);
            const isCorrect = state === 'correct';
            const isWrong = state === 'wrong';

            const baseBorder = isCorrect ? colors.success : isWrong ? colors.error : colors.border;
            const baseBg = isCorrect
              ? alpha(colors.success, 10)
              : isWrong
                ? alpha(colors.error, 10)
                : colors.surface;
            // Текст ответа — «текстовые» токены: заливки как текст нечитаемы
            const textColor = isCorrect
              ? colors.successText
              : isWrong
                ? colors.errorText
                : colors.textPrimary;

            return (
              <Pressable
                key={option.id}
                onPress={() => handleSelectOption(option)}
                disabled={showResult}
                accessibilityRole="button"
                accessibilityLabel={`${option.label}. ${option.text}${isCorrect ? ', верно' : isWrong ? ', неверно' : ''}`}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: baseBorder,
                    backgroundColor: pressed && !isCorrect && !isWrong ? alpha(colors.primary, 10) : baseBg,
                  },
                ]}
              >
                <View style={[styles.optionBadge, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                  <Text variant="label" style={{ color: colors.textSecondary }}>
                    {option.label}
                  </Text>
                </View>
                <Text variant="bodyLarge" style={[styles.optionText, { color: textColor }]}>{option.text}</Text>
                {/* Верно/неверно — цвет и иконка, не только цвет (брендбук, 11) */}
                {isCorrect ? (
                  <Check size={iconSize.s} color={colors.successText} strokeWidth={3} />
                ) : isWrong ? (
                  <X size={iconSize.s} color={colors.errorText} strokeWidth={3} />
                ) : (
                  <View style={styles.optionMarkPlaceholder} />
                )}
              </Pressable>
            );
          })}
        </View>

      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  semibold: {
    fontWeight: '600',
  },
  progressSection: {
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.s,
    gap: spacing.xs,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    gap: spacing.m,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xxl,
  },
  // Рамка без тени (брендбук, 7.3)
  card: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.s,
  },
  cardChip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
  },
  word: {
    textAlign: 'center',
  },
  audioButton: {
    marginTop: spacing.m,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionsBlock: {
    gap: spacing.s,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
  optionBadge: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionText: {
    flex: 1,
    fontWeight: '600',
  },
  optionMarkPlaceholder: {
    width: iconSize.s,
  },
  timerText: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  // Challenge result
  challengeResultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  challengeResultIcon: {
    marginBottom: spacing.m,
  },
  challengeResultTitle: {
    marginBottom: spacing.xs,
  },
  challengeResultSubtitle: {
    marginBottom: spacing.xl,
  },
  challengeResultButtons: {
    width: '100%',
    gap: spacing.s,
  },
});
