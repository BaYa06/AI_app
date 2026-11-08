/**
 * Окно «Переименовать курс»
 * (Clean 8a — вынесено из HomeScreen без изменений разметки.)
 */
import React from 'react';
import { View, TextInput as RNTextInput, Platform } from 'react-native';
import { Button, Dialog, TextField } from '@/components/ui';
import { Folder } from 'lucide-react-native';
import { styles } from '../styles';

type Props = {
  isEditModalVisible: boolean;
  cancelCourseEdit: () => void;
  closeButton: (onPress: () => void, disabled?: boolean) => React.ReactNode;
  editModalInputRef: React.RefObject<RNTextInput>;
  editingCourseId: string | null;
  editingTitle: string;
  setEditingTitle: React.Dispatch<React.SetStateAction<string>>;
  saveCourseTitle: (courseId: string) => void;
};

export function EditCourseDialog({
  isEditModalVisible,
  cancelCourseEdit,
  closeButton,
  editModalInputRef,
  editingCourseId,
  editingTitle,
  setEditingTitle,
  saveCourseTitle,
}: Props) {
  return (
    <Dialog
      visible={isEditModalVisible}
      onClose={cancelCourseEdit}
      title="Переименовать курс"
      headerRight={closeButton(cancelCourseEdit)}
      footer={
        <View style={styles.dialogButtons}>
          <Button
            variant="quiet"
            tone="secondary"
            title="Отмена"
            onPress={cancelCourseEdit}
            style={styles.flex1}
          />
          <Button
            title="Сохранить"
            onPress={() => editingCourseId && saveCourseTitle(editingCourseId)}
            style={styles.flex1}
          />
        </View>
      }
    >
      <TextField
        ref={editModalInputRef}
        icon={Folder}
        placeholder="Название курса..."
        value={editingTitle}
        onChangeText={setEditingTitle}
        onSubmitEditing={() => editingCourseId && saveCourseTitle(editingCourseId)}
        inputStyle={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
      />
    </Dialog>
  );
}
