/**
 * Feedback Screen
 * @description «Написать нам»: проблема, идея или вопрос. Смотрится в админке (app_feedback).
 */
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Bug, Lightbulb, HelpCircle, CheckCircle2 } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, EmptyState, Screen, ScreenHeader, TextField, toast, type IconComponent } from '@/components/ui';
import { spacing, borderRadius, heights, iconSize } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { sendFeedbackMessage, type FeedbackCategory } from '@/services/feedback';

const CATEGORIES: Array<{ value: FeedbackCategory; label: string; icon: IconComponent; placeholder: string }> = [
  { value: 'problem', label: 'Проблема', icon: Bug, placeholder: 'Что не работает? Где это случилось и что ты делал перед этим?' },
  { value: 'idea', label: 'Идея', icon: Lightbulb, placeholder: 'Что бы ты хотел добавить или улучшить?' },
  { value: 'question', label: 'Вопрос', icon: HelpCircle, placeholder: 'Твой вопрос' },
];

const MIN_LENGTH = 10;
const MAX_LENGTH = 4000;

export function FeedbackScreen({ navigation }: any) {
  const colors = useThemeColors();

  const [category, setCategory] = useState<FeedbackCategory>('problem');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length >= MIN_LENGTH && !sending;
  const current = CATEGORIES.find((c) => c.value === category)!;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await sendFeedbackMessage(category, message).catch(() => false);
    setSending(false);
    if (ok) {
      triggerHaptic('notificationSuccess');
      setSent(true);
      return;
    }
    // Текст не теряем — можно отправить ещё раз
    toast.error('Не удалось отправить. Проверь интернет и попробуй ещё раз');
  };

  const header = <ScreenHeader title="Написать нам" onBack={() => navigation.goBack()} bordered />;

  if (sent) {
    return (
      <Screen header={header} scroll={false} contentStyle={st.sentWrap}>
        <EmptyState
          icon={CheckCircle2}
          title="Спасибо!"
          description="Сообщение отправлено. Мы обязательно его прочитаем."
          action={{ label: 'Готово', onPress: () => navigation.goBack() }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} keyboard contentStyle={st.content}>
      <Text variant="bodySmall" color="secondary">
        Нашёл ошибку или есть идея? Напиши — мы читаем каждое сообщение.
      </Text>

      {/* ======== Category ======== */}
      <View style={st.categoriesRow} accessibilityRole="radiogroup">
        {CATEGORIES.map((c) => {
          const active = c.value === category;
          const Icon = c.icon;
          return (
            <Pressable
              key={c.value}
              onPress={() => setCategory(c.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={[st.category, { backgroundColor: active ? colors.primaryFill : colors.surfaceMuted }]}
            >
              <Icon size={iconSize.s} color={active ? colors.onPrimary : colors.textSecondary} />
              <Text variant="label" style={{ color: active ? colors.onPrimary : colors.textPrimary }}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ======== Message ======== */}
      <TextField
        value={message}
        onChangeText={setMessage}
        placeholder={current.placeholder}
        accessibilityLabel="Сообщение"
        multiline
        maxLength={MAX_LENGTH}
        hint="Мы приложим версию приложения и системы — так проще разобраться с проблемой."
        inputStyle={[st.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
      />

      <Button title="Отправить" onPress={handleSend} disabled={!canSend} loading={sending} fullWidth />
    </Screen>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.l,
    gap: spacing.m,
  },
  sentWrap: {
    justifyContent: 'center',
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  category: {
    flex: 1,
    minHeight: heights.button,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
  },
  input: {
    minHeight: 160,
  },
});
