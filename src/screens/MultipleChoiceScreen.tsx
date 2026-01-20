/**
 * Multiple Choice Screen
 * @description Экран выбора перевода
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { ArrowLeft, Settings, Volume2 } from 'lucide-react-native';
import { Container, Text, ProgressBar, Loading } from '@/components/common';
import { useCardsStore, useSetsStore, useThemeColors } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';

type Props = RootStackScreenProps<'MultipleChoice'>;

type OptionState = 'neutral' | 'correct' | 'wrong';
type Option = { id: string; label: string; text: string; isCorrect: boolean };

export function MultipleChoiceScreen({ navigation, route }: Props) {
  const { setId, cardLimit } = route.params;
  const colors = useThemeColors();
  const set = useSetsStore((s) => s.getSet(setId));
  const { ids, map } = useCardsStore(
    React.useCallback((s) => ({ ids: s.cardsBySet[setId] || [], map: s.cards }), [setId])
  );
  const cards = useMemo(
    () => ids.map((id) => map[id]).filter(Boolean) as Card[],
    [ids, map]
  );

  const [questions, setQuestions] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [errors, setErrors] = useState(0);
  const [errorCards, setErrorCards] = useState<Array<{ front: string; back: string; rating: number }>>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
  const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';

  const shuffle = <T,>(arr: T[]): T[] => {
    return arr
      .map((item) => ({ item, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ item }) => item);
  };

  useEffect(() => {
    const limited = !cardLimit || cardLimit <= 0 ? cards : cards.slice(0, cardLimit);
    const shuffled = shuffle(limited);
    setQuestions(shuffled);
    setCurrentIndex(0);
    setSelectedOption(null);
    setShowResult(false);
    setErrors(0);
    setErrorCards([]);
    startedAtRef.current = Date.now();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [cards, cardLimit]);

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

  const finishQuiz = React.useCallback(
    (errorsCount: number, errorList: Array<{ front: string; back: string; rating: number }>) => {
      const timeSpent = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      navigation.replace('StudyResults', {
        setId,
        totalCards: totalQuestions,
        learnedCards: Math.max(0, totalQuestions - errorsCount),
        timeSpent,
        errors: errorsCount,
        errorCards: errorList,
        modeTitle: 'Multiple Choice',
        cardLimit,
        nextMode: 'multipleChoice',
      });
    },
    [navigation, setId, totalQuestions, cardLimit]
  );

  const handleSelectOption = (option: Option) => {
    if (!currentCard || selectedOption) return;

    const isCorrect = option.isCorrect;
    const nextErrors = errors + (isCorrect ? 0 : 1);
    const updatedErrorCards = isCorrect
      ? errorCards
      : [
          ...errorCards,
          {
            front: getFront(currentCard),
            back: getBack(currentCard),
            rating: 1,
          },
        ];

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
    backgroundColor: 'transparent',
  },
  word: {
    textAlign: 'center',
    fontSize: 38,
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
