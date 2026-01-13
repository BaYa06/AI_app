/**
 * Study Screen
 * @description Экран изучения карточек
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCardsStore, useSetsStore, useStudyStore, useThemeColors, useSettingsStore } from '@/store';
import { Text, Button, ProgressBar, Loading } from '@/components/common';
import { FlashCard, RatingButtons } from '@/components/cards';
import { calculateNextReview, buildStudyQueue } from '@/services/SRSService';
import { spacing } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Rating, Card } from '@/types';

type Props = RootStackScreenProps<'Study'>;

export function StudyScreen({ navigation, route }: Props) {
  const { setId, mode } = route.params;
  const colors = useThemeColors();
  const settings = useSettingsStore((s) => s.settings);
  const incrementTodayCards = useSettingsStore((s) => s.incrementTodayCards);
  
  // Store
  const updateLastStudied = useSetsStore((s) => s.updateLastStudied);
  const getCardsBySet = useCardsStore((s) => s.getCardsBySet);
  const updateCardSRS = useCardsStore((s) => s.updateCardSRS);
  
  // Study store
  const session = useStudyStore((s) => s.session);
  const isFlipped = useStudyStore((s) => s.isFlipped);
  const startSession = useStudyStore((s) => s.startSession);
  const showAnswer = useStudyStore((s) => s.showAnswer);
  const endSession = useStudyStore((s) => s.endSession);
  const getProgress = useStudyStore((s) => s.getProgress);

  // Локальное состояние
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Инициализация сессии
  useEffect(() => {
    const cards = getCardsBySet(setId);
    const queue = buildStudyQueue(
      cards,
      settings.dailyNewCardsLimit,
      settings.dailyReviewLimit
    );

    if (queue.length === 0) {
      setIsComplete(true);
      return;
    }

    startSession(
      {
        setId,
        mode,
        newCardsLimit: settings.dailyNewCardsLimit,
        reviewCardsLimit: settings.dailyReviewLimit,
        shuffleCards: true,
        prioritizeOverdue: true,
        showTimer: false,
      },
      queue
    );

    setCurrentCard(queue[0]);
    updateLastStudied(setId);
  }, [setId]);

  // Получить текущую карточку из очереди
  useEffect(() => {
    if (session && session.queue[session.currentIndex]) {
      const cardId = session.queue[session.currentIndex];
      const card = useCardsStore.getState().getCard(cardId);
      setCurrentCard(card || null);
    }
  }, [session?.currentIndex]);

  // Обработка оценки
  const handleRate = useCallback(
    (rating: Rating) => {
      if (!currentCard) return;

      // Рассчитываем новые SRS параметры
      const result = calculateNextReview(currentCard, rating);

      // Обновляем карточку
      updateCardSRS(currentCard.id, {
        easeFactor: result.newEaseFactor,
        interval: result.newInterval,
        repetitions: currentCard.repetitions + 1,
        nextReviewDate: result.nextReviewDate,
        lastReviewDate: Date.now(),
        status: result.newStatus,
      });

      // Обновляем статистику
      incrementTodayCards();

      // Переход к следующей карточке
      if (session && session.currentIndex + 1 >= session.queue.length) {
        setIsComplete(true);
      } else {
        useStudyStore.setState((s) => ({
          ...s,
          session: s.session
            ? { ...s.session, currentIndex: s.session.currentIndex + 1 }
            : null,
          isFlipped: false,
        }));
      }
    },
    [currentCard, updateCardSRS, incrementTodayCards, session]
  );

  // Показать ответ
  const handleShowAnswer = useCallback(() => {
    showAnswer();
  }, [showAnswer]);

  // Завершить сессию
  const handleFinish = useCallback(() => {
    endSession();
    navigation.goBack();
  }, [endSession, navigation]);

  // Прогресс
  const progress = getProgress();

  // Экран завершения
  if (isComplete) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.completeContainer}>
          <Text style={styles.completeIcon}>🎉</Text>
          <Text variant="h1" align="center">
            Отлично!
          </Text>
          <Text variant="body" color="secondary" align="center" style={styles.completeText}>
            Вы изучили все карточки на сегодня
          </Text>

          {session && (
            <View style={[styles.statsCard, { backgroundColor: colors.surface }]}>
              <StatRow label="Изучено" value={session.completedCards} />
              <StatRow label="Правильно" value={session.correctAnswers} />
              <StatRow label="Неправильно" value={session.incorrectAnswers} />
            </View>
          )}

          <Button
            title="Завершить"
            onPress={handleFinish}
            fullWidth
            style={styles.finishButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Загрузка
  if (!currentCard) {
    return <Loading fullScreen message="Подготовка карточек..." />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Хедер */}
      <View style={styles.header}>
        <Pressable onPress={handleFinish} hitSlop={20}>
          <Text variant="button" style={{ color: colors.textSecondary }}>
            ✕ Закрыть
          </Text>
        </Pressable>
        <Text variant="label" color="secondary">
          {progress.current} / {progress.total}
        </Text>
      </View>

      {/* Прогресс */}
      <ProgressBar progress={progress.percentage} height={4} />

      {/* Карточка */}
      <View style={styles.cardContainer}>
        <FlashCard
          card={currentCard}
          isFlipped={isFlipped}
          onFlip={!isFlipped ? handleShowAnswer : undefined}
        />
      </View>

      {/* Кнопки */}
      <View style={styles.buttonsContainer}>
        {!isFlipped ? (
          <Button
            title="Показать ответ"
            onPress={handleShowAnswer}
            fullWidth
            size="large"
          />
        ) : (
          <RatingButtons card={currentCard} onRate={handleRate} />
        )}
      </View>
    </SafeAreaView>
  );
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ====================

interface StatRowProps {
  label: string;
  value: number;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Text variant="body" color="secondary">
        {label}
      </Text>
      <Text variant="h3">{value}</Text>
    </View>
  );
}

// ==================== СТИЛИ ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },

  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  buttonsContainer: {
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.l,
  },

  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },

  completeIcon: {
    fontSize: 80,
    marginBottom: spacing.l,
  },

  completeText: {
    marginTop: spacing.s,
    marginBottom: spacing.xl,
  },

  statsCard: {
    width: '100%',
    padding: spacing.m,
    borderRadius: 16,
    marginBottom: spacing.xl,
  },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
  },

  finishButton: {
    marginTop: spacing.m,
  },
});
