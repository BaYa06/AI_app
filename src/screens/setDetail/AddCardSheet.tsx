/**
 * Быстрое добавление карточки в набор
 * (Clean 8 — вынесено из SetDetailScreen.tsx без изменений разметки.)
 */
import React from 'react';
import {
  View,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, iconSize, config } from '@/constants';
import { Camera } from 'lucide-react-native';
import { styles } from './styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  backdropColor: string;
  modalSurface: string;
  modalBorder: string;
  modalTextPrimary: string;
  modalTextSecondary: string;
  modalInputBg: string;
  modalPlaceholder: string;
  setShowAddCard: React.Dispatch<React.SetStateAction<boolean>>;
  handleCreateCard: () => void;
  isAdding: boolean;
  newFront: string;
  setNewFront: React.Dispatch<React.SetStateAction<string>>;
  newBack: string;
  setNewBack: React.Dispatch<React.SetStateAction<string>>;
  newExample: string;
  setNewExample: React.Dispatch<React.SetStateAction<string>>;
  navigation: any;
  setId: string;
};

export function AddCardSheet({
  colors,
  backdropColor,
  modalSurface,
  modalBorder,
  modalTextPrimary,
  modalTextSecondary,
  modalInputBg,
  modalPlaceholder,
  setShowAddCard,
  handleCreateCard,
  isAdding,
  newFront,
  setNewFront,
  newBack,
  setNewBack,
  newExample,
  setNewExample,
  navigation,
  setId,
}: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.sheetWrapper, { zIndex: 30 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      pointerEvents="box-none"
    >
      <Pressable
        style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
        onPress={() => setShowAddCard(false)}
      />
      <View
        style={[
          styles.addSheet,
          { backgroundColor: modalSurface, borderColor: modalBorder, maxHeight: '85%' },
        ]}
      >
        <View style={styles.addSheetHeader}>
          <Text variant="h3" style={{ color: modalTextPrimary }}>
            Новая карточка
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setShowAddCard(false);
              navigation.navigate('ImportFiles', { setId });
            }}
            style={[styles.exportButton, { backgroundColor: colors.primaryFill }]}
          >
            <Camera size={iconSize.xs} color={colors.onPrimary} />
            <Text variant="bodySmall" style={{ color: colors.onPrimary, fontWeight: '700' }}>
              Из фото или файла
            </Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.m, paddingBottom: spacing.s }}
        >
          <View style={styles.addField}>
            <Text variant="label" color="primary" style={styles.fieldLabel}>
              Иностранное слово
            </Text>
            <TextInput
              value={newFront}
              onChangeText={setNewFront}
              maxLength={config.limits.maxCardFrontLength}
              placeholder="Например: scharf"
              placeholderTextColor={modalPlaceholder}
              style={[
                styles.addInput,
                {
                  color: modalTextPrimary,
                  borderColor: modalBorder,
                  backgroundColor: modalInputBg,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                },
              ]}
            />
          </View>

          <View style={styles.addField}>
            <Text variant="label" color="primary" style={styles.fieldLabel}>
              Перевод
            </Text>
            <TextInput
              value={newBack}
              onChangeText={setNewBack}
              maxLength={config.limits.maxCardBackLength}
              placeholder="Например: острый"
              placeholderTextColor={modalPlaceholder}
              style={[
                styles.addInput,
                {
                  color: modalTextPrimary,
                  borderColor: modalBorder,
                  backgroundColor: modalInputBg,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                },
              ]}
            />
          </View>

          <View style={styles.addField}>
            <Text variant="label" color="primary" style={styles.fieldLabel}>
              Пример
            </Text>
            <TextInput
              value={newExample}
              onChangeText={setNewExample}
              maxLength={config.limits.maxCardExampleLength}
              placeholder="Например: Der scharfe Pfeffer..."
              placeholderTextColor={modalPlaceholder}
              style={[
                styles.addInput,
                {
                  color: modalTextPrimary,
                  borderColor: modalBorder,
                  backgroundColor: modalInputBg,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                },
              ]}
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.addActions}>
          <Pressable
            accessibilityRole="button"
            style={[styles.secondaryAction, { borderColor: modalBorder }]}
            onPress={() => setShowAddCard(false)}
          >
            <Text variant="body" style={{ color: modalTextSecondary, fontWeight: '700' }}>
              Отмена
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[
              styles.primaryAction,
              {
                backgroundColor:
                  newFront.trim() && newBack.trim() && !isAdding ? colors.primaryFill : modalBorder,
              },
            ]}
            disabled={!newFront.trim() || !newBack.trim() || isAdding}
            onPress={handleCreateCard}
          >
            <Text variant="body" style={{ color: colors.onPrimary, fontWeight: '700' }}>
              Сохранить
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
