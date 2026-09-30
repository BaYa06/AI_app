/**
 * Test Exam Screen
 * @description Экран теста для ученика — multiple choice без мгновенной обратной связи
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Text } from '@/components/common';
import { Button, ProgressBar, Screen, Skeleton, SkeletonCard } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, heights, screenPadding } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

import { API_BASE } from '@/config/apiBase';

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

  const { sessionId, participantId, questionCount, timePerQuestion, initialQuestionIndex } = route.params;

  const [questionIndex, setQuestionIndex] = useState(initialQuestionIndex || 0);
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
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`${API_BASE}/test?action=get-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  // Загрузить первый вопрос — или, при переподключении к уже идущему тесту, тот, на котором
  // ученик остановился (см. план, пункт 40).
  useEffect(() => {
    fetchQuestion(initialQuestionIndex || 0);
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
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [questionIndex, loadingQuestion, submitting, timePerQuestion]);

  // Время вышло — автоматически отправить выбранный или пустой ответ
  useEffect(() => {
    if (timePerQuestion > 0 && timeLeft === 0 && !submitting && !loadingQuestion) {
      handleSubmit(selectedOption ?? '');
    }
  }, [timeLeft]);

  const handleSubmit = useCallback(async (option: string) => {
    if (submitting || !question) return;

    setSelectedOption(option);
    setSubmitting(true);

    const timeSpentSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    const nextIdx = questionIndex + 1;
    const isLastQuestion = nextIdx >= questionCount;

    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      const answerPromise = fetch(`${API_BASE}/test?action=answer`, {
        method: 'POST',
        headers: authHeaders,
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
            headers: authHeaders,
            body: JSON.stringify({ participantId, questionIndex: nextIdx }),
          }).then((r) => r.json())
        : Promise.resolve(null);

      const [json, nextQuestion] = await Promise.all([answerPromise, nextQuestionPromise]);

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
  const timerUrgent = timeLeft <= 5 && timePerQuestion > 0;

  return (
    <Screen
      enableSwipeBack={false}
      header={
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text variant="label" style={[styles.tabular, { color: colors.textSecondary }]}>
              {questionIndex + 1} / {questionCount}
            </Text>
            {timePerQuestion > 0 && (
              <View
                accessibilityLabel={`Осталось ${timeLeft} секунд`}
                style={[
                  styles.timerBadge,
                  { backgroundColor: alpha(timerUrgent ? colors.error : colors.primary, 10) },
                ]}
              >
                <Text
                  variant="label"
                  style={[styles.timerText, { color: timerUrgent ? colors.errorText : colors.primary }]}
                >
                  {timeLeft} с
                </Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          <ProgressBar progress={Math.round(progress * 100)} accessibilityLabel="Прогресс теста" />
        </View>
      }
      contentStyle={styles.scroll}
    >
      {loadingQuestion ? (
        <View accessibilityLabel="Загрузка" accessibilityRole="progressbar" style={styles.skeleton}>
          <SkeletonCard height={140} />
          {OPTION_LABELS.map((label) => (
            <Skeleton key={label} height={heights.touch + spacing.m * 2} radius="l" />
          ))}
        </View>
      ) : question ? (
        <>
          {/* Question card */}
          <View style={[styles.questionCard, { backgroundColor: colors.primaryFill }]}>
            <Text variant="overline" style={{ color: colors.onPrimary }}>
              Вопрос {questionIndex + 1}
            </Text>
            <Text variant="h2" style={{ color: colors.onPrimary }}>{question.front}</Text>
          </View>

          {/* Options */}
          <View accessibilityRole="radiogroup" style={styles.optionsList}>
            {question.options.map((option, idx) => {
              const isSelected = selectedOption === option;
              return (
                <Pressable
                  key={idx}
                  accessibilityRole="radio"
                  accessibilityLabel={`${OPTION_LABELS[idx]}. ${option}`}
                  accessibilityState={{ selected: isSelected, disabled: submitting }}
                  style={({ pressed }) => [
                    styles.optionBtn,
                    {
                      backgroundColor: isSelected ? alpha(colors.primary, 10) : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                    submitting && !isSelected && styles.optionDimmed,
                    pressed && !submitting && styles.optionPressed,
                  ]}
                  onPress={() => !submitting && setSelectedOption(option)}
                  disabled={submitting}
                >
                  <View
                    style={[
                      styles.optionLabel,
                      { backgroundColor: isSelected ? colors.primaryFill : colors.surfaceMuted },
                    ]}
                  >
                    <Text
                      variant="label"
                      style={{ color: isSelected ? colors.onPrimary : colors.textSecondary }}
                    >
                      {OPTION_LABELS[idx]}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color: isSelected ? colors.primary : colors.textPrimary,
                        fontWeight: isSelected ? '600' : '400',
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

          {/* Confirm button */}
          <Button
            title="Подтвердить"
            fullWidth
            style={styles.confirmBtn}
            disabled={!selectedOption}
            loading={submitting}
            onPress={() => selectedOption && handleSubmit(selectedOption)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    paddingBottom: spacing.s,
    gap: spacing.s,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: heights.touch,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  timerBadge: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  timerText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  skeleton: {
    gap: spacing.s,
  },

  scroll: {
    paddingTop: spacing.l,
    gap: spacing.l,
  },

  // Question card
  questionCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    minHeight: 140,
    justifyContent: 'center',
    gap: spacing.xs,
  },

  // Options
  optionsList: {
    gap: spacing.s,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.l,
    // Толщина рамки одинаковая в обоих состояниях — вариант не «прыгает» при выборе
    borderWidth: 2,
  },
  optionDimmed: {
    opacity: 0.5,
  },
  optionPressed: {
    opacity: 0.85,
  },
  optionLabel: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionText: {
    flex: 1,
  },
  confirmBtn: {
    marginTop: spacing.s,
  },
});
