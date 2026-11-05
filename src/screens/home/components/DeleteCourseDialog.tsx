/**
 * Окно «Удалить курс» (с подтверждением, если в курсе есть наборы)
 * (Clean 8a — вынесено из HomeScreen без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { pluralize } from '@/utils';
import { Button, Dialog } from '@/components/ui';
import { Check } from 'lucide-react-native';
import { styles } from '../styles';

type Props = {
  deleteModalCourseId: string | null;
  closeDeleteModal: () => void;
  closeButton: (onPress: () => void, disabled?: boolean) => React.ReactNode;
  colors: ReturnType<typeof useThemeColors>;
  confirmDeleteCourse: () => void;
  deleteConfirmed: boolean;
  setDeleteConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
  deleteModalHasSets: boolean;
  deleteModalMessage: string;
  deleteModalStudents: number | null;
};

export function DeleteCourseDialog({
  deleteModalCourseId,
  closeDeleteModal,
  closeButton,
  colors,
  confirmDeleteCourse,
  deleteConfirmed,
  setDeleteConfirmed,
  deleteModalHasSets,
  deleteModalMessage,
  deleteModalStudents,
}: Props) {
  return (
    <Dialog
      visible={deleteModalCourseId !== null}
      onClose={closeDeleteModal}
      title="Удаление курса"
      headerRight={closeButton(closeDeleteModal)}
      footer={
        <View style={styles.dialogButtons}>
          <Button
            variant="quiet"
            tone="secondary"
            title="Отмена"
            onPress={closeDeleteModal}
            style={styles.flex1}
          />
          <Button
            variant="danger"
            filled
            title="Удалить"
            onPress={confirmDeleteCourse}
            disabled={deleteModalHasSets && !deleteConfirmed}
            style={styles.flex1}
          />
        </View>
      }
    >
      <Text variant="body" style={{ color: colors.textPrimary }}>
        {deleteModalMessage}
      </Text>
      {deleteModalHasSets && (
        <>
          {!!deleteModalStudents && (
            <Text
              variant="body"
              style={[styles.semibold, styles.dialogNote, { color: colors.warningText }]}
            >
              {`У ${deleteModalStudents} ${pluralize(deleteModalStudents, 'ученика', 'учеников', 'учеников')} пропадут наборы этого курса.`}
            </Text>
          )}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: deleteConfirmed }}
            onPress={() => {
              triggerHaptic('selection');
              setDeleteConfirmed((v) => !v);
            }}
            style={styles.deleteConfirmRow}
          >
            <View
              style={[
                styles.deleteConfirmBox,
                deleteConfirmed
                  ? { backgroundColor: colors.error, borderColor: colors.error }
                  : { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              {deleteConfirmed && <Check size={iconSize.xs} color={colors.onPrimary} />}
            </View>
            <Text variant="body" style={[styles.flex1, { color: colors.textPrimary }]}>
              Я понимаю, что наборы и прогресс удалятся навсегда
            </Text>
          </Pressable>
          <Text variant="bodySmall" style={[styles.dialogNote, { color: colors.textSecondary }]}>
            Хочешь сохранить набор? Сначала перенеси его в «Мои наборы».
          </Text>
        </>
      )}
    </Dialog>
  );
}
