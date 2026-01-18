/**
 * Match Screen
 * @description Экран игры Match с базовой логикой сопоставления
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { Container, Text, ProgressBar, Loading } from '@/components/common';
import { useCardsStore, useSetsStore, useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';

type Props = RootStackScreenProps<'Match'>;

export function MatchScreen({ navigation, route }: Props) {
  const { setId, cardLimit } = route.params;
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);

  const set = useSetsStore((s) => s.getSet(setId));
  const { ids, map } = useCardsStore(
    useCallback((s) => ({ ids: s.cardsBySet[setId] || [], map: s.cards }), [setId])
  );

  const cards = useMemo(
    () => ids.map((id) => map[id]).filter(Boolean) as Card[],
    [ids, map]
  );

  const [leftCards, setLeftCards] = useState<Card[]>([]);
  const [rightCards, setRightCards] = useState<Card[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [totalPairs, setTotalPairs] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mismatchRef = useRef<NodeJS.Timeout | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
  const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';

  // Инициализация партии: ограничение по количеству и перемешивание правой колонки
  useEffect(() => {
    const limited = !cardLimit || cardLimit <= 0 ? cards : cards.slice(0, cardLimit);
    const shuffled = [...limited].sort(() => Math.random() - 0.5);

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
  }, [cards, cardLimit]);

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
      setMatchedIds((prev) => {
        const next = new Set(prev);
        next.add(selectedLeft);
        return next;
      });
      setLeftCards((prev) => prev.filter((card) => card.id !== selectedLeft));
      setRightCards((prev) => prev.filter((card) => card.id !== selectedRight));
      resetSelection();
    } else {
      setMistakes((m) => m + 1);
      if (mismatchRef.current) clearTimeout(mismatchRef.current);
      mismatchRef.current = setTimeout(() => resetSelection(), 450);
    }
  }, [selectedLeft, selectedRight, resetSelection]);

  // Завершение игры
  const finishGame = useCallback(() => {
    if (isComplete || totalPairs === 0) return;

    setIsComplete(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const timeSpent = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));

    navigation.replace('StudyResults', {
      setId,
      totalCards: totalPairs,
      learnedCards: totalPairs,
      timeSpent,
      errors: mistakes,
      errorCards: [],
      modeTitle: 'Match',
    });
  }, [isComplete, navigation, setId, totalPairs, mistakes]);

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
        <Pressable hitSlop={8} style={styles.iconButton}>
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
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: spacing.xl * 1.5, paddingHorizontal: spacing.m },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            <View style={styles.column}>
              {leftCards.map((card) => {
                const isMatched = matchedIds.has(card.id);
                const isSelected = selectedLeft === card.id;

                return (
                  <Pressable
                    key={card.id}
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
                        transform: pressed ? [{ scale: 0.98 }] : undefined,
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
                );
              })}
            </View>

            <View style={styles.column}>
              {rightCards.map((card) => {
                const isMatched = matchedIds.has(card.id);
                const isSelected = selectedRight === card.id;

                return (
                  <Pressable
                    key={`${card.id}-back`}
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
                        transform: pressed ? [{ scale: 0.98 }] : undefined,
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
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

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
  content: {
    gap: spacing.m,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  column: {
    flex: 1,
    gap: spacing.m,
  },
  card: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.l,
    // minHeight: 120,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 3,
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
});
