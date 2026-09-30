/**
 * Audio Learning Screen
 * @description Экран режима Audio Tap - произнеси перевод слова за 5 секунд
 */
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  Vibration,
  Animated,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Settings, Mic, Check, X, AudioLines } from 'lucide-react-native';
import { useThemeColors, useSettingsStore, useCardsStore, useSetsStore } from '@/store';
import { Text } from '@/components/common';
import { Button, ProgressBar, ScreenHeader, Switch, toast, useScreenBottomInset } from '@/components/ui';
import { spacing, borderRadius, heights, iconSize, screenPadding, alpha } from '@/constants';
import { DatabaseService } from '@/services';
import { playCorrectSound, preloadSound } from '@/utils/sound';
import {
  requestMicrophonePermission,
  normalizeLangForSTT,
  isAnswerCorrect,
  startContinuousListening,
  stopContinuousListening,
  setContinuousHandlers,
  resetContinuousBaseline,
} from '@/utils/speechRecognition';
import type { RecognitionResult } from '@/utils/speechRecognition';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(280, SCREEN_WIDTH - 64);
const CARD_ASPECT_RATIO = 5 / 4;
const CARD_HEIGHT = CARD_WIDTH * CARD_ASPECT_RATIO;

type SessionState = 'idle' | 'listening' | 'correct' | 'incorrect';

type Props = RootStackScreenProps<'AudioLearning'>;

export function AudioLearningScreen({ navigation, route }: Props) {
  const { setId, cardLimit, dueCardIds, phaseId, totalPhaseCards, studiedInPhase = 0, phaseOffset = 0, phaseFailedIds } = route.params;
  const colors = useThemeColors();

  // Store
  const getCardsBySet = useCardsStore((s) => s.getCardsBySet);
  const updateLastStudied = useSetsStore((s) => s.updateLastStudied);
  const currentSet = useSetsStore((s) => s.getSet(setId));
  const reverseEnabled = useSettingsStore((s) => s.settings.reverseCards);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const sheetTranslate = useRef(new Animated.Value(-220)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Верхний safe area уже учтён в App.tsx; снизу — свой (экран без панели вкладок)
  const insets = useSafeAreaInsets();
  const bottomInset = useScreenBottomInset();

  // Phase refs
  const currentPhaseId = useRef(phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);
  const sessionStartTime = useRef(Date.now());

  // State
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorCardIds, setErrorCardIds] = useState<string[]>([]);
  const [partialText, setPartialText] = useState('');
  const [recognizedText, setRecognizedText] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  // Refs for async loop (avoid stale closures)
  const isRunningRef = useRef(false);
  const currentIndexRef = useRef(0);
  const errorCardIdsRef = useRef<string[]>([]);
  const reverseRef = useRef(reverseEnabled);
  reverseRef.current = reverseEnabled;

  // Ref for "Не знаю" button to resolve the listening promise
  const skipResolveRef = useRef<(() => void) | null>(null);

  // Pulsing animation for mic icon
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Cards preparation
  const cards = useMemo(() => {
    let allCards: Card[];
    if (Array.isArray(dueCardIds) && dueCardIds.length > 0) {
      const state = useCardsStore.getState();
      allCards = dueCardIds.map((id) => state.cards[id]).filter(Boolean) as Card[];
    } else {
      const now = Date.now();
      allCards = getCardsBySet(setId).filter(c => c.nextReviewDate <= now);
    }

    if (phaseId) {
      const phaseFailedList = phaseFailedIds || [];
      const state = useCardsStore.getState();

      const pendingCards: Card[] = phaseFailedList
        .map((id) => state.getCard(id))
        .filter((c): c is Card => Boolean(c));

      const remaining = phaseOffset > 0 ? allCards.slice(phaseOffset) : allCards;
      const pendingIdsSet = new Set(pendingCards.map(c => c.id));
      const filteredRemaining = remaining.filter(c => !pendingIdsSet.has(c.id));

      const map = new Map<string, Card>();
      [...pendingCards, ...filteredRemaining].forEach((card) => {
        if (!map.has(card.id)) {
          map.set(card.id, card);
        }
      });
      allCards = Array.from(map.values());
    }

    const limited = cardLimit && cardLimit > 0 ? allCards.slice(0, cardLimit) : allCards;

    if (currentTotalPhaseCards.current === 0) {
      currentTotalPhaseCards.current = limited.length;
    }

    return limited;
  }, [setId, cardLimit, dueCardIds, phaseId, phaseOffset, phaseFailedIds, getCardsBySet]);

  const currentCard = cards[currentIndex] || null;
  const totalCards = cards.length;
  const progress = totalCards > 0 ? Math.round(((currentIndex + 1) / totalCards) * 100) : 0;

  // Preload sounds + update last studied
  useEffect(() => {
    preloadSound('/correct.wav');
    if (setId) updateLastStudied(setId);
  }, [setId, updateLastStudied]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      stopContinuousListening();
    };
  }, []);

  // If no cards, go back
  useEffect(() => {
    if (cards.length === 0) {
      console.warn('[AudioLearningScreen] Нет карточек');
      navigation.goBack();
    }
  }, [cards.length, navigation]);

  // Navigate to results
  const finishSession = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    const errors = errorCardIdsRef.current;
    const learnedCards = cards.length - errors.length;
    // phaseOffset сдвигаем только на НОВЫЕ карточки порции: повторы ошибок прошлой порции
    // идут первыми и к смещению не относятся (как в MultipleChoice/WordBuilder).
    const failedBefore = new Set(phaseFailedIds || []);
    const newCardsInBatch = cards.filter((c) => !failedBefore.has(c.id)).length;
    const timeSpent = Math.round((Date.now() - sessionStartTime.current) / 1000);

    navigation.replace('StudyResults', {
      setId,
      totalCards: cards.length,
      learnedCards,
      timeSpent,
      errors: errors.length,
      errorCards: errors.map(id => {
        const card = cards.find(c => c.id === id);
        return {
          id,
          front: card?.frontText || '',
          back: card?.backText || '',
          rating: 1,
        };
      }),
      modeTitle: 'Аудио',
      nextMode: 'audio',
      cardLimit,
      dueCardIds,
      phaseId: currentPhaseId.current,
      totalPhaseCards: currentTotalPhaseCards.current,
      studiedInPhase: studiedInPhase + learnedCards,
      phaseOffset: phaseOffset + newCardsInBatch,
      phaseFailedIds: errors,
    });
  }, [cards, navigation, setId, cardLimit, dueCardIds, studiedInPhase, phaseOffset, phaseFailedIds]);

  // Process one card then auto-continue (mic stays on between cards)
  const processCard = useCallback(async (idx: number, technicalRetries = 0) => {
    if (!isRunningRef.current) return;

    const card = cards[idx];
    if (!card) return;

    const isReversed = reverseRef.current;
    const expectedAnswer = isReversed ? (card.frontText || '') : (card.backText || '');

    // Skip empty cards
    if (!expectedAnswer.trim()) {
      if (idx < cards.length - 1) {
        const next = idx + 1;
        currentIndexRef.current = next;
        setCurrentIndex(next);
        setTimeout(() => processCard(next), 100);
      } else {
        finishSession();
      }
      return;
    }

    // Start listening for this card (mic is already running)
    setSessionState('listening');
    setPartialText('');
    setRecognizedText('');
    // Discard whatever the still-running native session already transcribed for previous
    // cards, so this card's partial/final results only reflect speech said from now on.
    resetContinuousBaseline();

    // Wait for correct answer or "Не знаю" skip
    const result = await new Promise<RecognitionResult>((resolve) => {
      let settled = false;
      let allAlternatives: string[] = [];

      // Allow "Не знаю" button to resolve the promise
      skipResolveRef.current = () => {
        if (!settled) {
          settled = true;
          skipResolveRef.current = null;
          setContinuousHandlers(null, null);
          resolve({
            recognized: false,
            alternatives: allAlternatives,
            isCorrect: false,
            timedOut: false,
          });
        }
      };

      setContinuousHandlers(
        (results) => {
          allAlternatives = results;
          if (isAnswerCorrect(results, expectedAnswer)) {
            if (!settled) {
              settled = true;
              skipResolveRef.current = null;
              setContinuousHandlers(null, null);
              resolve({
                recognized: true,
                alternatives: results,
                isCorrect: true,
                timedOut: false,
              });
            }
          }
        },
        (partial) => setPartialText(partial),
        () => {
          // Реальный сбой движка (не "не расслышал") — не должен засчитываться как
          // неправильный ответ. См. план, пункт 51.
          if (!settled) {
            settled = true;
            skipResolveRef.current = null;
            setContinuousHandlers(null, null);
            resolve({
              recognized: false,
              alternatives: allAlternatives,
              isCorrect: false,
              timedOut: false,
              technicalError: true,
            });
          }
        },
      );
    });

    // Stopped while listening?
    if (!isRunningRef.current) {
      setSessionState('idle');
      return;
    }

    const advance = () => {
      if (idx < cards.length - 1) {
        const next = idx + 1;
        currentIndexRef.current = next;
        setCurrentIndex(next);
        setSessionState('listening');
        setPartialText('');
        setRecognizedText('');
        setTimeout(() => processCard(next), 200);
      } else {
        finishSession();
      }
    };

    // Технический сбой распознавания — не засчитываем как неправильный ответ, просто слушаем
    // эту же карточку ещё раз (мик уже перезапускается автоматически). После нескольких сбоев
    // подряд на одной карточке не блокируем сессию бесконечно — переходим дальше без штрафа.
    // См. план, пункт 51.
    if (result.technicalError) {
      if (technicalRetries < 2) {
        setTimeout(() => processCard(idx, technicalRetries + 1), 300);
      } else {
        advance();
      }
      return;
    }

    // Show result
    setRecognizedText(result.alternatives[0] || '');

    if (result.isCorrect) {
      setSessionState('correct');
      playCorrectSound();
      if (useSettingsStore.getState().settings.hapticEnabled) Vibration.vibrate(20);
    } else {
      setSessionState('incorrect');
      errorCardIdsRef.current = [...errorCardIdsRef.current, card.id];
      setErrorCardIds([...errorCardIdsRef.current]);
      if (useSettingsStore.getState().settings.hapticEnabled) Vibration.vibrate([0, 50, 50, 50]);
    }

    // Show result: 1s for correct, 2s for incorrect (to read the answer)
    await new Promise(r => setTimeout(r, result.isCorrect ? 1000 : 2000));

    if (!isRunningRef.current) {
      setSessionState('idle');
      return;
    }

    advance();
  }, [cards, finishSession]);

  // Compute the STT language based on current reverse state
  const getAnswerLang = useCallback((isReversed: boolean) => {
    // Normal: front=languageFrom is shown, user speaks answer in languageTo
    // Reversed: back=languageTo is shown, user speaks answer in languageFrom
    const lang = isReversed
      ? (currentSet?.languageFrom || currentSet?.languageTo || 'en')
      : (currentSet?.languageTo || currentSet?.languageFrom || 'en');
    return normalizeLangForSTT(lang);
  }, [currentSet]);

  const handleBack = useCallback(() => {
    isRunningRef.current = false;
    stopContinuousListening();
    navigation.goBack();
  }, [navigation]);

  // Start session
  const handleStart = useCallback(async () => {
    if (isRunningRef.current) return;

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      toast.error('Нет доступа к микрофону. Разреши его в настройках телефона, чтобы заниматься в режиме «Аудио»');
      return;
    }

    const lang = getAnswerLang(reverseRef.current);

    isRunningRef.current = true;
    setIsRunning(true);
    sessionStartTime.current = Date.now();

    try {
      // Start mic once — it stays on for the entire session
      await startContinuousListening(lang);
      processCard(currentIndexRef.current);
    } catch (e) {
      // Раньше при отказе Voice.start() (например, разрешение реально не было выдано, несмотря
      // на то что requestMicrophonePermission на iOS сейчас безусловно возвращает true — см.
      // план, пункт 49) UI тихо зависал в состоянии "идёт сессия". См. план, пункт 50.
      console.error('[AudioLearning] Failed to start listening:', e);
      isRunningRef.current = false;
      setIsRunning(false);
      toast.error('Не удалось запустить микрофон. Разреши доступ в настройках устройства и попробуй снова');
    }
  }, [processCard, getAnswerLang]);

  // Stop session
  const handleStop = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    skipResolveRef.current = null;
    stopContinuousListening();
    setSessionState('idle');
    setPartialText('');
    setRecognizedText('');
  }, []);

  // Skip ("Не знаю") handler
  const handleSkip = useCallback(() => {
    if (skipResolveRef.current) {
      skipResolveRef.current();
    }
  }, []);

  // Pulsing mic animation
  useEffect(() => {
    if (sessionState === 'listening') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [sessionState, pulseAnim]);

  // Settings callbacks
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

  const handleToggleReverse = useCallback(async (value: boolean) => {
    updateSettings({ reverseCards: value });
    DatabaseService.saveSettings();
    // If session is running, restart STT with the new answer language
    if (isRunningRef.current) {
      const newLang = getAnswerLang(value);
      await stopContinuousListening();
      await startContinuousListening(newLang);
    }
  }, [updateSettings, getAnswerLang]);

  // Reverse logic: swap question/answer
  const questionText = reverseEnabled
    ? (currentCard?.backText || '')
    : (currentCard?.frontText || '');
  const answerText = reverseEnabled
    ? (currentCard?.frontText || '')
    : (currentCard?.backText || '');

  // Рамка карточки по состоянию: слушаем — warning, верно — success, неверно — error
  const cardBorderColor = useMemo(() => {
    switch (sessionState) {
      case 'listening': return colors.warning;
      case 'correct': return colors.success;
      case 'incorrect': return colors.error;
      default: return colors.border;
    }
  }, [sessionState, colors]);

  const cardBorderWidth = sessionState === 'idle' ? 1 : 3;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: bottomInset }]}>
      <ScreenHeader
        title="Аудио"
        onBack={handleBack}
        bordered
        right={<Button variant="icon" icon={Settings} accessibilityLabel="Настройки" onPress={openSettings} />}
      />

      {/* Progress Section */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text variant="label" style={{ color: colors.primary }}>
            ({currentIndex + 1}/{totalCards})
          </Text>
          <Text variant="overline" color="secondary">
            Аудиотренировка
          </Text>
        </View>
        <ProgressBar progress={progress} accessibilityLabel="Прогресс" />
      </View>

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        {/* Card Stack */}
        <View style={styles.cardStackContainer}>
          {/* 3rd Card (Back) */}
          <View
            style={[
              styles.cardBase,
              styles.cardThird,
              { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 10) },
            ]}
          />

          {/* 2nd Card (Middle) */}
          <View
            style={[
              styles.cardBase,
              styles.cardSecond,
              { backgroundColor: alpha(colors.primary, 20), borderColor: alpha(colors.primary, 20) },
            ]}
          />

          {/* Front Card */}
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.cardBase,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorderColor,
                borderWidth: cardBorderWidth,
              },
            ]}
          >
            <View style={styles.cardContent}>
              {/* Main word (question) */}
              <Text variant="h1" style={[styles.cardWord, { color: colors.textPrimary }]}>
                {questionText}
              </Text>

              {/* Partial recognition text (during listening) */}
              {sessionState === 'listening' && partialText ? (
                <Text variant="h3" align="center" style={[styles.partialText, { color: colors.textSecondary }]}>
                  {partialText}
                </Text>
              ) : null}

              {/* Recognized text (after result) */}
              {sessionState === 'correct' && recognizedText ? (
                <Text variant="bodyLarge" align="center" style={[styles.semibold, { color: colors.successText }]}>
                  {recognizedText}
                </Text>
              ) : null}

              {sessionState === 'incorrect' ? (
                <View style={styles.incorrectInfo}>
                  {recognizedText ? (
                    <Text variant="bodyLarge" align="center" style={[styles.semibold, { color: colors.errorText }]}>
                      {recognizedText}
                    </Text>
                  ) : null}
                  <Text variant="body" align="center" style={{ color: colors.textSecondary }}>
                    {answerText}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.modeDescription}>
          <Text variant="bodySmall" color="secondary" align="center">
            Произнеси перевод слова
          </Text>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {!isRunning ? (
          /* Кнопка "Начать" — запускает сессию */
          <Button title="Начать" icon={Mic} onPress={handleStart} fullWidth />
        ) : (
          /* Сессия активна: показываем состояние + кнопки */
          <View style={styles.runningArea}>
            {sessionState === 'listening' ? (
              <>
                <Animated.View
                  accessible
                  accessibilityLabel="Слушаю"
                  style={[styles.listeningRow, { opacity: pulseAnim }]}
                >
                  <AudioLines size={iconSize.l} color={colors.warning} />
                </Animated.View>

                <Button variant="secondary" title="Не знаю" onPress={handleSkip} fullWidth />
              </>
            ) : sessionState === 'correct' ? (
              <View
                accessible
                accessibilityLabel="Верно"
                style={[styles.resultIndicator, { backgroundColor: alpha(colors.success, 10) }]}
              >
                <Check size={iconSize.l} color={colors.successText} />
              </View>
            ) : sessionState === 'incorrect' ? (
              <View
                accessible
                accessibilityLabel="Неверно"
                style={[styles.resultIndicator, { backgroundColor: alpha(colors.error, 10) }]}
              >
                <X size={iconSize.l} color={colors.errorText} />
              </View>
            ) : null}

            <Button variant="quiet" tone="secondary" title="Стоп" onPress={handleStop} />
          </View>
        )}
      </View>

      {/* Settings Modal */}
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

          {/* Панель настроек выезжает сверху (формат прежний), без тени */}
          <Animated.View
            style={[
              styles.settingsSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingTop: insets.top + spacing.m,
                transform: [{ translateY: sheetTranslate }],
              },
            ]}
          >
            <View style={styles.settingsRow}>
              <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>Реверс</Text>
              <Switch value={reverseEnabled} onValueChange={handleToggleReverse} accessibilityLabel="Реверс" />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  semibold: {
    fontWeight: '600',
  },

  // Progress
  progressSection: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    gap: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  // Content
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
  },

  // Card Stack
  cardStackContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: 'relative',
  },
  cardBase: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  cardThird: {
    transform: [{ translateY: spacing.xl }, { scale: 0.9 }],
  },
  cardSecond: {
    transform: [{ translateY: spacing.m }, { scale: 0.95 }],
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    gap: spacing.s,
  },
  cardWord: {
    // Запас под умлауты/диакритику над заглавными (см. StudyScreen cardWord)
    lineHeight: 46,
    paddingTop: spacing.xxs,
    textAlign: 'center',
  },
  partialText: {
    fontWeight: '400',
    fontStyle: 'italic',
  },
  incorrectInfo: {
    alignItems: 'center',
    gap: spacing.xxs,
  },

  // Mode Description
  modeDescription: {
    maxWidth: 240,
    marginTop: spacing.xxl + spacing.m,
  },

  // Bottom
  bottomActions: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.l,
  },
  listeningRow: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultIndicator: {
    height: 48,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
  runningArea: {
    gap: spacing.s,
  },

  // Settings modal
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTint: {
    flex: 1,
  },
  settingsSheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.m,
    borderBottomWidth: 1,
    borderBottomLeftRadius: borderRadius.l,
    borderBottomRightRadius: borderRadius.l,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: heights.touch,
  },
});
