/**
 * Word Builder Screen
 * @description Экран сборки слова (интерактивный)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, AppState } from 'react-native';
import { ArrowLeft, Settings, Volume2 } from 'lucide-react-native';
import {
  useThemeColors,
  useCardsStore,
  useSetsStore,
  useSettingsStore,
  selectSetStats,
} from '@/store';
import { ProgressBar, Text, Loading } from '@/components/common';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card, Rating } from '@/types';
import { spacing, borderRadius } from '@/constants';
import { calculateNextReview } from '@/services/SRSService';
import { speak, detectLanguage } from '@/utils/speech';
import { playCorrectSound2 as playCorrectSound, preloadSound } from '@/utils/sound';

type Props = RootStackScreenProps<'WordBuilder'>;

type LetterSlot = { id: string; char: string | null; tileId: string | null; isFilled: boolean };
type LetterTile = { id: string; char: string; used: boolean };

const FEEDBACK_DELAY_MS = 500;

const shuffleArray = <T,>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export function WordBuilderScreen({ navigation, route }: Props) {
  const {
    setId,
    cardLimit,
    phaseId,
    totalPhaseCards,
    studiedInPhase = 0,
    phaseOffset = 0,
    phaseFailedIds,
  } = route.params;
  const colors = useThemeColors();
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const updateCardSRS = useCardsStore((s) => s.updateCardSRS);
  const incrementTodayCards = useSettingsStore((s) => s.incrementTodayCards);
  const finishStudySession = useSettingsStore((s) => s.finishStudySession);
  const { ids, map } = useCardsStore(
    useCallback((s) => ({ ids: s.cardsBySet[setId] || [], map: s.cards }), [setId]),
  );
  const cards = useMemo(
    () => ids.map((id) => map[id]).filter((c): c is Card => Boolean(c)),
    [ids, map],
  );
  const cardsKey = useMemo(() => ids.join('|'), [ids]);
  const [cardsQueue, setCardsQueue] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slots, setSlots] = useState<LetterSlot[]>([]);
  const [tiles, setTiles] = useState<LetterTile[]>([]);
  const [errors, setErrors] = useState(0);
  const [errorCards, setErrorCards] = useState<
    Array<{ id?: string; front: string; back: string; rating: number }>
  >([]);
  const [isLocked, setIsLocked] = useState(false);
  const [wordResult, setWordResult] = useState<'correct' | 'wrong' | null>(null);

  const pendingCardsInQueueRef = useRef(0);
  const currentPhaseId = useRef(
    phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);
  const startedAtRef = useRef<number>(Date.now());
  const advanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAdvanceRef = useRef<{
    errors: number;
    errorCards: Array<{ id?: string; front: string; back: string; rating: number }>;
  } | null>(null);

  const cardMap = useMemo(() => {
    const map: Record<string, Card> = {};
    cards.forEach((card) => {
      if (card) {
        map[card.id] = card;
      }
    });
    return map;
  }, [cards]);

  const phaseFailedList = useMemo(
    () => phaseFailedIds || [],
    [phaseFailedIds ? phaseFailedIds.join('|') : ''],
  );
  const phaseFailedKey = useMemo(
    () => (phaseFailedIds ? phaseFailedIds.join(',') : 'none'),
    [phaseFailedIds ? phaseFailedIds.join(',') : 'none'],
  );

  const initKey = useMemo(
    () =>
      [
        setId,
        cardLimit ?? 'all',
        phaseId || 'noPhase',
        phaseOffset,
        phaseFailedKey,
        cardsKey,
      ].join('|'),
    [setId, cardLimit, phaseId, phaseOffset, phaseFailedKey, cardsKey],
  );

  useEffect(() => {
    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }

    let queue: Card[] = [];

    if (phaseId) {
      const pendingCards = phaseFailedList
        .map((id) => cardMap[id])
        .filter((c): c is Card => Boolean(c));
      const remaining = phaseOffset > 0 ? cards.slice(phaseOffset) : cards;
      const pendingIdsSet = new Set(pendingCards.map((c) => c.id));
      const filteredRemaining = remaining.filter((c) => !pendingIdsSet.has(c.id));
      const combined = [...pendingCards, ...filteredRemaining];
      const limited = cardLimit && cardLimit > 0 ? combined.slice(0, cardLimit) : combined;
      queue = limited;
      pendingCardsInQueueRef.current = limited.filter((c) => pendingIdsSet.has(c.id)).length;
    } else {
      const availableCards = cards.slice(phaseOffset);
      const limited =
        !cardLimit || cardLimit <= 0 ? availableCards : availableCards.slice(0, cardLimit);
      queue = limited;
      pendingCardsInQueueRef.current = 0;
    }

    currentTotalPhaseCards.current = totalPhaseCards || queue.length;
    setCardsQueue(queue);
    setCurrentIndex(0);
    setErrors(0);
    setErrorCards([]);
    setSlots([]);
    setTiles([]);
    setIsLocked(false);
    setWordResult(null);
    pendingAdvanceRef.current = null;
    startedAtRef.current = Date.now();

    return () => {
      if (advanceTimeoutRef.current) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = null;
      }
    };
  }, [initKey, totalPhaseCards]);

  // Предзагружаем звук правильного ответа, чтобы убрать задержку первого проигрывания
  useEffect(() => {
    preloadSound('/correct2.wav');
  }, []);

  const currentCard = cardsQueue[currentIndex];

  const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
  const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';

  const { promptText, targetWord } = useMemo(() => {
    if (!currentCard) {
      return {
        promptText: '',
        targetWord: '',
      };
    }

    const prompt = getBack(currentCard);
    const word = getFront(currentCard);

    return {
      promptText: prompt || 'Слово',
      targetWord: word || '',
    };
  }, [currentCard]);

  useEffect(() => {
    if (!targetWord) {
      setSlots([]);
      setTiles([]);
      setIsLocked(false);
      setWordResult(null);
      return;
    }

    const letters = targetWord.split('');
    const initialSlots: LetterSlot[] = letters.map((_, idx) => ({
      id: `slot-${idx}`,
      char: null,
      tileId: null,
      isFilled: false,
    }));
    const initialTiles: LetterTile[] = letters.map((char, idx) => ({
      id: `tile-${idx}`,
      char,
      used: false,
    }));

    setSlots(initialSlots);
    setTiles(shuffleArray(initialTiles));
    setIsLocked(false);
    setWordResult(null);
  }, [currentCard?.id, targetWord]);

  const totalWords = cardsQueue.length;

  const normalizeWord = useCallback((value: string) => value.trim().toLowerCase(), []);
  const targetNormalized = useMemo(
    () => (targetWord ? normalizeWord(targetWord) : ''),
    [normalizeWord, targetWord],
  );

  const applySrsUpdate = useCallback(
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
    [updateCardSRS, updateSetStats, incrementTodayCards],
  );

  const finishSession = useCallback(
    (
      errorsCount: number,
      errorList: Array<{ id?: string; front: string; back: string; rating: number }>,
    ) => {
      const timeSpent = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const learnedCards = Math.max(0, totalWords - errorsCount);

      const newCardsInBatch = totalWords - pendingCardsInQueueRef.current;
      const newStudiedInPhase = studiedInPhase + learnedCards;
      const newPhaseOffset = phaseOffset + newCardsInBatch;
      const phaseTotal = currentTotalPhaseCards.current || totalWords;

      const errorIds = new Set(errorList.map((c) => c.id).filter(Boolean));
      const prevFailed = new Set(phaseFailedList || []);
      cardsQueue.forEach((card) => {
        if (!errorIds.has(card.id)) {
          prevFailed.delete(card.id);
        }
      });
      errorIds.forEach((id) => {
        if (id) {
          prevFailed.add(id);
        }
      });
      const newPhaseFailedIds = Array.from(prevFailed);

      finishStudySession();

      navigation.replace('StudyResults', {
        setId,
        totalCards: totalWords,
        learnedCards,
        timeSpent,
        errors: errorsCount,
        errorCards: errorList,
        modeTitle: 'Word Builder',
        cardLimit,
        // Параметры фазы
        phaseId: currentPhaseId.current,
        totalPhaseCards: phaseTotal,
        studiedInPhase: newStudiedInPhase,
        phaseOffset: newPhaseOffset,
        phaseFailedIds: newPhaseFailedIds,
      });
    },
    [
      finishStudySession,
      navigation,
      setId,
      totalWords,
      cardLimit,
      studiedInPhase,
      phaseOffset,
      cardsQueue,
      phaseFailedList,
    ],
  );

  const handleTilePress = useCallback(
    (tileId: string) => {
      if (isLocked) return;

      const tile = tiles.find((t) => t.id === tileId);
      if (!tile || tile.used) return;

      let placed = false;
      setSlots((prevSlots) => {
        const emptyIndex = prevSlots.findIndex((slot) => !slot.char);
        if (emptyIndex === -1) return prevSlots;

        const updated = [...prevSlots];
        const slot = updated[emptyIndex];
        updated[emptyIndex] = {
          ...slot,
          char: tile.char,
          tileId: tile.id,
          isFilled: true,
        };
        placed = true;
        return updated;
      });

      if (!placed) return;

      setTiles((prevTiles) =>
        prevTiles.map((t) => (t.id === tileId ? { ...t, used: true } : t)),
      );
    },
    [tiles, isLocked],
  );

  const handleSlotPress = useCallback(
    (slotId: string) => {
      if (isLocked) return;
      const slot = slots.find((s) => s.id === slotId);
      if (!slot || !slot.char || !slot.tileId) return;

      setSlots((prevSlots) =>
        prevSlots.map((s) =>
          s.id === slotId ? { ...s, char: null, tileId: null, isFilled: false } : s,
        ),
      );

      setTiles((prevTiles) =>
        prevTiles.map((t) => (t.id === slot.tileId ? { ...t, used: false } : t)),
      );
    },
    [slots, isLocked],
  );

  // Обработчик озвучивания
  const handleSpeak = useCallback(
    (text: string, counterpartText?: string) => {
      if (!text) return;
      const normalized = text.trim().split(/\r?\n/)[0].trim();
      if (!normalized) return;
      const lang = detectLanguage(normalized, counterpartText);
      speak(normalized, lang).catch((error) => {
        console.warn('[WordBuilder] Speech error:', error);
      });
    },
    [],
  );

  const resultBorderColor = useMemo(() => {
    if (!wordResult) return null;
    return wordResult === 'correct' ? colors.success : colors.error;
  }, [wordResult, colors.success, colors.error]);


  const advanceToNextCard = useCallback(
    (
      errorsCount: number,
      errorList: Array<{ id?: string; front: string; back: string; rating: number }>,
    ) => {
      const isLast = currentIndex >= totalWords - 1;
      if (isLast) {
        finishSession(errorsCount, errorList);
        return;
      }

      pendingAdvanceRef.current = null;
      setSlots([]);
      setTiles([]);
      setWordResult(null);
      setIsLocked(false);
      setCurrentIndex((idx) => Math.min(totalWords - 1, idx + 1));
    },
    [currentIndex, totalWords, finishSession],
  );

  const handleCompleteWord = useCallback(() => {
    if (!currentCard || !targetWord || isLocked) return;
    const userWord = slots.map((slot) => slot.char ?? '').join('');
    const isCorrect = normalizeWord(userWord) === targetNormalized;
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

    setErrors(nextErrors);
    setErrorCards(updatedErrorCards);
    setWordResult(isCorrect ? 'correct' : 'wrong');
    setIsLocked(true);

    if (advanceTimeoutRef.current) {
      clearTimeout(advanceTimeoutRef.current);
    }
    if (isCorrect) {
      playCorrectSound();
      pendingAdvanceRef.current = null;
      advanceTimeoutRef.current = setTimeout(() => {
        advanceToNextCard(nextErrors, updatedErrorCards);
      }, FEEDBACK_DELAY_MS);
    } else {
      pendingAdvanceRef.current = { errors: nextErrors, errorCards: updatedErrorCards };
      advanceTimeoutRef.current = null;
    }
  }, [
    currentCard,
    targetWord,
    isLocked,
    slots,
    normalizeWord,
    targetNormalized,
    errors,
    errorCards,
    currentIndex,
    totalWords,
    advanceToNextCard,
    applySrsUpdate,
  ]);

  useEffect(() => {
    if (isLocked) return;
    if (!currentCard || !targetWord) return;
    if (!slots.length) return;
    const allFilled = slots.every((slot) => slot.char);
    if (!allFilled) return;
    handleCompleteWord();
  }, [slots, isLocked, currentCard, targetWord, handleCompleteWord]);

  const handleConfirmNext = useCallback(() => {
    const pending = pendingAdvanceRef.current;
    const fallback = { errors, errorCards };
    const payload = pending ?? fallback;
    advanceToNextCard(payload.errors, payload.errorCards);
  }, [advanceToNextCard, errors, errorCards]);

  // Сохраняем активность при уходе в background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        finishStudySession();
      }
    });
    return () => sub.remove();
  }, [finishStudySession]);

  const progressPercent = totalWords ? Math.round(((currentIndex + 1) / totalWords) * 100) : 0;

  if (!currentCard) {
    return <Loading fullScreen message="Загрузка..." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => { finishStudySession(); navigation.goBack(); }}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: pressed ? colors.surface : 'transparent' },
          ]}
          hitSlop={10}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="h3" style={{ color: colors.textPrimary, fontWeight: '800' }}>
          Word Builder
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: pressed ? colors.surface : 'transparent' },
          ]}
          hitSlop={10}
        >
          <Settings size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: spacing.m }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressInfo}>
            <Text variant="bodySmall" style={{ color: colors.textSecondary, fontWeight: '700' }}>
              Слово: {currentIndex + 1}/{totalWords || 1}
            </Text>
          </View>
          <ProgressBar progress={progressPercent} height={8} />
        </View>

        {/* Card */}
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
              { backgroundColor: colors.primary, shadowColor: colors.primary },
            ]}
          />
          <View style={[styles.cardChip, { backgroundColor: `${colors.primary}12` }]}>
            <Text
              variant="caption"
              style={{ color: colors.primary, fontWeight: '700', letterSpacing: 1 }}
            >
              Собери слово
            </Text>
          </View>

          <View style={styles.wordBlock}>
            <Text variant="h1" style={[styles.word, { color: colors.textPrimary }]}>
              {promptText}
            </Text>
            <Text variant="body" color="secondary" align="center">
              Составь оригинальное слово из букв
            </Text>
          </View>

          {wordResult === 'wrong' && (
            <Pressable
              style={({ pressed }) => [
                styles.audioButton,
                {
                  backgroundColor: pressed ? `${colors.primary}22` : colors.surfaceVariant,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => handleSpeak(targetWord, promptText)}
            >
              <Volume2 size={22} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* Slots */}
        <View style={styles.slotsSection}>
          <View style={styles.slotsRow}>
            {slots.map((slot, index) => {
              // Проверяем правильность каждой буквы отдельно
              const expectedChar = targetWord[index]?.toLowerCase();
              const actualChar = slot.char?.toLowerCase();
              const isSlotCorrect = expectedChar === actualChar;
              
              // Определяем цвет границы для каждой ячейки
              let slotBorderColor: string = slot.isFilled ? colors.primary : colors.border;
              let slotBgColor: string = slot.isFilled ? `${colors.primary}10` : colors.surfaceVariant;
              let slotTextColor: string = slot.isFilled ? colors.primary : colors.textSecondary;
              
              if (wordResult && slot.isFilled) {
                slotBorderColor = isSlotCorrect ? colors.success : colors.error;
                slotBgColor = isSlotCorrect ? `${colors.success}30` : `${colors.error}30`;
                slotTextColor = isSlotCorrect ? colors.success : colors.error;
              }
              
              return (
                <Pressable
                  key={slot.id}
                  disabled={!slot.isFilled || isLocked}
                  onPress={() => handleSlotPress(slot.id)}
                  style={({ pressed }) => [
                    styles.slot,
                    {
                      borderColor: slotBorderColor,
                      backgroundColor: slotBgColor,
                      borderWidth: wordResult ? 3 : 2,
                    },
                    pressed && slot.isFilled && { transform: [{ translateY: 1 }] },
                  ]}
                  hitSlop={6}
                >
                  <Text
                    variant="h3"
                    style={{
                      color: slotTextColor,
                      fontWeight: '800',
                    }}
                  >
                    {slot.char ?? ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {wordResult === 'wrong' && (
            <Pressable
              style={({ pressed }) => [
                styles.backspaceButton,
                {
                  backgroundColor: pressed ? `${colors.primary}12` : 'transparent',
                  alignSelf: 'center',
                  paddingHorizontal: spacing.m,
                  paddingVertical: spacing.s,
                  borderRadius: borderRadius.l,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
              onPress={handleConfirmNext}
            >
              <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                Хорошо
              </Text>
            </Pressable>
          )}
        </View>

        {/* Letters grid */}
        {wordResult !== 'wrong' && (
          <View style={styles.grid}>
            {tiles.map((tile) => (
              <Pressable
                key={tile.id}
                disabled={tile.used || isLocked}
                onPress={() => handleTilePress(tile.id)}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    backgroundColor:
                      resultBorderColor && tile.used
                        ? `${resultBorderColor}22`
                        : tile.used
                          ? colors.surfaceVariant
                          : colors.surface,
                    borderColor:
                      resultBorderColor && tile.used
                        ? resultBorderColor
                        : tile.used
                          ? colors.surfaceVariant
                          : colors.border,
                  },
                  pressed && !tile.used && { transform: [{ translateY: 1 }] },
                ]}
              >
                <Text
                  variant="h2"
                  style={{
                    color: tile.used ? colors.textTertiary : colors.textPrimary,
                    fontWeight: '800',
                  }}
                >
                  {tile.char}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.l,
    paddingBottom: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: spacing.xl * 1.5,
    gap: spacing.m,
  },
  progressSection: {
    gap: spacing.xs,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    overflow: 'hidden',
    gap: spacing.s,
  },
  cardTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  cardChip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  wordBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.s,
  },
  word: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
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
  slotsSection: {
    alignItems: 'center',
    gap: spacing.s,
  },
  slotsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  slot: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  backspaceButton: {
    padding: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tile: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
