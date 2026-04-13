/**
 * JoinByCodeModal — модалка вступления в курс по короткому коду
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput as RNTextInput,
  Platform,
} from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { X } from 'lucide-react-native';

interface JoinByCodeModalProps {
  visible: boolean;
  userId: string | null;
  onAccepted: (courseId: string, courseTitle: string) => void;
  onDismiss: () => void;
}

export function JoinByCodeModal({ visible, userId, onAccepted, onDismiss }: JoinByCodeModalProps) {
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [info, setInfo] = useState<{ courseId: string; courseTitle: string; teacherName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<RNTextInput>(null);

  const reset = () => {
    setCode('');
    setInfo(null);
    setError(null);
    setLooking(false);
    setJoining(false);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const handleLookup = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setError('Введите 6-значный код');
      return;
    }
    setLooking(true);
    setError(null);
    setInfo(null);
    try {
      const result = await NeonService.getCourseInviteInfoByCode(trimmed);
      if (result) {
        setInfo(result);
      } else {
        setError('Код не найден или истёк');
      }
    } catch {
      setError('Ошибка поиска');
    } finally {
      setLooking(false);
    }
  };

  const handleJoin = async () => {
    if (!info || !userId) return;
    setJoining(true);
    try {
      const result = await NeonService.joinCourseByCode(code.trim(), userId);
      if (result) {
        reset();
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={handleDismiss}>
        <Pressable
          style={[
            styles.content,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Войти по коду</Text>
            <Pressable onPress={handleDismiss}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Введите 6-значный код от учителя
          </Text>

          {/* Code input */}
          <View style={styles.inputRow}>
            <RNTextInput
              ref={inputRef}
              style={[
                styles.codeInput,
                {
                  backgroundColor: colors.surfaceVariant || colors.border,
                  borderColor: error ? (colors.error || '#EF4444') : colors.border,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/\D/g, '').slice(0, 6));
                setInfo(null);
                setError(null);
              }}
              keyboardType="numeric"
              maxLength={6}
              onSubmitEditing={handleLookup}
            />
          </View>
          <Pressable
            style={[styles.findButton, { backgroundColor: colors.primary }]}
            onPress={handleLookup}
            disabled={looking}
          >
            {looking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.findButtonText}>Найти</Text>
            )}
          </Pressable>

          {error && (
            <Text style={[styles.errorText, { color: colors.error || '#EF4444' }]}>{error}</Text>
          )}

          {info && (
            <View style={[styles.courseCard, { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.border }]}>
              <Text style={[styles.courseTitle, { color: colors.textPrimary }]}>{info.courseTitle}</Text>
              <Text style={[styles.teacherName, { color: colors.textSecondary }]}>Учитель: {info.teacherName}</Text>

              <View style={styles.buttons}>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={handleDismiss}
                >
                  <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Отклонить</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, { backgroundColor: colors.primary }]}
                  onPress={handleJoin}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.buttonText, { color: '#fff' }]}>Вступить</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
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
    marginBottom: spacing.s,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  hint: {
    fontSize: 14,
    marginBottom: spacing.m,
  },
  inputRow: {
    marginBottom: spacing.s,
  },
  codeInput: {
    height: 48,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  findButton: {
    height: 48,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  findButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  errorText: {
    fontSize: 14,
    marginBottom: spacing.s,
  },
  courseCard: {
    borderRadius: borderRadius.m,
    borderWidth: 1,
    padding: spacing.m,
    marginTop: spacing.s,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  teacherName: {
    fontSize: 14,
    marginBottom: spacing.m,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
