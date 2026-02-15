/**
 * Study Screen
 * @description Экран изучения карточек с CSS-анимациями для web
 */
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable, Dimensions, Animated, Modal, Switch } from 'react-native';
import { useCardsStore, useSetsStore, useStudyStore, useThemeColors, useSettingsStore, selectSetStats } from '@/store';
import { Text, Loading } from '@/components/common';
import { calculateNextReview, buildStudyQueue } from '@/services/SRSService';
import { spacing } from '@/constants';
import { DatabaseService } from '@/services';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Rating, Card } from '@/types';
import { ArrowLeft, Settings, Volume2, Check } from 'lucide-react-native';
import { speak, detectLanguage } from '@/utils/speech';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing as REasing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(340, SCREEN_WIDTH - 32);
const CARD_HEIGHT = CARD_WIDTH * 1.25;

type Props = RootStackScreenProps<'Study'>;

export function StudyScreen({ navigation, route }: Props) {
  const { setId, mode, errorCardsFronts, studyAll, cardLimit, onlyHard, phaseId, totalPhaseCards, studiedInPhase = 0, phaseOffset = 0, phaseFailedIds } = route.params;
  const colors = useThemeColors();
  const settings = useSettingsStore((s) => s.settings);
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const incrementTodayCards = useSettingsStore((s) => s.incrementTodayCards);
  const isErrorReview = Boolean(errorCardsFronts && errorCardsFronts.length > 0);
  const phaseFailedList = React.useMemo(
    () => phaseFailedIds || [],
    [phaseFailedIds ? phaseFailedIds.join('|') : '']
  );
  
  // Генерируем phaseId при первом запуске (если не передан)
  const currentPhaseId = useRef(phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);
  // Количество ошибочных карточек из прошлых порций в текущей очереди
  const pendingCardsInQueueRef = useRef(0);
  
  // Store
  const updateLastStudied = useSetsStore((s) => s.updateLastStudied);
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const getCardsBySet = useCardsStore((s) => s.getCardsBySet);
  const updateCardSRS = useCardsStore((s) => s.updateCardSRS);
  const currentSet = useSetsStore((s) => s.getSet(setId));
  
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
  const [errorCards, setErrorCards] = useState<Array<{ id: string; front: string; back: string; rating: number }>>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const reverseEnabled = useSettingsStore((s) => s.settings.reverseCards);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const sheetTranslate = useRef(new Animated.Value(-220)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isCurrentMastered = currentCard ? currentCard.nextReviewDate > Date.now() : false;
  const overlayColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.55)';
  const settingsSheetBackground = theme === 'dark' ? '#0f172a' : colors.surface;
  const settingsSheetBorder = theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : colors.border;
  const normalizeLang = (lang?: string): string | undefined => {
    if (!lang) return undefined;
    const lower = lang.toLowerCase();
    if (lower.startsWith('ru')) return 'ru-RU';
    if (lower.startsWith('de')) return 'de-DE';
    if (lower.startsWith('en')) return 'en-US';
    return lang;
  };

  const handleSpeak = useCallback(
    (text: string, langHint?: string, counterpart?: string) => {
      const normalized = (text || '').trim();
      if (!normalized) return;
      const lang =
        normalizeLang(langHint) ||
        detectLanguage(normalized, counterpart);
      speak(normalized, lang).catch((error) => {
        console.warn('[StudyScreen] TTS error:', error);
      });
    },
    []
  );

  // Инициализация сессии
  useEffect(() => {
    let cards = getCardsBySet(setId);
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
        console.warn('[StudyScreen] Не удалось найти ошибочные карточки по ID, пробуем найти в наборе');
        const pendingSet = new Set(pendingIds);
        const foundInSet = cards.filter(c => pendingSet.has(c.id));
        pendingCards.push(...foundInSet);
      }

      // Получаем оставшиеся карточки по offset
      const remaining = phaseOffset > 0 ? cards.slice(phaseOffset) : cards;
      
      // Исключаем из remaining те, что уже есть в pendingCards (ошибочные)
      const pendingIdsSet = new Set(pendingCards.map(c => c.id));
      const filteredRemaining = remaining.filter(c => !pendingIdsSet.has(c.id));

      // Собираем уникальные карточки: сначала ошибочные, потом новые
      const map = new Map<string, Card>();
      [...pendingCards, ...filteredRemaining].forEach((card) => {
        if (!map.has(card.id)) {
          map.set(card.id, card);
        }
      });
      cards = Array.from(map.values());
      
      console.log('[StudyScreen] Фаза:', {
        phaseId,
        phaseOffset,
        pendingIds: pendingIds.length,
        pendingCards: pendingCards.length,
        remaining: filteredRemaining.length,
        total: cards.length
      });
      
      // Сохраняем количество ошибочных карточек для правильного расчёта phaseOffset
      pendingCardsInQueueRef.current = pendingCards.length;
    } else {
      pendingCardsInQueueRef.current = 0;
    }
    
    // Если переданы ошибочные карточки, фильтруем только их
    if (isErrorReview && errorCardsFronts) {
      cards = cards.filter(card => {
        const front = card.frontText ?? (card as any).front ?? '';
        return errorCardsFronts.includes(front);
      });
      // В фазах повторяем ошибки сразу, без проверки расписания SRS (nextReviewDate)
      if (!phaseId) {
        const now = Date.now();
        cards = cards.filter(card => card.nextReviewDate <= now);
      }
      // Очищаем список ошибок для новой сессии повторения
      setErrorCards([]);
    }

    // Если выбран режим "Учить всё" + "только не запомнил", оставляем только невыученные
    // НО: исключаем из фильтра ошибочные карточки фазы (phaseFailedIds), они должны быть показаны независимо от nextReviewDate
    if (studyAll && onlyUnmastered) {
      const now = Date.now();
      const failedIdsSet = new Set(phaseFailedList || []);
      cards = cards.filter(card => {
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

    console.log('[StudyScreen] Очередь сформирована:', {
      queueLength: queue.length,
      cardsLength: cards.length,
      isErrorReview,
      studyAll,
      cardLimit,
      phaseId,
      phaseOffset,
      phaseFailedList: phaseFailedList?.length || 0
    });

    if (queue.length === 0) {
      console.warn('[StudyScreen] Пустая очередь');
      
      // Если есть ошибочные карточки, но очередь пустая - это баг, логируем детали
      if (phaseFailedList && phaseFailedList.length > 0) {
        console.error('[StudyScreen] Есть ошибочные карточки, но очередь пустая!', {
          phaseFailedList,
          allCards: getCardsBySet(setId).map(c => c.id)
        });
      }
      
      navigation.goBack();
      return;
    }

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
  }, [setId, errorCardsFronts, studyAll, cardLimit, onlyHard, phaseId, phaseOffset, phaseFailedList]);

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
      
      // Если ошибка, добавляем в список ошибочных карточек (с id для фаз)
      if (!isCorrect) {
        setErrorCards(prev => [...prev, {
          id: currentCard.id,
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

      // Обновляем статистику только для правильных ответов (rating >= 3)
      if (isCorrect) {
        incrementTodayCards();
      }

      // Переход к следующей карточке
      if (session && session.currentIndex + 1 >= session.queue.length) {
        // Переходим на экран результатов
        const totalCards = session.queue.length;
        const finalErrorCards = isCorrect ? errorCards : [...errorCards, {
          id: currentCard.id,
          front: currentCard.frontText ?? (currentCard as any).front ?? '',
          back: currentCard.backText ?? (currentCard as any).back ?? '',
          rating,
        }];
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
            const front = c.frontText ?? (c as any).front ?? '';
            const back = c.backText ?? (c as any).back ?? '';
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
        const newPhaseFailedIds = Array.from(prevFailed);
        
        console.log('[StudyScreen] Завершение порции:', {
          totalCards,
          newCardsInBatch,
          pendingCardsInQueue: pendingCardsInQueueRef.current,
          learnedCards,
          errors,
          errorCardsWithIds: errorCardsWithIds.map(c => ({ id: c.id, front: c.front })),
          effectiveErrorIds,
          newPhaseFailedIds,
          newStudiedInPhase,
          newPhaseOffset,
          phaseTotal
        });

        navigation.replace('StudyResults', {
          setId,
          totalCards,
          learnedCards,
          timeSpent,
          errors,
          errorCards: errorCardsWithIds,
          modeTitle: 'Flashcards',
          cardLimit,
          nextMode: 'study',
          // Параметры фазы
          phaseId: currentPhaseId.current,
          totalPhaseCards: phaseTotal,
          studiedInPhase: newStudiedInPhase,
          phaseOffset: newPhaseOffset,
          phaseFailedIds: newPhaseFailedIds,
        });
      } else {
        useStudyStore.setState((s) => ({
          ...s,
          session: s.session
            ? { ...s.session, currentIndex: s.session.currentIndex + 1 }
            : null,
          isFlipped: false,
        }));
        setCardVisible(false);
        requestAnimationFrame(() => {
          setTimeout(() => setCardVisible(true), 60);
        });
      }
    },
    [currentCard, updateCardSRS, incrementTodayCards, session, setId, updateSetStats, navigation, errorCards, studiedInPhase, phaseOffset, isErrorReview]
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

  // Анимация переворота карточки (reanimated для native + web)
  const flipProgress = useSharedValue(0);

  useEffect(() => {
    flipProgress.value = withTiming(isFlipped ? 1 : 0, {
      duration: 400,
      easing: REasing.inOut(REasing.ease),
    });
  }, [isFlipped]);

  const frontAnimStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [1, 1, 0, 0]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden' as const,
    };
  });

  const backAnimStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [0, 0, 1, 1]);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden' as const,
    };
  });

  // Загрузка
  if (!currentCard) {
    return <Loading fullScreen message="Подготовка карточек..." />;
  }

  const baseFront = currentCard.frontText ?? (currentCard as any).front ?? '';
  const baseBack = currentCard.backText ?? (currentCard as any).back ?? '';
  const example = (currentCard as any).example ?? '';

  const questionText = reverseEnabled ? baseBack : baseFront;
  const answerText = reverseEnabled ? baseFront : baseBack;
  const frontLang = normalizeLang(currentSet?.languageFrom);
  const backLang = normalizeLang(currentSet?.languageTo);
  const questionLang = reverseEnabled ? backLang : frontLang;
  const answerLang = reverseEnabled ? frontLang : backLang;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Хедер */}
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
        <Pressable hitSlop={20} style={styles.iconButton} onPress={openSettings}>
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
        <Pressable
          onPress={handleToggleCard}
          style={[
            styles.cardWrapper,
            { opacity: cardVisible ? 1 : 0 },
          ]}
        >
          {/* Передняя сторона (вопрос) */}
          <ReAnimated.View style={[styles.cardAnim, frontAnimStyle]}>
            <View
              style={[
                styles.cardInner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
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
                  onPress={(e) => { e.stopPropagation(); handleSpeak(questionText, questionLang, answerText); }}
                >
                  <Volume2 size={20} color={colors.primary} />
                </Pressable>
              </View>

              <View style={styles.cardContent}>
                <Text style={[styles.cardWord, { color: colors.textPrimary }]}>
                  {questionText}
                </Text>
              </View>

              <View style={styles.cardBottom}>
                <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
                  Нажмите, чтобы перевернуть
                </Text>
              </View>
            </View>
          </ReAnimated.View>

          {/* Задняя сторона (ответ) */}
          <ReAnimated.View style={[styles.cardAnim, backAnimStyle]}>
            <View
              style={[
                styles.cardInner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
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
                  onPress={(e) => { e.stopPropagation(); handleSpeak(answerText, answerLang, questionText); }}
                >
                  <Volume2 size={20} color={colors.primary} />
                </Pressable>
              </View>

              <View style={styles.cardContent}>
                <Text style={[styles.cardWord, { color: colors.textPrimary }]}>
                  {answerText}
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
          </ReAnimated.View>
        </Pressable>
      </View>

      <Modal
        visible={isSettingsOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeSettings}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={closeSettings}>
            <Animated.View
              pointerEvents="none"
              style={[styles.backdropTint, { opacity: backdropOpacity, backgroundColor: overlayColor }]}
            />
          </Pressable>

          <Animated.View
            style={[
              styles.settingsSheet,
              {
                backgroundColor: settingsSheetBackground,
                borderColor: settingsSheetBorder,
                transform: [{ translateY: sheetTranslate }],
              },
            ]}
          >
            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: colors.textPrimary }]}>Реверс</Text>
              <Switch
                value={reverseEnabled}
                onValueChange={handleToggleReverse}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={theme === 'dark' ? '#0f172a' : '#ffffff'}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>

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
  cardAnim: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  cardInner: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    overflow: 'hidden',
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
    lineHeight: 38,
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

  // Hint text inside card (plain, no background/blur)
  hintContainer: {
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 12,
    alignItems: 'flex-end',
  },
  hintHidden: {
    display: 'none',
  },
  hintText: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
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
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTint: {
    flex: 1,
    backgroundColor: '#00000055',
  },
  settingsSheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.m,
    paddingTop: 50,
    paddingBottom: spacing.m,
    borderBottomWidth: 1,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 6,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsLabel: {
    fontSize: 16,
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
