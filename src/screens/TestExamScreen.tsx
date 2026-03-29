/**
 * Test Exam Screen
 * @description Экран теста для ученика — multiple choice без мгновенной обратной связи
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

type Props = NativeStackScreenProps<RootStackParamList, 'TestExam'>;

type QuestionData = {
  cardId: string;
  front: string;
  options: string[];
  totalQuestions: number;
};

type AnswerRecord = {
  word: string;
  yourAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
};

export function TestExamScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const { sessionId, participantId, questionCount, timePerQuestion } = route.params;

  const [questionIndex, setQuestionIndex] = useState(0);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timePerQuestion);

  // Refs для накопленных данных (без ре-рендера)
  const answersRef = useRef<AnswerRecord[]>([]);
  const correctCountRef = useRef(0);
  const startTimeRef = useRef<number>(Date.now());
  const finishedRef = useRef(false);

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : '#E5E7EB';

  const finishExam = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    navigation.replace('TestDone', {
      correct: correctCountRef.current,
      total: questionCount,
      answers: answersRef.current,
    });
  }, [navigation, questionCount]);

  const fetchQuestion = useCallback(async (idx: number) => {
    setLoadingQuestion(true);
    setSelectedOption(null);
    setSubmitting(false);
    startTimeRef.current = Date.now();
    if (timePerQuestion > 0) setTimeLeft(timePerQuestion);

    try {
      const res = await fetch(`${API_BASE}/test?action=get-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, questionIndex: idx }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load question');
      setQuestion(json);
    } catch (e: any) {
      console.error('get-question error:', e);
    } finally {
      setLoadingQuestion(false);
    }
  }, [participantId, timePerQuestion]);

  // Загрузить первый вопрос
  useEffect(() => {
    fetchQuestion(0);
  }, []);

  // Realtime: учитель принудительно завершил тест
  useEffect(() => {
    const channel = supabase.channel(`test:${sessionId}:exam`);
    channel
      .on('broadcast', { event: 'test_finished' }, () => {
        finishExam();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, finishExam]);

  // Таймер
  useEffect(() => {
    if (timePerQuestion <= 0 || loadingQuestion || submitting) return;

    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          // Время вышло — отправить пустой ответ
          handleSelect('');
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [questionIndex, loadingQuestion, submitting, timePerQuestion]);

  const handleSelect = useCallback(async (option: string) => {
    if (submitting || !question) return;

    setSelectedOption(option);
    setSubmitting(true);

    const timeSpentSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    const nextIdx = questionIndex + 1;
    const isLastQuestion = nextIdx >= questionCount;

    try {
      // Запускаем оба запроса параллельно: отправка ответа + загрузка следующего вопроса
      const answerPromise = fetch(`${API_BASE}/test?action=answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          cardId: question.cardId,
          chosenAnswer: option,
          timeSpentSec,
        }),
      }).then((r) => r.json());

      const nextQuestionPromise = !isLastQuestion
        ? fetch(`${API_BASE}/test?action=get-question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantId, questionIndex: nextIdx }),
          }).then((r) => r.json())
        : Promise.resolve(null);

      const [json, nextQuestion] = await Promise.all([answerPromise, nextQuestionPromise]);

      // Сохранить результат
      answersRef.current = [
        ...answersRef.current,
        {
          word: question.front,
          yourAnswer: option,
          correctAnswer: json.correctAnswer || '',
          isCorrect: json.isCorrect || false,
        },
      ];
      if (json.isCorrect) correctCountRef.current += 1;

      if (json.done || isLastQuestion) {
        finishExam();
      } else {
        // Следующий вопрос уже загружен — показываем мгновенно
        setQuestion(nextQuestion);
        setQuestionIndex(nextIdx);
        setSelectedOption(null);
        setSubmitting(false);
        startTimeRef.current = Date.now();
        if (timePerQuestion > 0) setTimeLeft(timePerQuestion);
      }
    } catch (e: any) {
      console.error('answer error:', e);
      setSubmitting(false);
    }
  }, [submitting, question, participantId, questionIndex, questionCount, timePerQuestion, finishExam]);

  const progress = questionCount > 0 ? questionIndex / questionCount : 0;
  const timerColor = timeLeft <= 5 && timePerQuestion > 0 ? '#EF4444' : colors.primary;

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
        <View style={styles.headerRow}>
          <Text style={[styles.questionCounter, { color: colors.textSecondary }]}>
            {questionIndex + 1} / {questionCount}
          </Text>
          {timePerQuestion > 0 && (
            <View style={[styles.timerBadge, { backgroundColor: timerColor + '18', borderColor: timerColor + '30' }]}>
              <Text style={[styles.timerText, { color: timerColor }]}>
                {timeLeft}s
              </Text>
            </View>
          )}
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
      </View>

      {loadingQuestion ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : question ? (
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
            <Text style={styles.questionLabel}>ВОПРОС {questionIndex + 1}</Text>
            <Text style={styles.questionText}>{question.front}</Text>
          </View>

          {/* Options */}
          <View style={styles.optionsList}>
            {question.options.map((option, idx) => {
              const isSelected = selectedOption === option;
              return (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [
                    styles.optionBtn,
                    {
                      backgroundColor: isSelected
                        ? colors.primary + '15'
                        : cardBg,
                      borderColor: isSelected
                        ? colors.primary
                        : cardBorder,
                      borderWidth: isSelected ? 2 : 1,
                    },
                    submitting && !isSelected && { opacity: 0.5 },
                    pressed && !submitting && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                  ]}
                  onPress={() => handleSelect(option)}
                  disabled={submitting}
                >
                  <View
                    style={[
                      styles.optionLabel,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : isDark ? 'rgba(255,255,255,0.10)' : '#F1F5F9',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionLabelText,
                        { color: isSelected ? '#FFFFFF' : colors.textSecondary },
                      ]}
                    >
                      {OPTION_LABELS[idx]}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color: isSelected ? colors.primary : colors.textPrimary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                    numberOfLines={3}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.s,
    gap: spacing.s,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  questionCounter: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  timerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.l,
    gap: spacing.l,
  },

  // Question card
  questionCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    minHeight: 140,
    justifyContent: 'center',
    gap: 8,
  },
  questionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  questionText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 34,
  },

  // Options
  optionsList: {
    gap: spacing.s,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
    }) as any,
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
});
