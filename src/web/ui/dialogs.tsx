/**
 * Окна подтверждения кабинета. Системный window.confirm не годится (DESIGN.md: «в окне подтверждения —
 * заливка error»): рискованное действие — отдельное окно, кнопка действия справа, «Отмена» слева.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Dialog } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/common/Text';
import { TextField } from '@/components/ui/TextField';
import { spacing } from '@/constants';
import { titleMatches } from '../teacherLogic';

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText,
  destructive,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmText: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s }}>
          <Button
            variant="quiet"
            tone="secondary"
            title="Отмена"
            onPress={onClose}
            disabled={busy}
          />
          <Button
            variant={destructive ? 'danger' : 'primary'}
            filled={destructive}
            title={confirmText}
            onPress={onConfirm}
            loading={busy}
          />
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.m, gap: spacing.s }}>
        {message ? (
          <Text variant="body" color="secondary">
            {message}
          </Text>
        ) : null}
        {children}
        {error ? (
          <Text variant="bodySmall" color="error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}

/** Удаление с вводом названия: кнопка включается, только когда название введено верно */
export function TypeToConfirmDialog({
  visible,
  title,
  message,
  expected,
  confirmText,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  message: string;
  expected: string;
  confirmText: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const ok = titleMatches(typed, expected);
  return (
    <Dialog
      visible={visible}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s }}>
          <Button
            variant="quiet"
            tone="secondary"
            title="Отмена"
            onPress={onClose}
            disabled={busy}
          />
          <Button
            variant="danger"
            filled
            title={confirmText}
            onPress={onConfirm}
            loading={busy}
            disabled={!ok}
          />
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.m, gap: spacing.s }}>
        <Text variant="body" color="secondary">
          {message}
        </Text>
        {children}
        <TextField
          label={`Введи название курса: ${expected}`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Название курса для подтверждения"
        />
        {error ? (
          <Text variant="bodySmall" color="error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </View>
    </Dialog>
  );
}
