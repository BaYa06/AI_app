/**
 * Ссылка для учителей учебного центра flashlycards.app/t/<код> (plan/new/center_books.md,
 * Center 13): «Alfa English Center приглашает тебя учителем». Учитель по ссылке получает доступ
 * сразу, без подтверждения центром. После — книги центра отдельной полкой в «Библиотеке».
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Dialog } from '@/components/ui';
import { useThemeColors } from '@/store';
import { iconSize, spacing } from '@/constants';
import { CenterService, type TeacherInviteResult } from '@/services/CenterService';
import { CenterLogo } from '@/screens/courseJoin/CenterFoundScreen';
import { Analytics } from '@/services/analytics';

type Invite = Extract<TeacherInviteResult, { ok: true }>;

type Props = {
  token: string | null;
  /** Стал учителем центра (или уже был): открыть книги центра */
  onJoined: (info: Invite) => void;
  onDismiss: () => void;
};

function describeReason(reason: Extract<TeacherInviteResult, { ok: false }>['reason']): string {
  if (reason === 'not_found') return 'Ссылка больше не работает. Попроси у учебного центра новую.';
  if (reason === 'contract_ended') return 'У учебного центра закончился договор с Flashly.';
  if (reason === 'network') return 'Нет связи. Проверь интернет и попробуй ещё раз.';
  return 'Не получилось открыть приглашение. Попробуй ещё раз.';
}

export function TeacherInviteModal({ token, onJoined, onDismiss }: Props) {
  const colors = useThemeColors();
  const [info, setInfo] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<Invite | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    CenterService.getTeacherInvite(token)
      .then((r) => {
        if (r.ok) setInfo(r);
        else setError(describeReason(r.reason));
      })
      .finally(() => setLoading(false));
  }, [token]);

  const join = async () => {
    if (!token) return;
    setJoining(true);
    setError(null);
    const r = await CenterService.joinAsTeacher(token);
    setJoining(false);
    if (!r.ok) {
      setError(describeReason(r.reason));
      return;
    }
    Analytics.orgTeacherJoined();
    setJoined(r);
  };

  if (!token) return null;
  const name = info?.organization.name ?? '';

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
            Ты учитель центра
          </Text>
          <Text variant="body" style={{ color: colors.textPrimary }}>
            Книги «{joined.organization.name}» — в «Библиотеке», отдельной полкой. Подключай их к
            своим группам, как обычные учебники.
          </Text>
          <Button title="Открыть книги" onPress={() => onJoined(joined)} fullWidth />
        </View>
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      ) : info ? (
        <View style={styles.body}>
          <View style={styles.org}>
            <CenterLogo org={info.organization} size={52} />
            <View style={styles.flex}>
              <Text variant="h3" style={{ color: colors.textPrimary }}>
                {name}
              </Text>
              {info.organization.city ? (
                <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                  {info.organization.city}
                </Text>
              ) : null}
            </View>
          </View>
          <Text variant="body" style={{ color: colors.textPrimary }}>
            {info.alreadyMember
              ? `Ты уже учитель центра «${name}».`
              : `«${name}» приглашает тебя учителем.`}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Книги центра появятся в «Библиотеке» отдельной полкой. Подключай их к своим группам, как
            обычные учебники.
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Центр увидит твоё имя и почту, твои группы с книгами центра и сколько в них учеников.
            Личные наборы центр не видит.
          </Text>
          {error ? (
            <Text variant="bodySmall" accessibilityRole="alert" style={{ color: colors.errorText }}>
              {error}
            </Text>
          ) : null}
          {info.alreadyMember ? (
            <Button title="Открыть книги" onPress={() => onJoined(info)} fullWidth />
          ) : (
            <Button title="Стать учителем центра" onPress={join} loading={joining} fullWidth />
          )}
          <Button title="Отмена" variant="quiet" onPress={onDismiss} fullWidth />
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
