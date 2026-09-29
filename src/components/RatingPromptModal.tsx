/**
 * Окно оценки приложения — появляется само после удачной тренировки (правила — services/feedback.ts).
 *
 * Шаги: звёзды → «Были ли проблемы?» →
 *   «Да» — что случилось (подсказки + текст) → отправить;
 *   «Нет» и 1–3 звезды — необязательное «Что нам улучшить?» (низкая оценка без причины мало что даёт);
 *   «Нет» и 4–5 звёзд — «Спасибо за отзыв!» и окно закрывается само.
 * Внизу всегда «Пропустить». По фону не закрывается — чтобы не закрыли случайно.
 * Своё окно, а не App Store: из него никуда не ведём (правила Apple запрещают отправлять
 * в App Store только довольных).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import {
  FEEDBACK_TAGS,
  sendRating,
  markRatingPromptSkipped,
  markRatingSubmitted,
  type FeedbackTag,
} from '@/services/feedback';

type Step = 'stars' | 'problem' | 'details' | 'thanks';

const STAR_COLOR = '#F59E0B';
const THANKS_CLOSE_MS = 1400;

export function RatingPromptModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('stars');
  const [rating, setRating] = useState(0);
  const [hasProblem, setHasProblem] = useState<boolean | null>(null);
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setStep('stars');
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

  const handleStar = (value: number) => {
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

  // Звёзды уже поставили — сохраняем их и при «Пропустить»: это уже полезные данные
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

  const chipBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const inputBg = isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC';

  const renderStars = (interactive: boolean) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Pressable
          key={value}
          disabled={!interactive}
          onPress={() => handleStar(value)}
          hitSlop={6}
          accessibilityLabel={`${value} из 5`}
        >
          <Ionicons
            name={value <= rating ? 'star' : 'star-outline'}
            size={interactive ? 40 : 24}
            color={value <= rating ? STAR_COLOR : colors.textTertiary}
          />
        </Pressable>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.m) },
          ]}
        >
          {step === 'stars' && (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Как вам Flashly?</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Оцените приложение — это займёт пару секунд
              </Text>
              {renderStars(true)}
            </>
          )}

          {step === 'problem' && (
            <>
              {renderStars(false)}
              <Text style={[styles.title, { color: colors.textPrimary }]}>Были ли проблемы в приложении?</Text>
              <View style={styles.answerRow}>
                <Pressable
                  style={({ pressed }) => [styles.answerBtn, { backgroundColor: chipBg, opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => handleProblemAnswer(true)}
                  disabled={sending}
                >
                  <Text style={[styles.answerText, { color: colors.textPrimary }]}>Да</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.answerBtn, { backgroundColor: chipBg, opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => handleProblemAnswer(false)}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={[styles.answerText, { color: colors.textPrimary }]}>Нет</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}

          {step === 'details' && (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {hasProblem ? 'Что случилось?' : 'Что нам улучшить?'}
              </Text>
              {hasProblem && (
                <View style={styles.tagsWrap}>
                  {FEEDBACK_TAGS.map((tag) => {
                    const active = tags.includes(tag.value);
                    return (
                      <Pressable
                        key={tag.value}
                        onPress={() => toggleTag(tag.value)}
                        style={[styles.tag, { backgroundColor: active ? colors.primary : chipBg }]}
                      >
                        <Text style={[styles.tagText, { color: active ? '#FFFFFF' : colors.textPrimary }]}>
                          {tag.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={hasProblem ? 'Опишите, что пошло не так' : 'Необязательно'}
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={2000}
                textAlignVertical="top"
                style={[
                  styles.input,
                  { color: colors.textPrimary, backgroundColor: inputBg, borderColor: colors.border },
                  Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
                ]}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary, opacity: sending ? 0.7 : pressed ? 0.85 : 1 },
                ]}
                onPress={() => submit({ hasProblem, tags, message })}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>{hasProblem ? 'Отправить' : 'Готово'}</Text>
                )}
              </Pressable>
            </>
          )}

          {step === 'thanks' && (
            <View style={styles.thanks}>
              <Ionicons name="heart" size={40} color={colors.primary} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>Спасибо за отзыв!</Text>
            </View>
          )}

          {step !== 'thanks' && (
            <Pressable onPress={handleSkip} hitSlop={10} style={styles.skipBtn} disabled={sending}>
              <Text style={[styles.skipText, { color: colors.textTertiary }]}>Пропустить</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    gap: spacing.m,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.s,
    paddingVertical: spacing.xs,
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  answerBtn: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerText: {
    fontSize: 16,
    fontWeight: '700',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  tag: {
    paddingHorizontal: spacing.s,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    minHeight: 96,
    maxHeight: 180,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    fontSize: 15,
  },
  primaryBtn: {
    height: 52,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  thanks: {
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.l,
  },
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
