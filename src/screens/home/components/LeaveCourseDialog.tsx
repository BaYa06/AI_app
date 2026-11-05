/**
 * Окно «Выйти из курса» (ученик)
 * (Clean 8a — вынесено из HomeScreen без изменений разметки.)
 */
import React from 'react';
import { View } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Dialog } from '@/components/ui';
import { styles } from '../styles';

type Props = {
  leaveModalCourseId: string | null;
  setLeaveModalCourseId: React.Dispatch<React.SetStateAction<string | null>>;
  closeButton: (onPress: () => void, disabled?: boolean) => React.ReactNode;
  colors: ReturnType<typeof useThemeColors>;
  handleLeaveCourse: () => void;
  leaveLoading: boolean;
  leaveModalCourseTitle: string;
};

export function LeaveCourseDialog({
  leaveModalCourseId,
  setLeaveModalCourseId,
  closeButton,
  colors,
  handleLeaveCourse,
  leaveLoading,
  leaveModalCourseTitle,
}: Props) {
  return (
    <Dialog
      visible={leaveModalCourseId !== null}
      onClose={() => !leaveLoading && setLeaveModalCourseId(null)}
      title="Выйти из курса?"
      headerRight={closeButton(() => setLeaveModalCourseId(null), leaveLoading)}
      footer={
        <View style={styles.dialogButtons}>
          <Button
            variant="quiet"
            tone="secondary"
            title="Отмена"
            onPress={() => setLeaveModalCourseId(null)}
            disabled={leaveLoading}
            style={styles.flex1}
          />
          <Button
            variant="danger"
            filled
            title="Выйти"
            onPress={handleLeaveCourse}
            loading={leaveLoading}
            style={styles.flex1}
          />
        </View>
      }
    >
      <Text variant="body" style={{ color: colors.textPrimary }}>
        {`Ты покинешь курс "${leaveModalCourseTitle}" и потеряешь доступ ко всем его материалам.`}
      </Text>
    </Dialog>
  );
}
