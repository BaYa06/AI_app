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
  SafeAreaView,
  Platform,
  Vibration,
  Animated,
  Modal,
  Switch,
} from 'react-native';
import { ArrowLeft, Settings, Mic, Check, X, AudioLines } from 'lucide-react-native';
import { useThemeColors, useSettingsStore, useCardsStore, useSetsStore } from '@/store';
import { Text, Heading2 } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { DatabaseService } from '@/services';
import { playCorrectSound, preloadSound } from '@/utils/sound';
import {
  requestMicrophonePermission,
  normalizeLangForSTT,
  isAnswerCorrect,
  startContinuousListening,
  stopContinuousListening,
  setContinuousHandlers,
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
  const theme = useSettingsStore((s) => s.resolvedTheme);

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
  const overlayColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.55)';
  const settingsSheetBg = theme === 'dark' ? '#0f172a' : colors.surface;
  const settingsSheetBorder = theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : colors.border;

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
    if (dueCardIds && dueCardIds.length > 0) {
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
      modeTitle: 'Audio Session',
      cardLimit,
      dueCardIds,
      phaseId: currentPhaseId.current,
      totalPhaseCards: currentTotalPhaseCards.current,
      studiedInPhase: studiedInPhase + learnedCards,
      phaseOffset: phaseOffset + cards.length,
      phaseFailedIds: errors,
    });
  }, [cards, navigation, setId, cardLimit, dueCardIds, studiedInPhase, phaseOffset]);

  // Process one card then auto-continue (mic stays on between cards)
  const processCard = useCallback(async (idx: number) => {
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
      );
    });

    // Stopped while listening?
    if (!isRunningRef.current) {
      setSessionState('idle');
      return;
    }

    // Show result
    setRecognizedText(result.alternatives[0] || '');

    if (result.isCorrect) {
      setSessionState('correct');
      playCorrectSound();
      Vibration.vibrate(20);
    } else {
      setSessionState('incorrect');
      errorCardIdsRef.current = [...errorCardIdsRef.current, card.id];
      setErrorCardIds([...errorCardIdsRef.current]);
      Vibration.vibrate([0, 50, 50, 50]);
    }

    // Show result: 1s for correct, 2s for incorrect (to read the answer)
    await new Promise(r => setTimeout(r, result.isCorrect ? 1000 : 2000));

    if (!isRunningRef.current) {
      setSessionState('idle');
      return;
    }

    // Advance
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
      console.warn('[AudioLearning] Microphone permission denied');
      return;
    }

    const lang = getAnswerLang(reverseRef.current);

    isRunningRef.current = true;
    setIsRunning(true);
    sessionStartTime.current = Date.now();

    // Start mic once — it stays on for the entire session
    await startContinuousListening(lang);
    processCard(currentIndexRef.current);
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

  // Border color based on state
  const cardBorderColor = useMemo(() => {
    switch (sessionState) {
      case 'listening': return '#F59E0B';
      case 'correct': return '#10B981';
      case 'incorrect': return '#EF4444';
      default: return theme === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(241, 245, 249, 1)';
    }
  }, [sessionState, theme]);

  const cardBorderWidth = sessionState === 'idle' ? 1 : 3;

  const Wrapper = Platform.OS === 'web' ? View : SafeAreaView;

  return (
    <Wrapper style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={handleBack} style={styles.headerButton} hitSlop={8}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </Pressable>

        <Heading2 style={styles.headerTitle}>Audio Tap</Heading2>

        <Pressable onPress={openSettings} style={styles.headerButton} hitSlop={8}>
          <Settings size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Progress Section */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text variant="body" style={[styles.progressCounter, { color: colors.primary }]}>
            ({currentIndex + 1}/{totalCards})
          </Text>
          <Text variant="caption" color="tertiary" style={styles.sessionLabel}>
            AUDIO SESSION
          </Text>
        </View>

        <View style={[styles.progressBar, { backgroundColor: theme === 'dark' ? '#1e293b' : '#f1f5f9' }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress}%` }]} />
        </View>
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
              {
                backgroundColor: theme === 'dark' ? 'rgba(100, 103, 242, 0.1)' : 'rgba(100, 103, 242, 0.2)',
                borderColor: 'rgba(100, 103, 242, 0.1)',
              },
            ]}
          />

          {/* 2nd Card (Middle) */}
          <View
            style={[
              styles.cardBase,
              styles.cardSecond,
              {
                backgroundColor: theme === 'dark' ? 'rgba(100, 103, 242, 0.2)' : 'rgba(100, 103, 242, 0.3)',
                borderColor: 'rgba(100, 103, 242, 0.2)',
              },
            ]}
          />

          {/* Front Card */}
          <View
            style={[
              styles.cardBase,
              styles.cardFront,
              {
                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                borderColor: cardBorderColor,
                borderWidth: cardBorderWidth,
              },
            ]}
          >
            <View style={styles.cardContent}>
              {/* Main word (question) */}
              <Text style={[styles.cardWord, { color: theme === 'dark' ? '#ffffff' : '#0f172a' }]}>
                {questionText}
              </Text>

              {/* Partial recognition text (during listening) */}
              {sessionState === 'listening' && partialText ? (
                <Text style={[styles.partialText, { color: colors.textSecondary }]}>
                  {partialText}
                </Text>
              ) : null}

              {/* Recognized text (after result) */}
              {sessionState === 'correct' && recognizedText ? (
                <Text style={[styles.recognizedText, { color: '#10B981' }]}>
                  {recognizedText}
                </Text>
              ) : null}

              {sessionState === 'incorrect' ? (
                <View style={styles.incorrectInfo}>
                  {recognizedText ? (
                    <Text style={[styles.recognizedText, { color: '#EF4444' }]}>
                      {recognizedText}
                    </Text>
                  ) : null}
                  <Text style={[styles.expectedText, { color: colors.textSecondary }]}>
                    {answerText}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.modeDescription}>
          <Text variant="body" color="secondary" align="center" style={styles.descriptionText}>
            Произнеси перевод слова
          </Text>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {!isRunning ? (
          /* Кнопка "Начать" — запускает сессию */
          <Pressable
            onPress={handleStart}
            style={[styles.startButton, { backgroundColor: colors.primary }]}
          >
            <Mic size={22} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={[styles.startButtonText, { color: '#ffffff' }]}>
              Начать
            </Text>
          </Pressable>
        ) : (
          /* Сессия активна: показываем состояние + кнопки */
          <View style={styles.runningArea}>
            {sessionState === 'listening' ? (
              <>
                <Animated.View style={[styles.listeningRow, { opacity: pulseAnim }]}>
                  <AudioLines size={28} color="#F59E0B" />
                </Animated.View>

                <Pressable
                  onPress={handleSkip}
                  style={[styles.skipButton, { backgroundColor: theme === 'dark' ? '#1e293b' : '#f1f5f9' }]}
                >
                  <Text style={[styles.skipButtonText, { color: colors.textPrimary }]}>
                    Не знаю
                  </Text>
                </Pressable>
              </>
            ) : sessionState === 'correct' ? (
              <View style={[styles.resultIndicator, { backgroundColor: '#10B9811A' }]}>
                <Check size={28} color="#10B981" />
              </View>
            ) : sessionState === 'incorrect' ? (
              <View style={[styles.resultIndicator, { backgroundColor: '#EF44441A' }]}>
                <X size={28} color="#EF4444" />
              </View>
            ) : null}

            <Pressable
              onPress={handleStop}
              style={[styles.stopButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.stopButtonText, { color: colors.textSecondary }]}>
                Стоп
              </Text>
            </Pressable>
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
                backgroundColor: settingsSheetBg,
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

      <View style={[styles.safeAreaSpacer, { backgroundColor: colors.background }]} />
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  headerButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
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
  progressCounter: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 14,
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
  },
  progressBar: {
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
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
    borderRadius: borderRadius.xl * 1.5,
    borderWidth: 1,
  },
  cardThird: {
    transform: [{ translateY: 32 }, { scale: 0.9 }],
  },
  cardSecond: {
    transform: [{ translateY: 16 }, { scale: 0.95 }],
  },
  cardFront: {
    shadowColor: 'rgba(100, 103, 242, 0.1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 5,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    gap: 12,
  },
  cardWord: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    textAlign: 'center',
  },
  partialText: {
    fontSize: 20,
    fontStyle: 'italic',
    textAlign: 'center',
    opacity: 0.7,
  },
  recognizedText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  incorrectInfo: {
    alignItems: 'center',
    gap: 4,
  },
  expectedText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Mode Description
  modeDescription: {
    maxWidth: 240,
    marginTop: 64,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },

  // Bottom
  bottomActions: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.xl,
  },
  startButton: {
    height: 64,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(100, 103, 242, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  listeningRow: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButton: {
    height: 56,
    borderRadius: borderRadius.l,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  resultIndicator: {
    height: 48,
    borderRadius: borderRadius.l,
    justifyContent: 'center',
    alignItems: 'center',
  },
  runningArea: {
    gap: 12,
  },
  stopButton: {
    height: 40,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonText: {
    fontSize: 14,
    fontWeight: '500',
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

  safeAreaSpacer: {
    height: 8,
  },
});
