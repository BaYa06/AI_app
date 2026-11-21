/**
 * «Курс найден» (plan/new/new_user_activation.md, Start 7.2): название, учитель, наборы и слова,
 * «Языки возьмём из курса» — экраны языков, цели и нормы ученик курса пропускает.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckCircle2, GraduationCap } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, getLanguageDefByCode, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import type { CourseInviteInfo, JoinCourseAction } from '@/services/neon/courses';

type Props = {
  info: CourseInviteInfo;
  /** Пришёл по ссылке — шага кода не было, «Это не мой курс» ведёт к обычному онбордингу */
  viaLink: boolean;
  /** Ошибка присоединения — текст для ученика */
  onJoin: JoinCourseAction;
  onNotMine: () => void;
};

export function CourseFoundScreen({ info, viaLink, onJoin, onNotMine }: Props) {
  const colors = useThemeColors();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = info.languageFrom ? getLanguageDefByCode(info.languageFrom) : undefined;
  const to = info.languageTo ? getLanguageDefByCode(info.languageTo) : undefined;
  const sets = info.setsCount ?? 0;
  const words = info.wordsCount ?? 0;

  return (
    <OnboardingStep
      step={viaLink ? undefined : 1}
      total={2}
      headline="Курс найден"
      description="Проверь, что это твой учитель."
      footer={
        <>
          {error ? (
            <Text variant="bodySmall" accessibilityRole="alert" style={{ color: colors.errorText }}>
              {error}
            </Text>
          ) : null}
          <Button
            title="Присоединиться"
            loading={joining}
            onPress={async () => {
              setJoining(true);
              setError(null);
              try {
                setError(await onJoin());
              } finally {
                setJoining(false);
              }
            }}
            fullWidth
          />
          <Button title="Это не мой курс" variant="quiet" onPress={onNotMine} fullWidth />
        </>
      }
    >
      <View
        style={[
          styles.card,
          { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 10) },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: colors.primaryFill }]}>
          <GraduationCap size={iconSize.m} color={colors.onPrimary} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyLarge" style={[styles.bold, { color: colors.textPrimary }]}>
            {info.courseTitle}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Учитель: {info.teacherName}
          </Text>
          {sets > 0 ? (
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {sets} {pluralize(sets, 'набор', 'набора', 'наборов')} · {words}{' '}
              {pluralize(words, 'слово', 'слова', 'слов')}
            </Text>
          ) : null}
        </View>
      </View>
      {from && to ? (
        <View style={[styles.note, { backgroundColor: colors.surfaceVariant }]}>
          <CheckCircle2 size={iconSize.s} color={colors.successText} />
          <Text variant="bodySmall" style={[styles.flex, { color: colors.textPrimary }]}>
            <Text variant="bodySmall" style={styles.bold}>
              Языки возьмём из курса:{' '}
            </Text>
            {from.flag} {from.label} → {to.flag} {to.label}. Выбирать не нужно.
          </Text>
        </View>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.m,
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    borderRadius: borderRadius.m,
    padding: spacing.s,
  },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: '700' },
});
