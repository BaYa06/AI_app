/**
 * JoinByCodeModal — модалка вступления в курс по короткому коду
 */
import React, { useState, useRef } from 'react';
import { View, StyleSheet, TextInput as RNTextInput } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Card, Dialog, TextField } from '@/components/ui';
import { useThemeColors } from '@/store';
import { iconSize, spacing, typography } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { describeTeacherApiReason } from '@/utils/teacherApiErrors';

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
      setError('Введи 6-значный код');
      return;
    }
    setLooking(true);
    setError(null);
    setInfo(null);
    try {
      const result = await NeonService.getCourseInviteInfoByCode(trimmed);
      if (result.ok) {
        setInfo(result);
      } else {
        setError(describeTeacherApiReason(result.reason));
      }
    } catch {
      setError(describeTeacherApiReason('network'));
    } finally {
      setLooking(false);
    }
  };

  const handleJoin = async () => {
    if (!info || !userId) return;
    setJoining(true);
    try {
      const result = await NeonService.joinCourseByCode(code.trim(), userId);
      if (result.ok) {
        reset();
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

  return (
    <Dialog
      visible={visible}
      onClose={handleDismiss}
      title="Войти по коду"
      headerRight={
        <Button
          variant="icon"
          icon={X}
          background="none"
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel="Закрыть"
          onPress={handleDismiss}
        />
      }
    >
      <Text variant="bodySmall" style={[styles.hint, { color: colors.textSecondary }]}>
        Введи 6-значный код от учителя
      </Text>

      {/* Код: ошибка — под полем (брендбук, 7.2) */}
      <TextField
        ref={inputRef}
        accessibilityLabel="Код курса"
        placeholder="000000"
        value={code}
        onChangeText={(v) => {
          setCode(v.replace(/\D/g, '').slice(0, 6));
          setInfo(null);
          setError(null);
        }}
        keyboardType="numeric"
        maxLength={6}
        onSubmitEditing={handleLookup}
        error={error}
        inputStyle={styles.codeInput}
        style={styles.field}
      />
      <Button title="Найти" onPress={handleLookup} loading={looking} fullWidth />

      {info && (
        <Card tone="muted" style={styles.courseCard}>
          <Text variant="h3" style={[styles.courseTitle, { color: colors.textPrimary }]}>{info.courseTitle}</Text>
          <Text variant="bodySmall" style={[styles.teacherName, { color: colors.textSecondary }]}>
            Учитель: {info.teacherName}
          </Text>

          <View style={styles.buttons}>
            <Button variant="secondary" title="Отклонить" onPress={handleDismiss} style={styles.button} />
            <Button title="Вступить" onPress={handleJoin} loading={joining} style={styles.button} />
          </View>
        </Card>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginBottom: spacing.m,
  },
  field: {
    marginBottom: spacing.s,
  },
  codeInput: {
    fontSize: typography.h2.fontSize,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  courseCard: {
    marginTop: spacing.m,
  },
  courseTitle: {
    fontWeight: '700',
    marginBottom: spacing.xxs,
  },
  teacherName: {
    marginBottom: spacing.m,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  button: {
    flex: 1,
  },
});
