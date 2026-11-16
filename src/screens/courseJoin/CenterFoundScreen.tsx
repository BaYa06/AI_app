/**
 * «Центр найден» (plan/new/center_books.md, Center 5): логотип и название центра, срок доступа,
 * «Книгу и юнит выбираешь сам». Доступ открывается только по «Выбрать книгу» — «Это не мой центр»
 * место не тратит (сервер проверил код без записи, org-info).
 */
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { BookOpen, CheckCircle2, Info } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { daysLeft, formatAccessDate } from '@/utils/centerCode';
import type {
  CenterActivateAction,
  CenterCodeResult,
  CenterOrganization,
} from '@/services/CenterService';

type Props = {
  info: Extract<CenterCodeResult, { ok: true }>;
  /** Пришёл по ссылке — шага кода не было */
  viaLink: boolean;
  /** Открыть доступ. Возвращает текст ошибки или null */
  onActivate: CenterActivateAction;
  onNotMine: () => void;
};

/** Логотип центра или первая буква названия. */
export function CenterLogo({ org, size }: { org: CenterOrganization; size: number }) {
  const colors = useThemeColors();
  const radius = Math.round(size * 0.28);
  if (org.logoUrl) {
    return (
      <Image
        source={{ uri: org.logoUrl }}
        style={{ width: size, height: size, borderRadius: radius }}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={[
        styles.letter,
        { width: size, height: size, borderRadius: radius, backgroundColor: colors.primaryFill },
      ]}
    >
      <Text variant="h1" style={{ color: colors.onPrimary, fontSize: size * 0.45 }}>
        {org.name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function CenterFoundScreen({ info, viaLink, onActivate, onNotMine }: Props) {
  const colors = useThemeColors();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const org = info.organization;
  const already = info.reason === 'already_active';
  const date = formatAccessDate(info.accessUntil);
  const days = daysLeft(info.accessUntil);

  return (
    <OnboardingStep
      step={viaLink ? undefined : 2}
      total={4}
      headline="Центр найден"
      description="Проверь, что это твой учебный центр."
      footer={
        <>
          {error ? (
            <Text variant="bodySmall" accessibilityRole="alert" style={{ color: colors.errorText }}>
              {error}
            </Text>
          ) : null}
          <Button
            title={already ? 'Открыть книги' : 'Выбрать книгу'}
            loading={activating}
            onPress={async () => {
              setActivating(true);
              setError(null);
              try {
                setError(await onActivate());
              } finally {
                setActivating(false);
              }
            }}
            fullWidth
          />
          <Button title="Это не мой центр" variant="quiet" onPress={onNotMine} fullWidth />
        </>
      }
    >
      <View style={styles.org}>
        <CenterLogo org={org} size={64} />
        <View style={styles.flex}>
          <Text variant="h3" style={{ color: colors.textPrimary }}>
            {org.name}
          </Text>
          {org.city ? (
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {org.city}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.access,
          { borderColor: colors.success, backgroundColor: alpha(colors.success, 10) },
        ]}
      >
        {already ? (
          <CheckCircle2 size={iconSize.m} color={colors.successText} />
        ) : (
          <BookOpen size={iconSize.m} color={colors.successText} />
        )}
        <View style={styles.flex}>
          <Text variant="bodyLarge" style={[styles.bold, { color: colors.textPrimary }]}>
            {already ? 'Доступ уже открыт' : 'Тебе открыт доступ к книгам курса'}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            {already
              ? `До ${date}. Место по коду второй раз не тратится.`
              : `До ${date} · ${days} ${pluralize(days, 'день', 'дня', 'дней')}`}
          </Text>
        </View>
      </View>

      <View style={[styles.note, { backgroundColor: colors.surfaceVariant }]}>
        <Info size={iconSize.s} color={colors.primary} />
        <Text variant="bodySmall" style={[styles.flex, { color: colors.textPrimary }]}>
          <Text variant="bodySmall" style={styles.bold}>
            Книгу и юнит выбираешь сам.{' '}
          </Text>
          Перевели в другую группу — просто смени книгу, менеджеру ничего делать не нужно.
        </Text>
      </View>

      {org.greeting ? (
        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
          {org.greeting}
        </Text>
      ) : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  org: { flexDirection: 'row', gap: spacing.m, alignItems: 'center' },
  letter: { alignItems: 'center', justifyContent: 'center' },
  access: {
    flexDirection: 'row',
    gap: spacing.s,
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: borderRadius.l,
    padding: spacing.m,
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
