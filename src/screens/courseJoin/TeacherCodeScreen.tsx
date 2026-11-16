/**
 * «Введи код» на онбординге: код учителя (plan/new/new_user_activation.md, Start 7.1) или код
 * учебного центра (plan/new/center_books.md, Center 5) в одном поле. 6 символов — курс,
 * с дефисом (ALFA-DEC-7K) — центр. Ученик с кодом не проходит весь онбординг.
 */
import React, { useState } from 'react';
import { Clipboard, StyleSheet, TextInput, View } from 'react-native';
import { ClipboardPaste, Info } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import { borderRadius, iconSize, spacing, typography } from '@/constants';
import { NeonService } from '@/services/NeonService';
import type { CourseInviteInfo } from '@/services/neon/courses';
import { CenterService, type CenterCodeResult } from '@/services/CenterService';
import { describeTeacherApiReason } from '@/utils/teacherApiErrors';
import {
  CENTER_CODE_MAX,
  describeCenterReason,
  isCenterCode,
  isJoinCodeReady,
  normalizeJoinCode,
} from '@/utils/centerCode';
import { Analytics } from '@/services/analytics';

type Props = {
  onFound: (code: string, info: CourseInviteInfo) => void;
  /** Код учебного центра: центр найден, доступ ещё не открыт (место не тратится) */
  onCenterFound: (code: string, info: Extract<CenterCodeResult, { ok: true }>) => void;
  onBack: () => void;
};

export function TeacherCodeScreen({ onFound, onCenterFound, onBack }: Props) {
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const center = code.includes('-');

  const find = async (value = code) => {
    if (!isJoinCodeReady(value) || looking) return;
    setLooking(true);
    setError(null);
    try {
      if (isCenterCode(value)) {
        const result = await CenterService.getInfo(value);
        Analytics.orgCodeEntered(result.ok, result.reason);
        if (result.ok) onCenterFound(value, result);
        else setError(describeCenterReason(result.reason));
        return;
      }
      const result = await NeonService.getCourseInviteInfoByCode(value);
      if (result.ok) onFound(value, result);
      else setError(describeTeacherApiReason(result.reason));
    } catch {
      setError(describeTeacherApiReason('network'));
    } finally {
      setLooking(false);
    }
  };

  // Код скопировали на странице ссылки, пока ставили приложение: iOS не передаёт ссылку в только
  // что установленное приложение. Буфер читаем только по нажатию — сами не заглядываем.
  const paste = async () => {
    const text = normalizeJoinCode(await Clipboard.getString().catch(() => ''));
    if (!isJoinCodeReady(text)) {
      setError('В буфере нет кода. Скопируй его ещё раз или введи вручную.');
      return;
    }
    setCode(text);
    find(text);
  };

  return (
    <OnboardingStep
      onBack={onBack}
      title="Flashly"
      step={1}
      total={2}
      headline="Введи код"
      description="От учителя — 6 символов. От учебного центра — с дефисом, например ALFA-DEC-7K."
      keyboard
      footer={
        <Button
          title={center ? 'Найти центр' : 'Найти курс'}
          loading={looking}
          disabled={!isJoinCodeReady(code)}
          onPress={() => find()}
          fullWidth
        />
      }
    >
      <TextInput
        value={code}
        onChangeText={(t) => {
          setError(null);
          setCode(normalizeJoinCode(t));
        }}
        placeholder="K7M2QX"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={CENTER_CODE_MAX}
        returnKeyType="search"
        onSubmitEditing={() => find()}
        accessibilityLabel="Код от учителя или учебного центра"
        style={[
          styles.input,
          typography.h1,
          center && styles.inputLong,
          {
            color: colors.textPrimary,
            borderColor: error ? colors.error : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      />
      {error ? (
        <Text variant="bodySmall" accessibilityRole="alert" style={{ color: colors.errorText }}>
          {error}
        </Text>
      ) : null}
      <Button
        title="Вставить код"
        icon={ClipboardPaste}
        variant="quiet"
        size="s"
        onPress={paste}
        style={styles.paste}
      />
      <View style={[styles.note, { backgroundColor: colors.surfaceVariant }]}>
        <Info size={iconSize.s} color={colors.primary} />
        <Text variant="bodySmall" style={[styles.flex, { color: colors.textSecondary }]}>
          Есть ссылка от учителя или центра? Просто открой её — код вводить не нужно.
        </Text>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 2,
    borderRadius: borderRadius.l,
    height: 72,
    textAlign: 'center',
    letterSpacing: 8,
  },
  // Код центра длиннее (до 14 символов) — меньше разрядка и кегль, чтобы влез на iPhone SE
  inputLong: {
    letterSpacing: 1,
    fontSize: 24,
  },
  paste: { alignSelf: 'center' },
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    borderRadius: borderRadius.m,
    padding: spacing.s,
  },
  flex: { flex: 1 },
});
