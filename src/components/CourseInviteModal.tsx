/**
 * CourseInviteModal — модалка принятия приглашения в курс
 * Показывается когда ученик открывает ссылку /join/TOKEN
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Dialog } from '@/components/ui';
import { useThemeColors } from '@/store';
import { iconSize, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { describeTeacherApiReason } from '@/utils/teacherApiErrors';

interface CourseInviteModalProps {
  token: string | null;
  userId: string | null;
  onAccepted: (courseId: string, courseTitle: string) => void;
  onDismiss: () => void;
}

export function CourseInviteModal({ token, userId, onAccepted, onDismiss }: CourseInviteModalProps) {
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [info, setInfo] = useState<{
    courseId: string;
    courseTitle: string;
    teacherName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    NeonService.getCourseInviteInfo(token)
      .then((result) => {
        if (result.ok) {
          setInfo(result);
        } else {
          setError(describeTeacherApiReason(result.reason));
        }
      })
      .catch(() => setError(describeTeacherApiReason('network')))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    if (!token || !userId) return;
    setJoining(true);
    try {
      const result = await NeonService.joinCourseByToken(token, userId);
      if (result.ok) {
        onAccepted(result.courseId, result.courseTitle);
      } else {
        setError(describeTeacherApiReason(result.reason));
      }
    } catch {
      setError(describeTeacherApiReason('network'));
    } finally {
      setJoining(false);
    }
  };

  if (!token) return null;

  return (
    <Dialog
      visible
      onClose={onDismiss}
      title="Приглашение в курс"
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
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      ) : error ? (
        <Text variant="body" align="center" style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
      ) : info ? (
        <>
          <Text variant="h2" style={[styles.courseTitle, { color: colors.textPrimary }]}>
            {info.courseTitle}
          </Text>
          <Text variant="body" style={[styles.teacherName, { color: colors.textSecondary }]}>
            Учитель: {info.teacherName}
          </Text>
          <Text variant="bodySmall" style={[styles.description, { color: colors.textSecondary }]}>
            Тебя приглашают присоединиться к курсу и изучать материалы
          </Text>

          <View style={styles.buttons}>
            <Button variant="secondary" title="Отклонить" onPress={onDismiss} style={styles.button} />
            <Button title="Принять" onPress={handleJoin} loading={joining} style={styles.button} />
          </View>
        </>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  spinner: {
    marginVertical: spacing.xl,
  },
  courseTitle: {
    marginBottom: spacing.xs,
  },
  teacherName: {
    marginBottom: spacing.m,
  },
  description: {
    marginBottom: spacing.l,
  },
  errorText: {
    marginVertical: spacing.l,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  button: {
    flex: 1,
  },
});
