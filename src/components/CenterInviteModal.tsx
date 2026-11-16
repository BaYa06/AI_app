/**
 * Ссылка учебного центра /join/<код> у уже вошедшего пользователя (plan/new/center_books.md,
 * Center 5): центр, срок доступа и «Получить доступ». Новый пользователь проходит тот же путь в
 * онбординге (экран «Центр найден»). Выбор книги после доступа — Center 6.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Dialog } from '@/components/ui';
import { useThemeColors } from '@/store';
import { iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { CenterService, type CenterCodeResult } from '@/services/CenterService';
import { daysLeft, describeCenterReason, formatAccessDate } from '@/utils/centerCode';
import { CenterLogo } from '@/screens/courseJoin/CenterFoundScreen';
import { Analytics } from '@/services/analytics';

type Props = {
  code: string | null;
  /** Доступ открыт: центр и до какого числа */
  onJoined: (info: Extract<CenterCodeResult, { ok: true }>) => void;
  onDismiss: () => void;
  /** Откуда: ссылка или боковое меню — для аналитики */
  via?: 'link' | 'menu';
};

export function CenterInviteModal({ code, onJoined, onDismiss, via = 'link' }: Props) {
  const colors = useThemeColors();
  const [info, setInfo] = useState<Extract<CenterCodeResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<Extract<CenterCodeResult, { ok: true }> | null>(null);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setError(null);
    CenterService.getInfo(code)
      .then((r) => {
        Analytics.orgCodeEntered(r.ok, r.reason);
        if (r.ok) setInfo(r);
        else setError(describeCenterReason(r.reason));
      })
      .finally(() => setLoading(false));
  }, [code]);

  const join = async () => {
    if (!code) return;
    setJoining(true);
    setError(null);
    const r = await CenterService.activate(code);
    setJoining(false);
    if (!r.ok) {
      setError(describeCenterReason(r.reason));
      return;
    }
    Analytics.orgJoined(via);
    setJoined(r);
  };

  if (!code) return null;
  const already = info?.reason === 'already_active';
  const days = daysLeft(info?.accessUntil);

  return (
    <Dialog
      visible
      onClose={onDismiss}
      title="Учебный центр"
      headerRight={
        <Button
          variant="icon"
          icon={X}
          background="none"
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel="Закрыть"
          onPress={onDismiss}
        />
      }
    >
      {joined ? (
        <View style={styles.body}>
          <Text variant="h3" style={{ color: colors.successText }}>
            Доступ открыт
          </Text>
          <Text variant="body" style={{ color: colors.textPrimary }}>
            Книги центра «{joined.organization.name}» доступны до{' '}
            {formatAccessDate(joined.accessUntil)}.
          </Text>
          <Button title="Хорошо" onPress={() => onJoined(joined)} fullWidth />
        </View>
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      ) : info ? (
        <View style={styles.body}>
          <View style={styles.org}>
            <CenterLogo org={info.organization} size={52} />
            <View style={styles.flex}>
              <Text variant="h3" style={{ color: colors.textPrimary }}>
                {info.organization.name}
              </Text>
              {info.organization.city ? (
                <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                  {info.organization.city}
                </Text>
              ) : null}
            </View>
          </View>
          <Text variant="body" style={{ color: colors.textPrimary }}>
            {already
              ? `Доступ к книгам уже открыт до ${formatAccessDate(info.accessUntil)}.`
              : `Тебе открыт доступ к книгам курса до ${formatAccessDate(info.accessUntil)} · ${days} ${pluralize(days, 'день', 'дня', 'дней')}.`}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Книгу и юнит выбираешь сам. Личные наборы и курсы учителя останутся как есть.
          </Text>
          {error ? (
            <Text variant="bodySmall" accessibilityRole="alert" style={{ color: colors.errorText }}>
              {error}
            </Text>
          ) : null}
          <Button
            title={already ? 'Открыть книги' : 'Получить доступ'}
            onPress={join}
            loading={joining}
            fullWidth
          />
          <Button title="Это не мой центр" variant="quiet" onPress={onDismiss} fullWidth />
        </View>
      ) : (
        <Text
          variant="body"
          align="center"
          accessibilityRole="alert"
          style={[styles.spinner, { color: colors.errorText }]}
        >
          {error}
        </Text>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: spacing.xl },
  body: { gap: spacing.s },
  org: { flexDirection: 'row', gap: spacing.s, alignItems: 'center' },
  flex: { flex: 1, gap: 2 },
});
