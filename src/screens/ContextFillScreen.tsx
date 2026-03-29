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
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useCardsStore, useSettingsStore, useContextFillStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
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
function blankWord(example: string, word: string): string {
  const lower = example.toLowerCase();
  const wordLower = word.toLowerCase();
  const idx = lower.indexOf(wordLower);
  if (idx !== -1) {
    return example.slice(0, idx) + '_____' + example.slice(idx + word.length);
  }
  // Слово не найдено дословно (Gemini мог поставить другую форму) —
  // показываем пример с явным маркером пропуска в конце
  return example.replace(/[.!?]$/, '') + ' _____.';
}

export function ContextFillScreen({ navigation, route }: Props) {
  const { setId, cardLimit } = route.params;
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
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

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB';

  // ── Подготовка ──────────────────────────────────────────────────────────

  const prep = useCallback(async () => {
    const setCards = getCardsBySet(setId);

    if (setCards.length < MIN_CARDS) {
      Alert.alert(
        'Мало карточек',
        `Для этого режима нужно минимум ${MIN_CARDS} карточки в наборе.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
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
              wordType: gen.wordType as Card['wordType'],
            });
            NeonService.updateCard(noExample[i].id, {
              example: gen.example,
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
            ? { ...c, example: gen.example, wordType: (gen.wordType as Card['wordType']) || c.wordType }
            : c;
        });
      } catch {
        // Продолжаем с теми что есть
      }
    }

    // Оставляем только карточки с примерами
    const ready = selected.filter((c) => c.example);

    if (ready.length === 0) {
      Alert.alert(
        'Нет примеров',
        'Не удалось загрузить примеры для карточек. Попробуй позже.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
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
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Fill in the Blank
          </Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.prepText, { color: colors.textSecondary }]}>
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

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Fill in the Blank
          </Text>
        </View>

        <View style={styles.centered}>
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: colors.primary,
                ...Platform.select({
                  web: {
                    backgroundImage: 'linear-gradient(135deg, #6467f2, #6467f299)',
                    boxShadow: '0 8px 32px rgba(100,103,242,0.3)',
                  },
                }) as any,
              },
            ]}
          >
            <Text style={styles.resultEmoji}>{accuracy >= 80 ? '🎉' : accuracy >= 50 ? '👍' : '💪'}</Text>
            <Text style={styles.resultScore}>{correctCount}/{questions.length}</Text>
            <Text style={styles.resultAccuracy}>{accuracy}% точность</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.doneBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneBtnText}>Готово</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Экран: игра ──────────────────────────────────────────────────────────

  const sentenceWithBlank = currentCard
    ? blankWord(currentCard.example || '', currentCard.frontText)
    : '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.95)',
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Fill in the Blank
          </Text>
          <Text style={[styles.headerCounter, { color: colors.textSecondary }]}>
            {currentIndex + 1} / {questions.length}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
        <View
          style={[
            styles.progressBar,
            {
              backgroundColor: colors.primary,
              width: `${Math.round(progress * 100)}%` as any,
            },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Question card */}
        <View
          style={[
            styles.questionCard,
            {
              backgroundColor: colors.primary,
              ...Platform.select({
                web: {
                  backgroundImage: 'linear-gradient(135deg, #6467f2, #6467f299)',
                  boxShadow: '0 8px 24px rgba(100,103,242,0.25)',
                },
              }) as any,
              shadowColor: colors.primary,
              shadowOpacity: 0.25,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            },
          ]}
        >
          <Text style={styles.questionLabel}>ЗАПОЛНИ ПРОПУСК</Text>
          <Text style={styles.sentenceText}>{sentenceWithBlank}</Text>

          {/* Hint: translation as anchor */}
          {currentCard?.backText ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>
                💡 {currentCard.backText}
              </Text>
            </View>
          ) : null}
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

              let borderColor = cardBorder;
              let bgColor = cardBg;
              let labelBg = isDark ? 'rgba(255,255,255,0.10)' : '#F1F5F9';
              let labelTextColor = colors.textSecondary;
              let textColor = colors.textPrimary;

              if (selectedOption !== null) {
                if (isCorrectAnswer) {
                  borderColor = '#22C55E';
                  bgColor = '#22C55E18';
                  labelBg = '#22C55E';
                  labelTextColor = '#FFFFFF';
                  textColor = '#22C55E';
                } else if (isSelected) {
                  borderColor = '#EF4444';
                  bgColor = '#EF444418';
                  labelBg = '#EF4444';
                  labelTextColor = '#FFFFFF';
                  textColor = '#EF4444';
                } else {
                  bgColor = isDark ? 'rgba(255,255,255,0.03)' : '#FAFAFA';
                }
              } else if (isSelected) {
                borderColor = colors.primary;
                bgColor = colors.primary + '15';
                labelBg = colors.primary;
                labelTextColor = '#FFFFFF';
                textColor = colors.primary;
              }

              return (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [
                    styles.optionBtn,
                    {
                      backgroundColor: bgColor,
                      borderColor,
                      borderWidth: isSelected || (selectedOption !== null && isCorrectAnswer) ? 2 : 1,
                    },
                    selectedOption !== null && !isSelected && !isCorrectAnswer && { opacity: 0.45 },
                    pressed && selectedOption === null && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                  ]}
                  onPress={() => handleSelect(option)}
                  disabled={selectedOption !== null}
                >
                  <View style={[styles.optionLabel, { backgroundColor: labelBg }]}>
                    <Text style={[styles.optionLabelText, { color: labelTextColor }]}>
                      {OPTION_LABELS[idx]}
                    </Text>
                  </View>
                  <Text
                    style={[styles.optionText, { color: textColor, fontWeight: isSelected ? '700' : '500' }]}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.s,
    gap: spacing.s,
    ...Platform.select({ web: { backdropFilter: 'blur(12px)' } }) as any,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerCounter: {
    fontSize: 14,
    fontWeight: '700',
  },

  progressTrack: {
    height: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    gap: spacing.m,
  },
  prepText: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: spacing.s,
  },

  scroll: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.l,
    gap: spacing.l,
  },

  questionCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    gap: spacing.m,
    ...Platform.select({
      web: {},
    }) as any,
  },
  questionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sentenceText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  hintBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    alignSelf: 'flex-start',
  },
  hintText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },

  optionsLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  optionsList: {
    gap: spacing.s,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    ...Platform.select({ web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } }) as any,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  optionLabel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionLabelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },

  // Result
  resultCard: {
    width: '100%',
    borderRadius: borderRadius.l,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.s,
  },
  resultEmoji: {
    fontSize: 48,
  },
  resultScore: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -2,
  },
  resultAccuracy: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    marginTop: spacing.m,
    ...Platform.select({ web: { boxShadow: '0 4px 16px rgba(100,103,242,0.3)' } }) as any,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
