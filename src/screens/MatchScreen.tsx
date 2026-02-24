/**
 * Match Screen
 * @description Экран игры Match с базовой логикой сопоставления
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Vibration, Animated, Modal, Switch } from 'react-native';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { Container, Text, ProgressBar, Loading } from '@/components/common';
import { useCardsStore, useSetsStore, useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { DatabaseService } from '@/services';
import { playCorrectSound2 as playCorrectSound, preloadSound } from '@/utils/sound';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';

type Props = RootStackScreenProps<'Match'>;

export function MatchScreen({ navigation, route }: Props) {
  const { setId, cardLimit, dueCardIds, phaseId, totalPhaseCards, studiedInPhase = 0, phaseOffset = 0 } = route.params;
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);

  // Генерируем phaseId при первом запуске (если не передан)
  const currentPhaseId = useRef(phaseId || `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const currentTotalPhaseCards = useRef(totalPhaseCards || 0);

  const set = useSetsStore((s) => s.getSet(setId));
  const { ids, map } = useCardsStore(
    useCallback((s) => ({ ids: s.cardsBySet[setId] || [], map: s.cards }), [setId])
  );

  const cards = useMemo(() => {
    // Cross-set mode: use dueCardIds directly
    if (dueCardIds && dueCardIds.length > 0) {
      return dueCardIds.map((id) => map[id]).filter(Boolean) as Card[];
    }
    const now = Date.now();
    return ids.map((id) => map[id]).filter((c): c is Card => Boolean(c) && c.nextReviewDate <= now);
  }, [ids, map, dueCardIds]);

  const [leftCards, setLeftCards] = useState<Card[]>([]);
  const [rightCards, setRightCards] = useState<Card[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [totalPairs, setTotalPairs] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const reverseEnabled = useSettingsStore((s) => s.settings.reverseCards);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mismatchRef = useRef<NodeJS.Timeout | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const fadeValues = useRef<Record<string, Animated.Value>>({});
  const sheetTranslate = useRef(new Animated.Value(-220)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
  const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';
  const getFadeValue = useCallback((cardId: string) => {
    if (!fadeValues.current[cardId]) {
      fadeValues.current[cardId] = new Animated.Value(1);
    }
    return fadeValues.current[cardId];
  }, []);

  // Инициализация партии: ограничение по количеству и перемешивание правой колонки
  useEffect(() => {
    // Пропускаем уже изученные карточки (используем phaseOffset)
    const availableCards = cards.slice(phaseOffset);
    const limited = !cardLimit || cardLimit <= 0 ? availableCards : availableCards.slice(0, cardLimit);
    const shuffled = [...limited].sort(() => Math.random() - 0.5);
    fadeValues.current = {};

    setLeftCards(limited);
    setRightCards(shuffled);
    setTotalPairs(limited.length);
    setMatchedIds(new Set());
    setSelectedLeft(null);
    setSelectedRight(null);
    setMistakes(0);
    setElapsed(0);
    setIsComplete(false);
    startedAtRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cards, cardLimit, phaseOffset]);

  const matchedPairs = matchedIds.size;
  const progress = totalPairs ? Math.round((matchedPairs / totalPairs) * 100) : 0;

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedLeft(null);
    setSelectedRight(null);
  }, []);


  const triggerSuccessHaptic = useCallback(() => {
    // Lightweight vibration works on native and web (uses navigator.vibrate under the hood)
    Vibration.vibrate(20);
  }, []);

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

  const handleSelectLeft = useCallback(
    (cardId: string) => {
      if (isComplete || matchedIds.has(cardId)) return;
      setSelectedLeft((prev) => (prev === cardId ? null : cardId));
    },
    [isComplete, matchedIds]
  );

  const handleSelectRight = useCallback(
    (cardId: string) => {
      if (isComplete || matchedIds.has(cardId)) return;
      setSelectedRight((prev) => (prev === cardId ? null : cardId));
    },
    [isComplete, matchedIds]
  );

  // Проверка совпадений
  useEffect(() => {
    if (!selectedLeft || !selectedRight) return;

    if (selectedLeft === selectedRight) {
      const leftFade = getFadeValue(selectedLeft);
      const rightFade = getFadeValue(selectedRight);
      Animated.parallel([
        Animated.timing(leftFade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(rightFade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => {
        setLeftCards((prev) => prev.filter((card) => card.id !== selectedLeft));
        setRightCards((prev) => prev.filter((card) => card.id !== selectedRight));
        resetSelection();
      });

      triggerSuccessHaptic();
      playCorrectSound();
      setMatchedIds((prev) => {
        const next = new Set(prev);
        next.add(selectedLeft);
        return next;
      });
    } else {
      setMistakes((m) => m + 1);
      if (mismatchRef.current) clearTimeout(mismatchRef.current);
      mismatchRef.current = setTimeout(() => resetSelection(), 450);
    }
  }, [selectedLeft, selectedRight, resetSelection, triggerSuccessHaptic, getFadeValue]);

  // Завершение игры
  const finishGame = useCallback(() => {
    if (isComplete || totalPairs === 0) return;

    setIsComplete(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const timeSpent = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    
    // Обновляем прогресс фазы
    const newStudiedInPhase = studiedInPhase + totalPairs;
    const newPhaseOffset = phaseOffset + totalPairs;
    const phaseTotal = currentTotalPhaseCards.current || totalPairs;

    navigation.replace('StudyResults', {
      setId,
      totalCards: totalPairs,
      learnedCards: totalPairs,
      timeSpent,
      errors: mistakes,
      errorCards: [],
      modeTitle: 'Match',
      cardLimit,
      dueCardIds,
      nextMode: 'match',
      // Параметры фазы
      phaseId: currentPhaseId.current,
      totalPhaseCards: phaseTotal,
      studiedInPhase: newStudiedInPhase,
      phaseOffset: newPhaseOffset,
    });
  }, [isComplete, navigation, setId, totalPairs, mistakes, studiedInPhase, cardLimit, dueCardIds, phaseOffset]);

  useEffect(() => {
    if (!isComplete && totalPairs > 0 && matchedPairs === totalPairs) {
      finishGame();
    }
  }, [finishGame, isComplete, matchedPairs, totalPairs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mismatchRef.current) clearTimeout(mismatchRef.current);
    };
  }, []);

  // Предзагрузка звука correct2.wav для мгновенного отклика
  useEffect(() => {
    preloadSound('/correct2.wav');
  }, []);

  if (!set) {
    return <Loading fullScreen message="Загрузка..." />;
  }

  const emptyState = totalPairs === 0;

  return (
    <Container padded={false}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.iconButton}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="h3" style={{ color: colors.textPrimary }}>
          Match
        </Text>
        <Pressable hitSlop={8} style={styles.iconButton} onPress={openSettings}>
          <Settings size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.statusBlock}>
        <View style={styles.statusRow}>
          <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            Пары: {matchedPairs}/{totalPairs || 0}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: colors.textSecondary, fontVariant: ['tabular-nums'] }}
          >
            {formatTime(elapsed)}
          </Text>
        </View>
        <ProgressBar progress={progress} height={8} />
        {/* <Text
          variant="caption"
          color="secondary"
          style={{ textAlign: 'center', marginTop: spacing.xs }}
        >
          Соедини слово с переводом
        </Text> */}
      </View>

      {emptyState ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🃏</Text>
          <Text variant="body" color="secondary" align="center">
            В этом наборе пока нет карточек
          </Text>
        </View>
      ) : (
        <View style={[styles.contentWrapper, { paddingHorizontal: spacing.m }]}>
          <View style={styles.grid}>
            <ScrollView
              style={styles.column}
              contentContainerStyle={styles.columnContent}
              showsVerticalScrollIndicator={false}
            >
              {leftCards.map((card) => {
                const isMatched = matchedIds.has(card.id);
                const isSelected = selectedLeft === card.id;
                const fade = getFadeValue(card.id);

                return (
                  <Animated.View key={card.id} style={{ opacity: fade }}>
                    <Pressable
                      disabled={isMatched || isComplete}
                      onPress={() => handleSelectLeft(card.id)}
                      style={({ pressed }) => [
                        styles.card,
                        {
                          backgroundColor: isMatched
                            ? `${colors.success}1A`
                            : isSelected
                              ? `${colors.primary}1A`
                              : colors.surface,
                          borderColor: isMatched
                            ? colors.success
                            : isSelected
                              ? colors.primary
                              : colors.border,
                          transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
                        },
                      ]}
                    >
                      <Text
                        variant="body"
                        style={[
                          styles.cardText,
                          {
                            color: isMatched
                              ? colors.success
                              : isSelected
                                ? colors.primary
                                : colors.textPrimary,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {getFront(card)}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </ScrollView>

            <ScrollView
              style={styles.column}
              contentContainerStyle={styles.columnContent}
              showsVerticalScrollIndicator={false}
            >
              {rightCards.map((card) => {
                const isMatched = matchedIds.has(card.id);
                const isSelected = selectedRight === card.id;
                const fade = getFadeValue(card.id);

                return (
                  <Animated.View key={`${card.id}-back`} style={{ opacity: fade }}>
                    <Pressable
                      disabled={isMatched || isComplete}
                      onPress={() => handleSelectRight(card.id)}
                      style={({ pressed }) => [
                        styles.card,
                        {
                          backgroundColor: isMatched
                            ? `${colors.success}1A`
                            : isSelected
                              ? `${colors.primary}1A`
                              : colors.surface,
                          borderColor: isMatched
                            ? colors.success
                            : isSelected
                              ? colors.primary
                              : colors.border,
                          transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
                        },
                      ]}
                    >
                      <Text
                        variant="body"
                        style={[
                          styles.cardText,
                          {
                            color: isMatched
                              ? colors.success
                              : isSelected
                                ? colors.primary
                                : colors.textPrimary,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {getBack(card)}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      <Modal
        visible={isSettingsOpen}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={closeSettings}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={closeSettings}>
            <Animated.View
              pointerEvents="none"
              style={[styles.backdropTint, { opacity: backdropOpacity }]}
            />
          </Pressable>

          <Animated.View
            style={[
              styles.settingsSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
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

      <View
        style={[
          styles.bottomFade,
          {
            backgroundColor:
              theme === 'dark' ? 'rgba(17, 24, 39, 0.65)' : 'rgba(255, 255, 255, 1)',
          },
        ]}
        pointerEvents="none"
      />
    </Container>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBlock: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    gap: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentWrapper: {
    flex: 1,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.m,
  },
  column: {
    flex: 1,
  },
  columnContent: {
    gap: spacing.m,
    paddingBottom: spacing.xl * 1.5,
  },
  card: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.l,
    justifyContent: 'center',
  },
  cardText: {
    fontWeight: '700',
    lineHeight: 22,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
  emptyIcon: {
    fontSize: 32,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
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
    borderBottomLeftRadius: borderRadius.l,
    borderBottomRightRadius: borderRadius.l,
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
});
