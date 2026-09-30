/**
 * Test Join Screen
 * @description Экран ввода кода для подключения ученика к тесту
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import {
  ArrowRight,
  GraduationCap,
  User,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Screen, ScreenHeader } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize, heights, typography } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import { NeonService } from '@/services/NeonService';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

import { API_BASE } from '@/config/apiBase';
import { describeTestError } from '@/utils/testApiErrors';

type Props = NativeStackScreenProps<RootStackParamList, 'TestJoin'>;

// Экран живёт и в стеке (TestJoin), и вкладкой в таббаре (TestTab). Во вкладке нет
// кнопки «назад», а replace() из вкладки подменил бы весь Main в корневом стеке —
// поэтому там открываем следующий экран через navigate() поверх табов.
export function TestJoinScreen({ navigation, route }: Props) {
  const isTab = route.name !== 'TestJoin';
  const colors = useThemeColors();

  const [digits, setDigits] = useState(['', '', '', '']);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  // Имя берём из профиля — сервер при подключении записывает участнику то же самое
  // (display_name, иначе email), и именно его видит учитель.
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleDigitChange = (text: string, index: number) => {
    // Allow only digits
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-focus next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      supabase.auth.getSession().then(async ({ data }) => {
        const user = data.session?.user;
        if (!user) return;
        const fromProfile = await NeonService.getDisplayName(user.id);
        if (active) setDisplayName(fromProfile?.trim() || user.email || null);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const resetForm = () => {
    setDigits(['', '', '', '']);
    setJoining(false);
  };

  const code = digits.join('');
  const isCodeComplete = code.length === 4;

  const handleJoin = useCallback(async () => {
    if (!isCodeComplete || joining) return;
    setJoining(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${API_BASE}/test?action=join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const result = await resp.json();

      if (!resp.ok) {
        throw new Error(result.error || `Error ${resp.status}`);
      }

      // Переподключение к уже идущему тесту — открыть сразу вопрос, на котором ученик
      // остановился, а не всегда с нуля (см. план, пункт 40).
      if (result.alreadyJoined && result.status === 'active') {
        if (result.answerCount >= result.questionCount) {
          setError('Ты уже прошёл этот тест');
          setJoining(false);
          return;
        }
        const examParams = {
          sessionId: result.sessionId,
          participantId: result.participantId,
          testMode: result.testMode,
          questionCount: result.questionCount,
          timePerQuestion: result.timePerQuestion,
          initialQuestionIndex: result.answerCount,
        };
        if (isTab) {
          resetForm();
          navigation.navigate('TestExam', examParams);
        } else {
          navigation.replace('TestExam', examParams);
        }
        return;
      }

      const waitingParams = {
        sessionId: result.sessionId,
        participantId: result.participantId,
        setTitle: result.setTitle,
        teacherName: result.teacherName,
        testMode: result.testMode,
        questionCount: result.questionCount,
        timePerQuestion: result.timePerQuestion,
      };
      if (isTab) {
        resetForm();
        navigation.navigate('TestWaiting', waitingParams);
      } else {
        navigation.replace('TestWaiting', waitingParams);
      }
    } catch (e: any) {
      setError(describeTestError(e, 'Не удалось подключиться к тесту. Попробуй ещё раз.'));
      setJoining(false);
    }
  }, [code, isCodeComplete, joining, navigation, isTab]);

  return (
    <Screen
      keyboard
      header={
        <ScreenHeader
          onBack={isTab ? undefined : () => navigation.goBack()}
          center={
            <View style={styles.headerCenter}>
              <View style={[styles.logoBox, { backgroundColor: colors.primaryFill }]}>
                <GraduationCap size={iconSize.xs} color={colors.onPrimary} />
              </View>
              <Text variant="button" accessibilityRole="header" style={[styles.headerTitle, { color: colors.textPrimary }]}>
                Вход в тест
              </Text>
            </View>
          }
        />
      }
      footer={
        <Text variant="caption" style={[styles.footerText, { color: colors.textSecondary }]}>
          Код теста показывает учитель на своём экране
        </Text>
      }
      contentStyle={styles.content}
    >
      {/* Illustration */}
      <View style={[styles.illustration, { backgroundColor: alpha(colors.primary, 10) }]}>
        <GraduationCap size={iconSize.xl} color={colors.primary} />
      </View>

      {/* Title */}
      <Text variant="h2" style={[styles.title, { color: colors.textPrimary }]}>
        Подключись к тесту
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Введи код от учителя
      </Text>

      {/* PIN Input */}
      <View style={styles.pinRow}>
        {digits.map((digit, idx) => {
          const active = focusedIndex === idx || !!digit;
          return (
            <TextInput
              key={idx}
              ref={(ref) => { inputRefs.current[idx] = ref; }}
              style={[
                styles.pinInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  borderWidth: focusedIndex === idx ? 2 : 1,
                  color: colors.textPrimary,
                },
              ]}
              value={digit}
              onChangeText={(text) => handleDigitChange(text, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              onFocus={() => setFocusedIndex(idx)}
              onBlur={() => setFocusedIndex((cur) => (cur === idx ? null : cur))}
              keyboardType="number-pad"
              maxLength={1}
              placeholder="•"
              placeholderTextColor={colors.textTertiary}
              textAlign="center"
              selectTextOnFocus
              accessibilityLabel={`Цифра ${idx + 1} из 4`}
            />
          );
        })}
      </View>

      {/* Name — только показ, из профиля */}
      <View style={styles.nameSection}>
        <Text variant="overline" style={[styles.nameLabel, { color: colors.textSecondary }]}>
          Твоё имя
        </Text>
        <View style={[styles.nameField, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <User size={iconSize.s} color={colors.textSecondary} />
          <Text style={[styles.nameText, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName ?? '…'}
          </Text>
        </View>
      </View>

      {/* Error */}
      {error && (
        <View
          accessibilityRole="alert"
          style={[styles.errorBox, { backgroundColor: alpha(colors.error, 10), borderColor: alpha(colors.error, 20) }]}
        >
          <Text variant="label" style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
        </View>
      )}

      {/* Join Button */}
      <Button
        title="Подключиться"
        iconRight={ArrowRight}
        fullWidth
        disabled={!isCodeComplete}
        loading={joining}
        onPress={handleJoin}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    letterSpacing: 0,
  },
  logoBox: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  illustration: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.l,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.l,
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.s,
    marginBottom: spacing.xl,
  },
  pinInput: {
    width: 56,
    height: 64,
    borderRadius: borderRadius.m,
    ...typography.h2,
    lineHeight: undefined,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  } as any,
  nameSection: {
    width: '100%',
    marginBottom: spacing.l,
  },
  nameLabel: {
    marginBottom: spacing.xs,
  },
  nameField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    height: heights.input,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
  },
  nameText: {
    flex: 1,
  },
  errorBox: {
    width: '100%',
    padding: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  errorText: {
    textAlign: 'center',
  },
  footerText: {
    textAlign: 'center',
  },
});
