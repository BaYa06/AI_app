/**
 * Multiple Choice Screen
 * @description Экран выбора перевода
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, AppState, Text as RNText } from 'react-native';
import { ArrowLeft, Volume2 } from 'lucide-react-native';
import { Container, Text, ProgressBar, Loading } from '@/components/common';
import { useCardsStore, useSetsStore, useThemeColors, useSettingsStore, selectSetStats } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { calculateNextReview } from '@/services/SRSService';
import { speak, detectLanguage } from '@/utils/speech';
import { playCorrectSound, preloadSound } from '@/utils/sound';
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
  const updateCardSRS = useCardsStore((s) => s.updateCardSRS);
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

  // Challenge mode state
  const [timeLeft, setTimeLeft] = useState(paramTimeLimit ?? 120);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult>(null);

  // Sniper mode state
  const [sniperStreak, setSniperStreak] = useState(0);
  const TARGET_STREAK = 5;

  const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
  const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';

  const applySrsUpdate = React.useCallback(
    (card: Card, rating: Rating) => {
      const result = calculateNextReview(card, rating);

      updateCardSRS(card.id, {
        learningStep: result.newLearningStep,
        nextReviewDate: result.nextReviewDate,
        lastReviewDate: Date.now(),
        status: result.newStatus,
      });

      // Считаем только правильные ответы (rating >= 3 - "почти" и "уверен")
      if (rating >= 3) {
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
    [updateCardSRS, updateSetStats, incrementTodayCards]
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
    (text: string, counterpartText?: string) => {
      if (!text) return;
      const normalized = text.trim().split(/\r?\n/)[0].trim();
      if (!normalized) return;
      const lang = detectLanguage(normalized, counterpartText);
      speak(normalized, lang).catch((error) => {
        console.warn('[MultipleChoice] Speech error:', error);
      });
    },
    [],
  );

  const totalQuestions = questions.length;
  const currentCard = questions[currentIndex];
  const progressPercent = totalQuestions ? Math.round(((currentIndex + 1) / totalQuestions) * 100) : 0;

  const options = useMemo(() => {
    if (!currentCard) return [];
    const others = shuffle(questions.filter((c) => c.id !== currentCard.id));
    const distractors = others.slice(0, Math.min(3, others.length));
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
        modeTitle: 'Multiple Choice',
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

    // Skip SRS in challenge mode
    if (!challengeMode) {
      applySrsUpdate(currentCard, rating);
    }
    if (isCorrect) {
      playCorrectSound();
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
          useChallengeStore.getState().completeQuickRound();
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
    ? 'Снайпер \uD83C\uDFAF'
    : forgottenMode
      ? 'Вспомни забытое \uD83E\uDDE0'
      : challengeMode
        ? 'Быстрый раунд \u26A1'
        : 'Multiple Choice';

  const handleClose = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!challengeMode) finishStudySession();
    navigation.navigate('Main', { screen: 'Home' });
  }, [challengeMode, finishStudySession, navigation]);

  if (!totalQuestions) {
    return (
      <Container padded={false}>
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <Pressable
            aria-label="Назад"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: pressed ? colors.surface : 'transparent' },
            ]}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text variant="h3" style={{ color: colors.textPrimary }}>
            {screenTitle}
          </Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.emptyState}>
          <Text variant="h3" style={{ color: colors.textPrimary, textAlign: 'center' }}>
            Нет карточек для игры
          </Text>
          <Text variant="body" color="secondary" align="center">
            Добавьте карточки в набор, чтобы начать Multiple Choice
          </Text>
        </View>
      </Container>
    );
  }

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

    return (
      <Container padded={false}>
        <View style={styles.challengeResultContainer}>
          <RNText style={styles.challengeResultEmoji}>{'\uD83C\uDFAF'}</RNText>
          <RNText style={[styles.challengeResultTitle, { color: colors.textPrimary }]}>
            Снайпер!
          </RNText>
          <RNText style={[styles.challengeResultSubtitle, { color: colors.textSecondary }]}>
            5 правильных подряд без единой ошибки
          </RNText>
          <View style={styles.challengeResultButtons}>
            <Pressable
              style={[styles.challengeResultPrimary, { backgroundColor: colors.primary }]}
              onPress={restartSniper}
            >
              <RNText style={styles.challengeResultPrimaryText}>Повторить</RNText>
            </Pressable>
            <Pressable
              style={[styles.challengeResultSecondary, { borderColor: colors.border }]}
              onPress={handleClose}
            >
              <RNText style={[styles.challengeResultSecondaryText, { color: colors.textPrimary }]}>Закрыть</RNText>
            </Pressable>
          </View>
        </View>
      </Container>
    );
  }

  // Forgotten mode result screen
  if (forgottenMode && challengeResult) {
    const restartForgotten = () => {
      setCurrentIndex(0);
      setErrors(0);
      setErrorCards([]);
      setSelectedOption(null);
      setShowResult(false);
      setChallengeResult(null);
    };

    return (
      <Container padded={false}>
        <View style={styles.challengeResultContainer}>
          <RNText style={styles.challengeResultEmoji}>{'\uD83E\uDDE0'}</RNText>
          <RNText style={[styles.challengeResultTitle, { color: colors.textPrimary }]}>
            Память освежена!
          </RNText>
          <RNText style={[styles.challengeResultSubtitle, { color: colors.textSecondary }]}>
            {`Правильно: ${challengeResult.correct} из ${challengeResult.total}`}
          </RNText>
          <View style={styles.challengeResultButtons}>
            <Pressable
              style={[styles.challengeResultPrimary, { backgroundColor: colors.primary }]}
              onPress={restartForgotten}
            >
              <RNText style={styles.challengeResultPrimaryText}>Повторить</RNText>
            </Pressable>
            <Pressable
              style={[styles.challengeResultSecondary, { borderColor: colors.border }]}
              onPress={handleClose}
            >
              <RNText style={[styles.challengeResultSecondaryText, { color: colors.textPrimary }]}>Закрыть</RNText>
            </Pressable>
          </View>
        </View>
      </Container>
    );
  }

  // Quick round challenge result screen
  if (challengeMode && challengeResult) {
    const isSuccess = challengeResult.finished && challengeResult.correct === challengeResult.total;

    return (
      <Container padded={false}>
        <View style={styles.challengeResultContainer}>
          <RNText style={styles.challengeResultEmoji}>
            {isSuccess ? '\uD83C\uDFC6' : challengeResult.timesUp ? '\u23F1\uFE0F' : '\uD83D\uDE14'}
          </RNText>
          <RNText style={[styles.challengeResultTitle, { color: colors.textPrimary }]}>
            {isSuccess
              ? 'Поздравляем!'
              : challengeResult.timesUp
                ? 'Время вышло!'
                : 'Не получилось...'}
          </RNText>
          <RNText style={[styles.challengeResultSubtitle, { color: colors.textSecondary }]}>
            {isSuccess
              ? `Все ${challengeResult.total} слов угаданы без ошибок за ${formatTime(challengeResult.timeSpent ?? 0)}! Алмазы ждут тебя на главной.`
              : challengeResult.timesUp
                ? `Ты успел ответить на ${currentIndex} из ${totalQuestions}`
                : 'Чтобы забрать алмазы, угадай все слова за 2 минуты без единой ошибки. Ты справишься! \uD83D\uDCAA'}
          </RNText>

          <View style={styles.challengeResultButtons}>
            {!isSuccess && (
              <Pressable
                style={[styles.challengeResultPrimary, { backgroundColor: colors.primary }]}
                onPress={restartChallenge}
              >
                <RNText style={styles.challengeResultPrimaryText}>Повторить</RNText>
              </Pressable>
            )}
            <Pressable
              style={isSuccess
                ? [styles.challengeResultPrimary, { backgroundColor: '#059669' }]
                : [styles.challengeResultSecondary, { borderColor: colors.border }]
              }
              onPress={handleClose}
            >
              <RNText style={isSuccess
                ? styles.challengeResultPrimaryText
                : [styles.challengeResultSecondaryText, { color: colors.textPrimary }]
              }>Закрыть</RNText>
            </Pressable>
          </View>
        </View>
      </Container>
    );
  }

  return (
    <Container padded={false}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Pressable
          aria-label="Назад"
          onPress={() => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (!challengeMode) finishStudySession();
            navigation.goBack();
          }}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: pressed ? colors.surface : 'transparent' },
          ]}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="h3" style={{ color: colors.textPrimary }}>
          {screenTitle}
        </Text>
        {challengeMode && !sniperMode && !forgottenMode ? (
          <View style={styles.timerContainer}>
            <RNText style={[
              styles.timerText,
              { color: timeLeft <= 10 ? colors.error : colors.textPrimary },
            ]}>
              {formatTime(timeLeft)}
            </RNText>
          </View>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            {sniperMode
              ? `Серия: ${sniperStreak}/${TARGET_STREAK}`
              : `Вопрос: ${currentIndex + 1}/${totalQuestions}`}
          </Text>
        </View>
        <ProgressBar
          progress={sniperMode
            ? Math.round((sniperStreak / TARGET_STREAK) * 100)
            : progressPercent}
          height={8}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: spacing.m,
            paddingBottom: spacing.xl * 1.5,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: colors.textPrimary,
            },
          ]}
        >
          <View
            style={[
              styles.cardTopLine,
              {
                backgroundColor: colors.primary,
                shadowColor: colors.primary,
              },
            ]}
          />
          <View style={styles.cardChip}>
            <Text
              variant="caption"
              style={{ color: colors.primary, fontWeight: '700', letterSpacing: 1 }}
            >
              Выбери перевод
            </Text>
          </View>
          <Text variant="h1" style={[styles.word, { color: colors.textPrimary }]}>
            {getFront(currentCard)}
          </Text>
          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={{ color: colors.textSecondary, fontWeight: '600' }}>
              Немецкий
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              →
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary, fontWeight: '600' }}>
              Русский
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.audioButton,
              {
                backgroundColor: pressed ? `${colors.primary}22` : colors.surfaceVariant,
                borderColor: colors.border,
              },
            ]}
            onPress={() => handleSpeak(getFront(currentCard), getBack(currentCard))}
          >
            <Volume2 size={22} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.optionsBlock}>
          {options.map((option) => {
            const state = optionState(option);
            const isCorrect = state === 'correct';
            const isWrong = state === 'wrong';

            const baseBorder = isCorrect ? colors.success : isWrong ? colors.error : colors.border;
            const baseBg = isCorrect
              ? `${colors.success}1A`
              : isWrong
                ? `${colors.error}1A`
                : colors.surface;
            const textColor = isCorrect
              ? colors.success
              : isWrong
                ? colors.error
                : colors.textPrimary;

            return (
              <Pressable
                key={option.id}
                onPress={() => handleSelectOption(option)}
                disabled={showResult}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: baseBorder,
                    backgroundColor: pressed && !isCorrect && !isWrong ? `${colors.primary}08` : baseBg,
                  },
                ]}
              >
                <View
                  style={[
                    styles.optionBadge,
                    {
                      backgroundColor: `${colors.textSecondary}14`,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 13 }}>
                    {option.label}
                  </Text>
                </View>
                <Text style={[styles.optionText, { color: textColor }]}>{option.text}</Text>
                {isCorrect ? (
                  <Text style={{ color: colors.success, fontWeight: '800' }}>✓</Text>
                ) : isWrong ? (
                  <Text style={{ color: colors.error, fontWeight: '800' }}>✕</Text>
                ) : (
                  <View style={{ width: 18 }} />
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
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSection: {
    paddingHorizontal: spacing.m,
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
  },
  card: {
    borderRadius: spacing.xl,
    borderWidth: 1,
    padding: spacing.l,
    paddingTop: spacing.l + 6,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    gap: spacing.s,
  },
  cardTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    borderTopLeftRadius: spacing.xl,
    borderTopRightRadius: spacing.xl,
  },
  cardChip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: 'transparent',
  },
  word: {
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.s,
  },
  audioButton: {
    marginTop: spacing.m,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: borderRadius.xl,
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
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
  optionBadge: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    gap: spacing.s,
  },
  // Timer
  timerContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Challenge result
  challengeResultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  challengeResultEmoji: {
    fontSize: 64,
    marginBottom: spacing.m,
  },
  challengeResultTitle: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  challengeResultSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  challengeResultButtons: {
    width: '100%',
    gap: spacing.s,
  },
  challengeResultPrimary: {
    height: 52,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeResultPrimaryText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  challengeResultSecondary: {
    height: 52,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeResultSecondaryText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
