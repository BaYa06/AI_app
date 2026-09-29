/**
 * Context Fill Screen
 * @description Режим "Слово в контексте" — выбери слово по предложению с пропуском
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dumbbell, PartyPopper, ThumbsUp } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, ProgressBar, ScreenHeader, toast } from '@/components/ui';
import { useThemeColors, useCardsStore, useContextFillStore } from '@/store';
import { spacing, borderRadius, iconSize, screenPadding, alpha } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { apiService } from '@/services/ApiService';
import { getDistractors } from '@/utils/distractors';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';

type Props = RootStackScreenProps<'ContextFill'>;

type OptionState = 'neutral' | 'correct' | 'wrong';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const MIN_CARDS = 4;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Заменить слово в предложении на _____ */
function blankWord(example: string, word: string, wordForm?: string): string {
  const lower = example.toLowerCase();

  // Сначала пробуем точную форму из wordForm (если AI вернул её)
  const searchTerm = wordForm || word;
  const termLower = searchTerm.toLowerCase();
  const idx = lower.indexOf(termLower);
  if (idx !== -1) {
    return example.slice(0, idx) + '_____' + example.slice(idx + searchTerm.length);
  }

  // Fallback: пробуем базовое слово (на случай если wordForm не совпал)
  if (wordForm) {
    const wordLower = word.toLowerCase();
    const idx2 = lower.indexOf(wordLower);
    if (idx2 !== -1) {
      return example.slice(0, idx2) + '_____' + example.slice(idx2 + word.length);
    }
  }

  return example.replace(/[.!?]$/, '') + ' _____.';
}

export function ContextFillScreen({ navigation, route }: Props) {
  const { setId, cardLimit } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const getCardsBySet = useCardsStore((s) => s.getCardsBySet);
  const updateCard = useCardsStore((s) => s.updateCard);
  const allCards = useCardsStore((s) => Object.values(s.cards));
  const recordSession = useContextFillStore((s) => s.recordSession);

  // Фаза подготовки: генерация примеров для карточек без них
  const [prepLoading, setPrepLoading] = useState(true);
  const [prepStatus, setPrepStatus] = useState('Загружаю карточки...');

  // Игровое состояние
  const [questions, setQuestions] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [optionState, setOptionState] = useState<OptionState>('neutral');
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const correctIdsRef = useRef<string[]>([]);

  // ── Подготовка ──────────────────────────────────────────────────────────

  const prep = useCallback(async () => {
    const setCards = getCardsBySet(setId);

    if (setCards.length < MIN_CARDS) {
      toast.info(`Мало карточек: для этого режима нужно минимум ${MIN_CARDS} карточки в наборе`);
      navigation.goBack();
      return;
    }

    const limit = cardLimit ?? setCards.length;
    let selected = shuffle([...setCards]).slice(0, limit);

    // Карточки без примеров — генерируем на лету
    const noExample = selected.filter((c) => !c.example);
    if (noExample.length > 0) {
      setPrepStatus('AI готовит задания...');
      try {
        const results = await apiService.generateExamples(
          noExample.map((c) => ({ front: c.frontText, back: c.backText })),
        );

        for (let i = 0; i < noExample.length; i++) {
          const gen = results[i];
          if (gen?.example) {
            // Обновить стор и БД
            updateCard(noExample[i].id, {
              example: gen.example,
              wordForm: gen.wordForm,
              wordType: gen.wordType as Card['wordType'],
            });
            NeonService.updateCard(noExample[i].id, {
              example: gen.example,
              wordForm: gen.wordForm,
              wordType: gen.wordType as Card['wordType'],
            });
          }
        }

        // Применить сгенерированные данные к selected
        const genMap = new Map(results.map((r) => [r.front, r]));
        selected = selected.map((c) => {
          if (c.example) return c;
          const gen = genMap.get(c.frontText);
          return gen?.example
            ? { ...c, example: gen.example, wordForm: gen.wordForm || c.wordForm, wordType: (gen.wordType as Card['wordType']) || c.wordType }
            : c;
        });
      } catch {
        // Продолжаем с теми что есть
      }
    }

    // Оставляем только карточки с примерами
    const ready = selected.filter((c) => c.example);

    if (ready.length === 0) {
      toast.error('Не удалось загрузить примеры для карточек. Попробуй позже');
      navigation.goBack();
      return;
    }

    setQuestions(ready);
    setPrepLoading(false);
  }, [setId, cardLimit, getCardsBySet, updateCard, navigation]);

  useEffect(() => {
    prep();
  }, []);

  // ── Подбор вариантов ─────────────────────────────────────────────────────

  const buildOptions = useCallback(
    async (card: Card) => {
      setOptionsLoading(true);
      setOptions([]);
      try {
        const distractors = await getDistractors(card, allCards, 3);
        const opts = shuffle([card.frontText, ...distractors]);
        setOptions(opts);
      } finally {
        setOptionsLoading(false);
      }
    },
    [allCards],
  );

  useEffect(() => {
    if (!prepLoading && questions.length > 0 && currentIndex < questions.length) {
      buildOptions(questions[currentIndex]);
    }
  }, [prepLoading, currentIndex, questions]);

  // ── Обработка ответа ─────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (option: string) => {
      if (selectedOption !== null || optionsLoading) return;

      const currentCard = questions[currentIndex];
      const isCorrect = option === currentCard.frontText;

      setSelectedOption(option);
      setOptionState(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) {
        setCorrectCount((n) => n + 1);
        correctIdsRef.current = [...correctIdsRef.current, currentCard.id];
      }

      advanceTimerRef.current = setTimeout(() => {
        const next = currentIndex + 1;
        if (next >= questions.length) {
          recordSession(
            correctIdsRef.current.length,
            questions.length,
            correctIdsRef.current,
          );
          setFinished(true);
        } else {
          setCurrentIndex(next);
          setSelectedOption(null);
          setOptionState('neutral');
        }
      }, 1500);
    },
    [selectedOption, optionsLoading, questions, currentIndex],
  );

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // ── Вспомогательные значения ─────────────────────────────────────────────

  const currentCard = questions[currentIndex];
  const progress = questions.length > 0 ? currentIndex / questions.length : 0;

  // ── Экран: подготовка ────────────────────────────────────────────────────

  if (prepLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Слово в контексте" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="body" align="center" style={[styles.prepText, { color: colors.textSecondary }]}>
            {prepStatus}
          </Text>
        </View>
      </View>
    );
  }

  // ── Экран: результат ─────────────────────────────────────────────────────

  if (finished) {
    const accuracy = questions.length > 0
      ? Math.round((correctCount / questions.length) * 100)
      : 0;
    // Вместо эмодзи 🎉 👍 💪 — иконки lucide (брендбук, раздел 6)
    const ResultIcon = accuracy >= 80 ? PartyPopper : accuracy >= 50 ? ThumbsUp : Dumbbell;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Слово в контексте" onBack={() => navigation.goBack()} />

        <View style={styles.centered}>
          <View
            accessible
            accessibilityLabel={`Правильно ${correctCount} из ${questions.length}, точность ${accuracy}%`}
            style={[styles.resultCard, { backgroundColor: colors.primaryFill }]}
          >
            <ResultIcon size={iconSize.xl} color={colors.onPrimary} />
            <Text variant="display" style={{ color: colors.onPrimary }}>{correctCount}/{questions.length}</Text>
            <Text variant="body" style={[styles.semibold, styles.onFillMuted, { color: colors.onPrimary }]}>
              {accuracy}% точность
            </Text>
          </View>

          <Button title="Готово" onPress={() => navigation.goBack()} fullWidth style={styles.doneBtn} />
        </View>
      </View>
    );
  }

  // ── Экран: игра ──────────────────────────────────────────────────────────

  const sentenceWithBlank = currentCard
    ? blankWord(currentCard.example || '', currentCard.frontText, currentCard.wordForm)
    : '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Слово в контексте"
        onBack={() => navigation.goBack()}
        right={
          <Text variant="label" style={{ color: colors.textSecondary }}>
            {currentIndex + 1} / {questions.length}
          </Text>
        }
      />

      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <ProgressBar progress={Math.round(progress * 100)} accessibilityLabel="Прогресс" />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Question card */}
        <View style={[styles.questionCard, { backgroundColor: colors.primaryFill }]}>
          <Text variant="overline" style={[styles.onFillMuted, { color: colors.onPrimary }]}>Заполни пропуск</Text>
          <Text variant="h2" style={{ color: colors.onPrimary }}>{sentenceWithBlank}</Text>
        </View>

        {/* Options */}
        {optionsLoading ? (
          <View style={styles.optionsLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={styles.optionsList}>
            {options.map((option, idx) => {
              const isSelected = selectedOption === option;
              const isCorrectAnswer = option === currentCard?.frontText;

              let borderColor = colors.border;
              let bgColor = colors.surface;
              let labelBg = colors.surfaceMuted;
              let labelTextColor = colors.textSecondary;
              let textColor = colors.textPrimary;

              if (selectedOption !== null) {
                if (isCorrectAnswer) {
                  borderColor = colors.success;
                  bgColor = alpha(colors.success, 10);
                  labelBg = colors.success;
                  labelTextColor = colors.onPrimary;
                  textColor = colors.successText;
                } else if (isSelected) {
                  borderColor = colors.error;
                  bgColor = alpha(colors.error, 10);
                  labelBg = colors.error;
                  labelTextColor = colors.onPrimary;
                  textColor = colors.errorText;
                } else {
                  bgColor = colors.surfaceMuted;
                }
              } else if (isSelected) {
                borderColor = colors.primary;
                bgColor = alpha(colors.primary, 10);
                labelBg = colors.primaryFill;
                labelTextColor = colors.onPrimary;
                textColor = colors.primary;
              }

              return (
                <Pressable
                  key={idx}
                  accessibilityRole="button"
                  accessibilityLabel={`${OPTION_LABELS[idx]}. ${option}${
                    selectedOption !== null && isCorrectAnswer ? ', верно' : selectedOption !== null && isSelected ? ', неверно' : ''
                  }`}
                  style={({ pressed }) => [
                    styles.optionBtn,
                    {
                      backgroundColor: bgColor,
                      borderColor,
                      borderWidth: isSelected || (selectedOption !== null && isCorrectAnswer) ? 2 : 1,
                    },
                    selectedOption !== null && !isSelected && !isCorrectAnswer && styles.optionDimmed,
                    pressed && selectedOption === null && styles.optionPressed,
                  ]}
                  onPress={() => handleSelect(option)}
                  disabled={selectedOption !== null}
                >
                  <View style={[styles.optionLabel, { backgroundColor: labelBg }]}>
                    <Text variant="label" style={[styles.bold, { color: labelTextColor }]}>
                      {OPTION_LABELS[idx]}
                    </Text>
                  </View>
                  <Text
                    variant="body"
                    style={[styles.optionText, { color: textColor }, isSelected && styles.semibold]}
                    numberOfLines={2}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  // Второстепенный текст на цветной заливке
  onFillMuted: { opacity: 0.85 },

  progressWrap: {
    paddingHorizontal: screenPadding,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    gap: spacing.m,
  },
  prepText: {
    marginTop: spacing.s,
  },

  scroll: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.l,
    gap: spacing.l,
  },

  questionCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    gap: spacing.m,
  },
  optionsLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  optionsList: {
    gap: spacing.s,
  },
  // Рамка без тени (брендбук, 7.3)
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: borderRadius.l,
  },
  optionDimmed: {
    opacity: 0.5,
  },
  optionPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  optionLabel: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionText: {
    flex: 1,
  },

  // Result
  resultCard: {
    width: '100%',
    borderRadius: borderRadius.l,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.s,
  },
  doneBtn: {
    marginTop: spacing.m,
  },
});
