/**
 * Feedback Screen
 * @description «Написать нам»: проблема, идея или вопрос. Смотрится в админке (app_feedback).
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useThemeColors, useSettingsStore } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { sendFeedbackMessage, type FeedbackCategory } from '@/services/feedback';

const CATEGORIES: Array<{ value: FeedbackCategory; label: string; icon: string; placeholder: string }> = [
  { value: 'problem', label: 'Проблема', icon: 'bug-outline', placeholder: 'Что не работает? Где это случилось и что вы делали перед этим?' },
  { value: 'idea', label: 'Идея', icon: 'bulb-outline', placeholder: 'Что бы вы хотели добавить или улучшить?' },
  { value: 'question', label: 'Вопрос', icon: 'help-circle-outline', placeholder: 'Ваш вопрос' },
];

const MIN_LENGTH = 10;
const MAX_LENGTH = 4000;

export function FeedbackScreen({ navigation }: any) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';

  const [category, setCategory] = useState<FeedbackCategory>('problem');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const chipBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const inputBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
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
    const msg = 'Не удалось отправить. Проверьте интернет и попробуйте ещё раз.';
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Ошибка', msg);
  };

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {/* ======== Header ======== */}
      <View style={[st.header, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF', borderBottomColor: cardBorder }]}>
        <Pressable style={[st.backBtn, { backgroundColor: chipBg }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Написать нам</Text>
        <View style={st.headerSpacer} />
      </View>

      {sent ? (
        <View style={st.sentWrap}>
          <View style={[st.sentIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
          </View>
          <Text style={[st.sentTitle, { color: colors.textPrimary }]}>Спасибо!</Text>
          <Text style={[st.sentText, { color: colors.textSecondary }]}>
            Сообщение отправлено. Мы обязательно его прочитаем.
          </Text>
          <Pressable
            style={({ pressed }) => [st.sendBtn, st.sentBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={st.sendBtnText}>Готово</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={st.flex}
            contentContainerStyle={st.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[st.intro, { color: colors.textSecondary }]}>
              Нашли ошибку или есть идея? Напишите — мы читаем каждое сообщение.
            </Text>

            {/* ======== Category ======== */}
            <View style={st.categoriesRow}>
              {CATEGORIES.map((c) => {
                const active = c.value === category;
                return (
                  <Pressable
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    style={[st.category, { backgroundColor: active ? colors.primary : chipBg }]}
                  >
                    <Ionicons name={c.icon as any} size={18} color={active ? '#FFFFFF' : colors.textSecondary} />
                    <Text style={[st.categoryText, { color: active ? '#FFFFFF' : colors.textPrimary }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ======== Message ======== */}
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={current.placeholder}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={MAX_LENGTH}
              textAlignVertical="top"
              style={[
                st.input,
                { color: colors.textPrimary, backgroundColor: inputBg, borderColor: colors.border },
                Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
              ]}
            />
            <Text style={[st.hint, { color: colors.textTertiary }]}>
              Мы приложим версию приложения и системы — так проще разобраться с проблемой.
            </Text>

            <Pressable
              style={({ pressed }) => [
                st.sendBtn,
                { backgroundColor: colors.primary, opacity: !canSend ? 0.5 : pressed ? 0.85 : 1 },
              ]}
              onPress={handleSend}
              disabled={!canSend}
            >
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={st.sendBtnText}>Отправить</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // Content
  scrollContent: {
    padding: spacing.l,
    paddingBottom: spacing.xxl + 40,
    gap: spacing.m,
  },
  intro: {
    fontSize: 14,
    fontWeight: '500',
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  category: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: borderRadius.m,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    fontSize: 15,
    lineHeight: 21,
  },
  hint: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: -spacing.xs,
  },
  sendBtn: {
    height: 52,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Sent
  sentWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    gap: spacing.s,
  },
  sentIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s,
  },
  sentTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  sentText: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  sentBtn: {
    alignSelf: 'stretch',
    marginTop: spacing.l,
  },
});
