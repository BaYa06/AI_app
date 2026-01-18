/**
 * Study Screen
 * @description Экран изучения карточек с CSS-анимациями для web
 */
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, Pressable, Dimensions, Platform } from 'react-native';
import { useCardsStore, useSetsStore, useStudyStore, useThemeColors, useSettingsStore, selectSetStats } from '@/store';
import { Text, Loading } from '@/components/common';
import { calculateNextReview, buildStudyQueue } from '@/services/SRSService';
import { spacing } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Rating, Card } from '@/types';
import { ArrowLeft, Settings, Volume2, Star, Check } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(340, SCREEN_WIDTH - 32);
const CARD_HEIGHT = CARD_WIDTH * 1.25;

type Props = RootStackScreenProps<'Study'>;

export function StudyScreen({ navigation, route }: Props) {
  const { setId, mode, errorCardsFronts, studyAll, cardLimit, onlyHard } = route.params;
  const colors = useThemeColors();
  const settings = useSettingsStore((s) => s.settings);
  const incrementTodayCards = useSettingsStore((s) => s.incrementTodayCards);
  
  // Store
  const updateLastStudied = useSetsStore((s) => s.updateLastStudied);
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const getCardsBySet = useCardsStore((s) => s.getCardsBySet);
  const updateCardSRS = useCardsStore((s) => s.updateCardSRS);
  
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
  const [errorCards, setErrorCards] = useState<Array<{ front: string; back: string; rating: number }>>([]);
  const isCurrentMastered = currentCard ? currentCard.nextReviewDate > Date.now() : false;

  // Инициализация сессии
  useEffect(() => {
    let cards = getCardsBySet(setId);
    const isErrorReview = Boolean(errorCardsFronts && errorCardsFronts.length > 0);
    const onlyUnmastered = Boolean(onlyHard);
    
    // Если переданы ошибочные карточки, фильтруем только их
    if (isErrorReview && errorCardsFronts) {
      const now = Date.now();
      cards = cards.filter(card => {
        const front = card.frontText ?? (card as any).front ?? '';
        return errorCardsFronts.includes(front);
      }).filter(card => {
        // Повторяем только те, что не выучены
        // Выучено = nextReview > сейчас
        return card.nextReviewDate <= now;
      });
      // Очищаем список ошибок для новой сессии повторения
      setErrorCards([]);
    }

    // Если выбран режим "Учить всё" + "только не запомнил", оставляем только невыученные
    if (studyAll && onlyUnmastered) {
      const now = Date.now();
      cards = cards.filter(card => {
        // "Не запомнил" = карточки с nextReview <= сейчас
        return card.nextReviewDate <= now;
      });
    }

    const limitCards = (list: Card[]) => {
      if (!cardLimit) return list;
      const shuffled = [...list].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(cardLimit, shuffled.length));
    };

    const queue = isErrorReview
      // Для повторения ошибок берем только ошибочные карточки, игнорируя расписание SRS
      ? cards
      : studyAll
        // "Учить всё" — включаем все карточки набора (или выбранное число) вне зависимости от статуса
        ? limitCards(cards)
        : buildStudyQueue(
            cards,
            settings.dailyNewCardsLimit,
            settings.dailyReviewLimit
          );

    if (queue.length === 0) {
      navigation.goBack();
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
  }, [setId, errorCardsFronts, studyAll, cardLimit, onlyHard]);

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

      // Логика: 1,2 = ошибка, 3,4 = правильно
      const isCorrect = rating >= 3;
      
      // Если ошибка, добавляем в список ошибочных карточек
      if (!isCorrect) {
        setErrorCards(prev => [...prev, {
          front: currentCard.frontText ?? (currentCard as any).front ?? '',
          back: currentCard.backText ?? (currentCard as any).back ?? '',
          rating,
        }]);
      }

      // Рассчитываем новые SRS параметры
      const result = calculateNextReview(currentCard, rating);

      // Обновляем карточку
      updateCardSRS(currentCard.id, {
        learningStep: result.newLearningStep,
        nextReviewDate: result.nextReviewDate,
        lastReviewDate: Date.now(),
        status: result.newStatus,
      });
      // Обновляем статистику набора (Запомнил/Не запомнил)
      const statsSnapshot = selectSetStats(setId);
      updateSetStats(setId, {
        cardCount: statsSnapshot.total,
        newCount: statsSnapshot.newCount,
        learningCount: statsSnapshot.learningCount,
        reviewCount: statsSnapshot.reviewCount,
        masteredCount: statsSnapshot.masteredCount,
      });

      // Обновляем статистику
      incrementTodayCards();

      // Переход к следующей карточке
      if (session && session.currentIndex + 1 >= session.queue.length) {
        // Переходим на экран результатов
        const totalCards = session.queue.length;
        const learnedCards = totalCards - errorCards.length - (isCorrect ? 0 : 1);
        const timeSpent = Math.floor((Date.now() - session.startedAt) / 1000);
        const errors = errorCards.length + (isCorrect ? 0 : 1);

        navigation.replace('StudyResults', {
          setId,
          totalCards,
          learnedCards,
          timeSpent,
          errors,
          errorCards: isCorrect ? errorCards : [...errorCards, {
            front: currentCard.frontText ?? (currentCard as any).front ?? '',
            back: currentCard.backText ?? (currentCard as any).back ?? '',
            rating,
          }],
          modeTitle: 'Flashcards',
        });
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
    [currentCard, updateCardSRS, incrementTodayCards, session, setId, updateSetStats, navigation, errorCards]
  );

  // Переворот карточки (переключение туда-обратно)
  const handleToggleCard = useCallback(() => {
    if (isFlipped) {
      hideAnswer();
    } else {
      showAnswer();
    }
  }, [hideAnswer, isFlipped, showAnswer]);

  // Завершить сессию
  const handleFinish = useCallback(() => {
    endSession();
    navigation.goBack();
  }, [endSession, navigation]);

  // Прогресс
  const progress = getProgress();

  // CSS стили для анимации карточек (web)
  const frontCardStyle = useMemo(() => {
    if (Platform.OS === 'web') {
      return {
        transform: isFlipped ? 'perspective(1000px) rotateY(180deg)' : 'perspective(1000px) rotateY(0deg)',
        opacity: isFlipped ? 0 : 1,
        transition: 'transform 0.4s ease-in-out, opacity 0.2s ease-in-out',
        backfaceVisibility: 'hidden' as const,
      };
    }
    return {};
  }, [isFlipped]);

  const backCardStyle = useMemo(() => {
    if (Platform.OS === 'web') {
      return {
        transform: isFlipped ? 'perspective(1000px) rotateY(360deg)' : 'perspective(1000px) rotateY(180deg)',
        opacity: isFlipped ? 1 : 0,
        transition: 'transform 0.4s ease-in-out, opacity 0.2s ease-in-out',
        backfaceVisibility: 'hidden' as const,
      };
    }
    return {};
  }, [isFlipped]);

  // Загрузка
  if (!currentCard) {
    return <Loading fullScreen message="Подготовка карточек..." />;
  }

  const front = currentCard.frontText ?? (currentCard as any).front ?? '';
  const back = currentCard.backText ?? (currentCard as any).back ?? '';
  const example = (currentCard as any).example ?? '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Хедер */}}
      <View style={styles.header}>
        <Pressable 
          onPress={handleFinish} 
          hitSlop={20} 
          style={styles.iconButton}
        >
          <ArrowLeft size={28} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Flashcards
        </Text>
        <Pressable hitSlop={20} style={styles.iconButton}>
          <Settings size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Прогресс бар */}
      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {progress.current}/{progress.total}
          </Text>
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
          <View 
            style={[
              styles.progressBarFill, 
              { 
                backgroundColor: colors.primary,
                width: `${progress.percentage}%`
              }
            ]} 
          />
        </View>
      </View>

      {/* Основной контент */}
      <View style={styles.mainContent}>
        {/* Флеш-карточка */}
        <Pressable onPress={handleToggleCard} style={styles.cardWrapper}>
          {/* Передняя сторона (вопрос) */}
          <View 
            style={[
              styles.card, 
              { 
                backgroundColor: colors.surface, 
                borderColor: colors.border,
              },
              frontCardStyle
            ]}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.statusPlaceholder}>
                {isCurrentMastered ? (
                  <View style={[styles.masteredBadge, { backgroundColor: colors.success + '1A', borderColor: colors.success + '40' }]}>
                    <Check size={16} color={colors.success} />
                  </View>
                ) : null}
              </View>
              <Pressable 
                style={[styles.audioButton, { backgroundColor: '#f1f5f9' }]}
                hitSlop={10}
              >
                <Volume2 size={20} color={colors.primary} />
              </Pressable>
            </View>
            
            <View style={styles.cardContent}>
              <Text style={[styles.cardWord, { color: colors.textPrimary }]}>
                {front}
              </Text>
            </View>
            
            <View style={styles.cardBottom}>
              <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
                Нажмите, чтобы перевернуть
              </Text>
            </View>
          </View>

          {/* Задняя сторона (ответ) */}
          <View 
            style={[
              styles.card, 
              styles.cardBack,
              { 
                backgroundColor: colors.surface, 
                borderColor: colors.border,
              },
              backCardStyle
            ]}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.statusPlaceholder}>
                {isCurrentMastered ? (
                  <View style={[styles.masteredBadge, { backgroundColor: colors.success + '1A', borderColor: colors.success + '40' }]}>
                    <Check size={16} color={colors.success} />
                  </View>
                ) : null}
              </View>
              <Pressable 
                style={[styles.audioButton, { backgroundColor: '#f1f5f9' }]}
                hitSlop={10}
              >
                <Volume2 size={20} color={colors.primary} />
              </Pressable>
            </View>
            
            <View style={styles.cardContent}>
              <Text style={[styles.cardWord, { color: colors.textPrimary }]}>
                {back}
              </Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              {example ? (
                <Text style={[styles.cardExample, { color: colors.textSecondary }]}>
                  {example}
                </Text>
              ) : null}
            </View>
            
            <View style={styles.cardBottom} />
          </View>
        </Pressable>

        {/* Вторичные действия */}
        <View style={styles.secondaryActions}>
          <Pressable 
            style={styles.starButton}
            hitSlop={10}
          >
            <Star size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Нижняя панель SRS - всегда доступна */}
      <View style={[styles.bottomPanel, { backgroundColor: colors.background }]}>
        <Text style={[styles.rateHint, { color: colors.textSecondary }]}>
          Оцени, насколько уверенно знаешь
        </Text>
        <View style={styles.ratingGrid}>
          <Pressable 
            onPress={() => handleRate(1)}
            style={[styles.ratingButton, styles.ratingFail]}
          >
            <Text style={styles.ratingFailText}>Не знаю</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleRate(2)}
            style={[styles.ratingButton, styles.ratingHard]}
          >
            <Text style={styles.ratingHardText}>Сомнев...</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleRate(3)}
            style={[styles.ratingButton, styles.ratingGood]}
          >
            <Text style={styles.ratingGoodText}>Почти</Text>
          </Pressable>
          <Pressable 
            onPress={() => handleRate(4)}
            style={[styles.ratingButton, styles.ratingEasy]}
          >
            <Text style={styles.ratingEasyText}>Уверенно</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ==================== СТИЛИ ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Progress
  progressSection: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 8,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Main content
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  // Card
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    maxHeight: 420,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  cardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPlaceholder: {
    width: 40,
    height: 32,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  masteredBadge: {
    borderWidth: 1,
    borderRadius: spacing.m,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  audioButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  cardWord: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  divider: {
    width: 48,
    height: 2,
    borderRadius: 1,
  },
  cardExample: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 26,
  },
  cardBottom: {
    paddingTop: 24,
  },
  tapHint: {
    fontSize: 14,
    textAlign: 'center',
  },

  // Secondary actions
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 32,
    width: CARD_WIDTH,
  },
  starButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Bottom panel
  bottomPanel: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  rateHint: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
  },
  ratingGrid: {
    flexDirection: 'row',
    gap: 8,
    maxWidth: 448,
    alignSelf: 'center',
    width: '100%',
  },
  ratingButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingFail: {
    backgroundColor: '#fef2f2',
  },
  ratingFailText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
  },
  ratingHard: {
    backgroundColor: '#fff7ed',
  },
  ratingHardText: {
    color: '#ea580c',
    fontSize: 13,
    fontWeight: '700',
  },
  ratingGood: {
    backgroundColor: '#f0f9ff',
  },
  ratingGoodText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '700',
  },
  ratingEasy: {
    backgroundColor: '#2d65e6',
  },
  ratingEasyText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Complete screen
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
    width: '100%',
  },
  completeIcon: {
    fontSize: 64,
    marginBottom: spacing.m,
  },
  completeText: {
    marginTop: spacing.xs,
    marginBottom: spacing.l,
  },
  statsCard: {
    width: '100%',
    padding: spacing.m,
    borderRadius: 16,
    marginBottom: spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
  },
  finishButton: {
    marginTop: spacing.m,
  },
});
