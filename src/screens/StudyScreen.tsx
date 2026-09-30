/**
 * Study Screen
 * @description Экран изучения карточек с CSS-анимациями для web
 */
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable, Dimensions, Animated, Modal, AppState } from 'react-native';
import { useCardsStore, useSetsStore, useStudyStore, useThemeColors, useSettingsStore, selectSetStats } from '@/store';
import { Text, Loading } from '@/components/common';
import { Button, ProgressBar, ScreenHeader, Switch } from '@/components/ui';
import { buildStudyQueue, isCardLearned } from '@/services/SRSService';
import { ProgressService } from '@/services/ProgressService';
import { lessonPhaseForAnswer } from '@/services/lessonFlow';
import { useLessonStore } from '@/store/lessonStore';
import { spacing, borderRadius, heights, iconSize, screenPadding, alpha } from '@/constants';
import { DatabaseService, Analytics } from '@/services';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Rating, Card } from '@/types';
import { Settings, Volume2, Check } from 'lucide-react-native';
import { speak, resolveSpeechLang, prefetchSpeech, cardSpeechLangs } from '@/utils/speech';
import { triggerHaptic } from '@/utils/haptic';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { setId, mode, errorCardsFronts, studyAll, cardLimit, onlyHard, dueCardIds, phaseId, totalPhaseCards, studiedInPhase = 0, phaseOffset = 0, phaseFailedIds, lesson } = route.params;
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
  const currentPhaseId = useRef(phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);
  // Количество ошибочных карточек из прошлых порций в текущей очереди
  const pendingCardsInQueueRef = useRef(0);
  // Analytics: момент показа текущей карточки
  const cardShownAtRef = useRef(Date.now());
  
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
  const [errorCards, setErrorCards] = useState<Array<{ id: string; front: string; back: string; rating: number }>>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cardVisible, setCardVisible] = useState(true);
  const reverseEnabled = useSettingsStore((s) => s.settings.reverseCards);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const sheetTranslate = useRef(new Animated.Value(-220)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isCurrentMastered = currentCard ? isCardLearned(currentCard) : false;
  const handleSpeak = useCallback(
    (text: string, langHint?: string, counterpart?: string) => {
      const normalized = (text || '').trim();
      if (!normalized) return;
      const lang = resolveSpeechLang(normalized, langHint, counterpart);
      speak(normalized, lang).catch((error) => {
        console.warn('[StudyScreen] TTS error:', error);
      });
    },
    []
  );

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
  }, [setId, errorCardsFronts, studyAll, cardLimit, onlyHard, dueCardIds, phaseId, phaseOffset, phaseFailedList]);

  // Получить текущую карточку из очереди
  useEffect(() => {
    if (session && session.queue[session.currentIndex]) {
      const cardId = session.queue[session.currentIndex];
      const card = useCardsStore.getState().getCard(cardId);
      setCurrentCard(card || null);
      cardShownAtRef.current = Date.now();
    }
  }, [session?.currentIndex]);

  // Обработка оценки
  const handleRate = useCallback(
    async (rating: Rating) => {
      if (!currentCard) return;
      triggerHaptic('selection');

      // Логика: 1,2 = ошибка, 3,4 = правильно
      const isCorrect = rating >= 3;

      // Analytics: card_answered
      const ratingMap: Record<number, 'again' | 'hard' | 'good' | 'easy'> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
      Analytics.cardAnswered({
        correct: isCorrect,
        rating: ratingMap[rating],
        timeSpentMs: Date.now() - cardShownAtRef.current,
        mode: 'flashcard',
      });
      
      // Если ошибка, добавляем в список ошибочных карточек (с id для фаз)
      if (!isCorrect) {
        setErrorCards(prev => [...prev, {
          id: currentCard.id,
          front: currentCard.frontText ?? (currentCard as any).front ?? '',
          back: currentCard.backText ?? (currentCard as any).back ?? '',
          rating,
        }]);
      }

      // Урок дня: считаем по состоянию карточки до ответа
      const lessonPhase = lessonPhaseForAnswer(lesson?.part, currentCard);
      if (lessonPhase) useLessonStore.getState().recordAnswer(lessonPhase, currentCard.id);
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
    [currentCard, incrementTodayCards, session, setId, updateSetStats, navigation, errorCards, studiedInPhase, phaseOffset, isErrorReview, lesson]
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
    navigation.goBack();
  }, [finishStudySession, endSession, navigation, session, setId]);

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

  // Анимация переворота карточки (reanimated для native + web)
  const flipProgress = useSharedValue(0);

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

  // Заранее озвучиваем вопрос и ответ текущей и следующей карточки — кнопка динамика играет сразу
  useEffect(() => {
    if (!session) return;
    const ids = [session.queue[session.currentIndex], session.queue[session.currentIndex + 1]].filter(Boolean);
    const items: Array<{ text: string; lang: string }> = [];
    for (const id of ids) {
      const card = useCardsStore.getState().cards[id];
      if (!card) continue;
      const langs = cardSpeechLangs(card);
      const front = (card.frontText ?? (card as any).front ?? '').trim();
      const back = (card.backText ?? (card as any).back ?? '').trim();
      if (front) items.push({ text: front, lang: resolveSpeechLang(front, langs.front, back) });
      if (back) items.push({ text: back, lang: resolveSpeechLang(back, langs.back, front) });
    }
    prefetchSpeech(items);
  }, [session?.currentIndex, session?.queue]);

  // Загрузка
  if (!currentCard) {
    return <Loading fullScreen message="Подготовка карточек..." />;
  }

  const baseFront = currentCard.frontText ?? (currentCard as any).front ?? '';
  const baseBack = currentCard.backText ?? (currentCard as any).back ?? '';
  const example = (currentCard as any).example ?? '';

  const questionText = reverseEnabled ? baseBack : baseFront;
  const answerText = reverseEnabled ? baseFront : baseBack;
  const { front: frontLang, back: backLang } = cardSpeechLangs(currentCard);
  const questionLang = reverseEnabled ? backLang : frontLang;
  const answerLang = reverseEnabled ? frontLang : backLang;

  // Кнопки оценки: цвета оценок SRS, текст — «текстовые» токены; «Уверенно» — главная кнопка
  const ratingOptions: Array<{ rating: Rating; label: string; bg: string; text: string }> = [
    { rating: 1, label: 'Не знаю', bg: alpha(colors.ratingAgain, 10), text: colors.errorText },
    { rating: 2, label: 'Сомнев...', bg: alpha(colors.ratingHard, 10), text: colors.warningText },
    { rating: 3, label: 'Почти', bg: alpha(colors.ratingEasy, 10), text: colors.info },
    { rating: 4, label: 'Уверенно', bg: colors.primaryFill, text: colors.onPrimary },
  ];
  const ratingA11y: Record<Rating, string> = { 1: 'Не знаю', 2: 'Сомневаюсь', 3: 'Почти', 4: 'Уверенно' };

  const renderCardTop = (onSpeak: () => void) => (
    <View style={styles.cardTopRow}>
      <View style={styles.statusPlaceholder}>
        {isCurrentMastered ? (
          <View
            accessible
            accessibilityLabel="Выучено"
            style={[styles.masteredBadge, { backgroundColor: alpha(colors.success, 10), borderColor: alpha(colors.success, 40) }]}
          >
            <Check size={iconSize.xs} color={colors.successText} />
          </View>
        ) : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.audioButton, { backgroundColor: pressed ? alpha(colors.primary, 20) : colors.surfaceMuted }]}
        hitSlop={spacing.xxs}
        accessibilityRole="button"
        accessibilityLabel="Прослушать"
        onPress={(e) => { e.stopPropagation(); triggerHaptic('selection'); onSpeak(); }}
      >
        <Volume2 size={iconSize.s} color={colors.primary} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Карточки"
        onBack={handleFinish}
        right={<Button variant="icon" icon={Settings} accessibilityLabel="Настройки" onPress={openSettings} />}
      />

      {/* Прогресс бар */}
      <View style={styles.progressSection}>
        <Text variant="bodySmall" style={[styles.semibold, { color: colors.textSecondary }]}>
          {progress.current}/{progress.total}
        </Text>
        <ProgressBar progress={progress.percentage} accessibilityLabel="Прогресс" />
      </View>

      {/* Основной контент */}
      <View style={styles.mainContent}>
        {/* Флеш-карточка */}
        <Pressable
          onPress={handleToggleCard}
          accessibilityRole="button"
          accessibilityLabel={isFlipped ? `Ответ: ${answerText}. Нажми, чтобы перевернуть` : `${questionText}. Нажми, чтобы перевернуть`}
          style={[
            styles.cardWrapper,
            { opacity: cardVisible ? 1 : 0 },
          ]}
        >
          {/* Передняя сторона (вопрос) */}
          <ReAnimated.View style={[styles.cardAnim, frontAnimStyle]} pointerEvents={isFlipped ? 'none' : 'auto'}>
            <View style={[styles.cardInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {renderCardTop(() => handleSpeak(questionText, questionLang, answerText))}

              <View style={styles.cardContent}>
                <Text variant="h2" style={[styles.cardWord, { color: colors.textPrimary }]}>
                  {questionText}
                </Text>
              </View>

              <View style={styles.cardBottom}>
                <Text variant="bodySmall" align="center" style={{ color: colors.textSecondary }}>
                  Нажми, чтобы перевернуть
                </Text>
              </View>
            </View>
          </ReAnimated.View>

          {/* Задняя сторона (ответ) */}
          <ReAnimated.View style={[styles.cardAnim, backAnimStyle]} pointerEvents={isFlipped ? 'auto' : 'none'}>
            <View style={[styles.cardInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {renderCardTop(() => handleSpeak(answerText, answerLang, questionText))}

              <View style={styles.cardContent}>
                <Text variant="h2" style={[styles.cardWord, { color: colors.textPrimary }]}>
                  {answerText}
                </Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                {example ? (
                  <Text variant="bodyLarge" align="center" style={{ color: colors.textSecondary }}>
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
          <Pressable accessibilityRole="button" style={styles.backdrop} onPress={closeSettings} accessibilityLabel="Закрыть настройки">
            <Animated.View
              pointerEvents="none"
              style={[styles.backdropTint, { opacity: backdropOpacity, backgroundColor: colors.overlay }]}
            />
          </Pressable>

          {/* Панель настроек выезжает сверху (формат прежний) */}
          <Animated.View
            style={[
              styles.settingsSheet,
              {
                top: insets.top + spacing.m,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                transform: [{ translateY: sheetTranslate }],
              },
            ]}
          >
            <View style={styles.settingsRow}>
              <View style={[styles.settingsIconWrap, { backgroundColor: alpha(colors.primary, 10) }]}>
                <Settings size={iconSize.s} color={colors.primary} />
              </View>
              <View style={styles.settingsTexts}>
                <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>Реверс карточек</Text>
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  Сначала показывать обратную сторону
                </Text>
              </View>
              <Switch value={reverseEnabled} onValueChange={handleToggleReverse} accessibilityLabel="Реверс карточек" />
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Нижняя панель SRS - всегда доступна */}
      <View style={[styles.bottomPanel, { backgroundColor: colors.background }]}>
        <Text variant="bodySmall" align="center" style={[styles.rateHint, { color: colors.textSecondary }]}>
          Оцени, насколько уверенно знаешь
        </Text>
        <View style={styles.ratingGrid}>
          {ratingOptions.map(({ rating, label, bg, text }) => (
            <Pressable
              key={rating}
              onPress={() => handleRate(rating)}
              accessibilityRole="button"
              accessibilityLabel={ratingA11y[rating]}
              style={({ pressed }) => [styles.ratingButton, { backgroundColor: bg }, pressed && styles.pressed]}
            >
              <Text variant="label" numberOfLines={1} style={{ color: text }}>{label}</Text>
            </Pressable>
          ))}
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
  semibold: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },

  // Progress
  progressSection: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },

  // Main content
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
  },

  // Card
  cardWrapper: {
    width: CARD_WIDTH,
    height: Math.min(CARD_HEIGHT, 420),
    position: 'relative',
  },
  cardAnim: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  cardInner: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.l,
    // Без overflow:'hidden': фон и рамка сами скругляются через borderRadius,
    // а маска слоя (masksToBounds) в связке с 3D-трансформом на iOS
    // рендерится offscreen и может срезать верх глифов.
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
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  audioButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.m,
  },
  cardWord: {
    textAlign: 'center',
    // Высота строки ×1.5 и отступ сверху: запас под умлауты и диакритику
    // над заглавными (Ä, Ö, Ü, É), иначе iOS срезает их по рамке Text
    lineHeight: 36,
    paddingTop: spacing.xxs,
  },
  divider: {
    width: 48,
    height: 2,
    borderRadius: borderRadius.full,
  },
  cardBottom: {
    paddingTop: spacing.l,
  },

  // Bottom panel
  bottomPanel: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.l,
    paddingTop: spacing.xs,
  },
  rateHint: {
    marginBottom: spacing.s,
  },
  ratingGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: 448,
    alignSelf: 'center',
    width: '100%',
  },
  ratingButton: {
    flex: 1,
    height: heights.button,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxs,
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTint: {
    flex: 1,
  },
  // Без тени — панель отделяет затемнение
  settingsSheet: {
    position: 'absolute',
    left: screenPadding,
    right: screenPadding,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  settingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTexts: {
    flex: 1,
  },
});
