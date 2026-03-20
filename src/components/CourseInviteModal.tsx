/**
 * CourseInviteModal — модалка принятия приглашения в курс
 * Показывается когда ученик открывает ссылку /join/TOKEN
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { X } from 'lucide-react-native';

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
      .then((data) => {
        if (data) {
          setInfo(data);
        } else {
          setError('Приглашение не найдено или истекло');
        }
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    if (!token || !userId) return;
    setJoining(true);
    try {
      const result = await NeonService.joinCourseByToken(token, userId);
      if (result) {
        onAccepted(result.courseId, result.courseTitle);
      } else {
        setError('Не удалось присоединиться');
      }
    } catch {
      setError('Ошибка при присоединении');
    } finally {
      setJoining(false);
    }
  };

  if (!token) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={onDismiss}>
        <Pressable
          style={[styles.content, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Приглашение в курс
            </Text>
            <Pressable onPress={onDismiss}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: spacing.xl }} />
          ) : error ? (
            <Text style={[styles.errorText, { color: colors.error || '#EF4444' }]}>{error}</Text>
          ) : info ? (
            <>
              <Text style={[styles.courseTitle, { color: colors.textPrimary }]}>
                {info.courseTitle}
              </Text>
              <Text style={[styles.teacherName, { color: colors.textSecondary }]}>
                Учитель: {info.teacherName}
              </Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                Вас приглашают присоединиться к курсу и изучать материалы
              </Text>

              <View style={styles.buttons}>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.surfaceVariant || colors.border }]}
                  onPress={onDismiss}
                >
                  <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Отклонить</Text>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.buttonPrimary, { backgroundColor: colors.primary }]}
                  onPress={handleJoin}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Принять</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.l,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  courseTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  teacherName: {
    fontSize: 15,
    marginBottom: spacing.m,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.l,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
    marginVertical: spacing.l,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {},
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
