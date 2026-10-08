/**
 * Опрос «Как тебе Flashly?» — появляется сам после удачной тренировки (правила — services/feedback.ts).
 *
 * Шаги: «Нравится / Нормально / Не нравится» → «Были ли проблемы?» →
 *   «Да» — что случилось (подсказки + текст) → отправить;
 *   «Нет» и «Нормально» / «Не нравится» — необязательное «Что нам улучшить?»;
 *   «Нет» и «Нравится» — «Спасибо за отзыв!» и окно закрывается само.
 * Внизу всегда «Пропустить». По фону не закрывается — чтобы не закрыли случайно.
 * Оформление — общий нижний лист Sheet (брендбук, 7.6).
 * Без звёзд: своё окно со звёздами похоже на оценку App Store, а такие окна Apple запрещает
 * (App Review 5.6.1). В App Store отсюда не ведём. На сервер по-прежнему уходит число 1–5
 * (SATISFACTION.score) — статистика в админке не меняется.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Heart, Meh, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Chip, Sheet, TextField } from '@/components/ui';
import { useThemeColors } from '@/store';
import { iconSize, spacing } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import {
  FEEDBACK_TAGS,
  sendRating,
  markRatingPromptSkipped,
  markRatingSubmitted,
  type FeedbackTag,
} from '@/services/feedback';

type Step = 'mood' | 'problem' | 'details' | 'thanks';

const SATISFACTION = [
  { score: 5, label: 'Нравится', icon: ThumbsUp },
  { score: 3, label: 'Нормально', icon: Meh },
  { score: 1, label: 'Не нравится', icon: ThumbsDown },
] as const;

const THANKS_CLOSE_MS = 1400;

export function RatingPromptModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();

  const [step, setStep] = useState<Step>('mood');
  const [rating, setRating] = useState(0);
  const [hasProblem, setHasProblem] = useState<boolean | null>(null);
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setStep('mood');
      setRating(0);
      setHasProblem(null);
      setTags([]);
      setMessage('');
      setSending(false);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [visible]);

  const showThanks = useCallback(() => {
    setStep('thanks');
    closeTimer.current = setTimeout(onClose, THANKS_CLOSE_MS);
  }, [onClose]);

  const submit = useCallback(
    async (payload: { hasProblem: boolean | null; tags?: FeedbackTag[]; message?: string }) => {
      setSending(true);
      markRatingSubmitted();
      // Ошибку сети не показываем: это необязательный опрос, пользователя не наказываем
      await sendRating({ rating, ...payload }).catch(() => false);
      setSending(false);
      showThanks();
    },
    [rating, showThanks],
  );

  const handleMood = (value: number) => {
    triggerHaptic('selection');
    setRating(value);
    setStep('problem');
  };

  const handleProblemAnswer = (answer: boolean) => {
    triggerHaptic('selection');
    setHasProblem(answer);
    if (answer || rating <= 3) {
      setStep('details');
    } else {
      submit({ hasProblem: false });
    }
  };

  const toggleTag = (tag: FeedbackTag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  // Ответ уже выбрали — сохраняем его и при «Пропустить»: это уже полезные данные
  const handleSkip = () => {
    if (sending) return;
    if (step === 'thanks') {
      onClose();
      return;
    }
    if (rating > 0) {
      markRatingSubmitted();
      sendRating({ rating, hasProblem }).catch(() => false);
    } else {
      markRatingPromptSkipped();
    }
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleSkip} dismissOnBackdrop={false}>
      <View style={styles.content}>
        {step === 'mood' && (
          <>
            <Text variant="h3" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
              Как тебе Flashly?
            </Text>
            <Text variant="bodySmall" align="center" style={[styles.subtitle, { color: colors.textSecondary }]}>
              Ответь в одно касание — так мы поймём, что улучшить
            </Text>
            <View style={styles.moodList}>
              {SATISFACTION.map((option) => (
                <Button
                  key={option.score}
                  variant="secondary"
                  icon={option.icon}
                  title={option.label}
                  onPress={() => handleMood(option.score)}
                  fullWidth
                />
              ))}
            </View>
          </>
        )}

        {step === 'problem' && (
          <>
            <Text variant="h3" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
              Были ли проблемы в приложении?
            </Text>
            <View style={styles.answerRow}>
              <Button
                variant="secondary"
                title="Да"
                onPress={() => handleProblemAnswer(true)}
                disabled={sending}
                style={styles.flex1}
              />
              <Button
                variant="secondary"
                title="Нет"
                onPress={() => handleProblemAnswer(false)}
                loading={sending}
                style={styles.flex1}
              />
            </View>
          </>
        )}

        {step === 'details' && (
          <>
            <Text variant="h3" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
              {hasProblem ? 'Что случилось?' : 'Что нам улучшить?'}
            </Text>
            {hasProblem && (
              <View style={styles.tagsWrap}>
                {FEEDBACK_TAGS.map((tag) => (
                  <Chip
                    key={tag.value}
                    label={tag.label}
                    selected={tags.includes(tag.value)}
                    onPress={() => toggleTag(tag.value)}
                  />
                ))}
              </View>
            )}
            <TextField
              value={message}
              onChangeText={setMessage}
              placeholder={hasProblem ? 'Опиши, что пошло не так' : 'Необязательно'}
              accessibilityLabel={hasProblem ? 'Что случилось' : 'Что улучшить'}
              multiline
              maxLength={2000}
              inputStyle={styles.input}
            />
            <Button
              title={hasProblem ? 'Отправить' : 'Готово'}
              onPress={() => submit({ hasProblem, tags, message })}
              loading={sending}
              fullWidth
            />
          </>
        )}

        {step === 'thanks' && (
          <View style={styles.thanks} accessibilityLiveRegion="polite">
            <Heart size={iconSize.xl} color={colors.primary} fill={colors.primary} />
            <Text variant="h3" align="center" style={{ color: colors.textPrimary }}>Спасибо за отзыв!</Text>
          </View>
        )}

        {step !== 'thanks' && (
          <Button variant="quiet" tone="secondary" title="Пропустить" onPress={handleSkip} disabled={sending} />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  content: {
    gap: spacing.m,
    paddingTop: spacing.xs,
  },
  subtitle: {
    marginTop: -spacing.xs,
  },
  moodList: {
    gap: spacing.s,
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  input: {
    maxHeight: 180,
  },
  thanks: {
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.l,
  },
});
