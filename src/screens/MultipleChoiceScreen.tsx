/**
 * Multiple Choice Screen
 * @description Экран выбора перевода
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, AppState } from 'react-native';
import { ArrowLeft, Settings, Volume2 } from 'lucide-react-native';
import { Container, Text, ProgressBar, Loading } from '@/components/common';
import { useCardsStore, useSetsStore, useThemeColors, useSettingsStore, selectSetStats } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { calculateNextReview } from '@/services/SRSService';
import { speak, detectLanguage } from '@/utils/speech';
import { playCorrectSound, preloadSound } from '@/utils/sound';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card, Rating } from '@/types';

type Props = RootStackScreenProps<'MultipleChoice'>;

type OptionState = 'neutral' | 'correct' | 'wrong';
type Option = { id: string; label: string; text: string; isCorrect: boolean };

export function MultipleChoiceScreen({ navigation, route }: Props) {
  const { setId, cardLimit, phaseId, totalPhaseCards, studiedInPhase = 0, phaseOffset = 0, phaseFailedIds } = route.params;
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
    const ids = state.cardsBySet[setId] || [];
    const cards = ids.map((id) => state.cards[id]).filter(Boolean) as Card[];

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
  }, [initKey, phaseFailedList, phaseId, phaseOffset, cardLimit, setId]);

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
        nextMode: 'multipleChoice',
        // Параметры фазы
        phaseId: currentPhaseId.current,
        totalPhaseCards: phaseTotal,
        studiedInPhase: newStudiedInPhase,
        phaseOffset: newPhaseOffset,
        phaseFailedIds: newPhaseFailedIds,
      });
    },
    [finishStudySession, navigation, setId, totalQuestions, cardLimit, studiedInPhase, phaseOffset, phaseFailedList, questions]
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

    applySrsUpdate(currentCard, rating);
    if (isCorrect) {
      playCorrectSound();
    }

    setSelectedOption(option.id);
    setShowResult(true);
    if (!isCorrect) {
      setErrors(nextErrors);
      setErrorCards(updatedErrorCards);
    }

    const isLast = currentIndex >= totalQuestions - 1;
    timeoutRef.current = setTimeout(() => {
      if (isLast) {
        finishQuiz(nextErrors, updatedErrorCards);
        return;
      }
      setCurrentIndex((idx) => idx + 1);
      setSelectedOption(null);
      setShowResult(false);
    }, 650);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!set) {
    return <Loading fullScreen message="Загрузка..." />;
  }

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
            Multiple Choice
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

  // Сохраняем активность при уходе в background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        finishStudySession();
      }
    });
    return () => sub.remove();
  }, [finishStudySession]);

  return (
    <Container padded={false}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Pressable
          aria-label="Назад"
          onPress={() => { finishStudySession(); navigation.goBack(); }}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: pressed ? colors.surface : 'transparent' },
          ]}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="h3" style={{ color: colors.textPrimary }}>
          Multiple Choice
        </Text>
        <Pressable
          aria-label="Настройки"
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: pressed ? colors.surface : 'transparent' },
          ]}
        >
          <Settings size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            Вопрос: {currentIndex + 1}/{totalQuestions}
          </Text>
        </View>
        <ProgressBar progress={progressPercent} height={8} />
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
});
