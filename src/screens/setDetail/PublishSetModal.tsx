/**
 * Публикация набора в библиотеку: категория, описание, теги
 * (Clean 8 — вынесено из SetDetailScreen.tsx без изменений разметки.)
 */
import React from 'react';
import {
  View,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, iconSize } from '@/constants';
import { LIBRARY_CATEGORIES } from '@/constants/library';
import { Globe, X } from 'lucide-react-native';
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
  setShowPublishModal: React.Dispatch<React.SetStateAction<boolean>>;
  handlePublish: () => void;
  isPublishing: boolean;
  publishCategory: string;
  setPublishCategory: React.Dispatch<React.SetStateAction<string>>;
  publishDescription: string;
  setPublishDescription: React.Dispatch<React.SetStateAction<string>>;
  publishTags: string;
  setPublishTags: React.Dispatch<React.SetStateAction<string>>;
};

export function PublishSetModal({
  colors,
  backdropColor,
  modalSurface,
  modalBorder,
  modalTextPrimary,
  modalTextSecondary,
  modalInputBg,
  modalPlaceholder,
  setShowPublishModal,
  handlePublish,
  isPublishing,
  publishCategory,
  setPublishCategory,
  publishDescription,
  setPublishDescription,
  publishTags,
  setPublishTags,
}: Props) {
  return (
    <View
      style={[styles.importOverlay, { backgroundColor: backdropColor }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
        onPress={() => !isPublishing && setShowPublishModal(false)}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ width: '100%', maxWidth: 480, alignItems: 'center' }}
      >
        <View
          style={[styles.importCard, { backgroundColor: modalSurface, borderColor: modalBorder }]}
        >
          <View style={styles.importTopBar}>
            <Pressable
              onPress={() => !isPublishing && setShowPublishModal(false)}
              hitSlop={10}
              style={styles.topIcon}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
            >
              <X size={iconSize.m} color={modalTextPrimary} />
            </Pressable>
            <Text variant="body" style={[styles.importTitle, { color: modalTextPrimary }]}>
              Опубликовать в библиотеке
            </Text>
            <View style={styles.topIcon} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.m, paddingBottom: spacing.s }}
          >
            <View style={styles.addField}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Описание (необязательно)
              </Text>
              <TextInput
                value={publishDescription}
                onChangeText={setPublishDescription}
                placeholder="Расскажи о наборе..."
                placeholderTextColor={modalPlaceholder}
                maxLength={500}
                multiline
                style={[
                  styles.addInput,
                  {
                    color: modalTextPrimary,
                    borderColor: modalBorder,
                    backgroundColor: modalInputBg,
                    minHeight: 80,
                    textAlignVertical: 'top',
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                  },
                ]}
              />
              <Text variant="caption" color="secondary" style={{ alignSelf: 'flex-end' }}>
                {publishDescription.length}/500
              </Text>
            </View>

            <View style={styles.addField}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Категория *
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {LIBRARY_CATEGORIES.map((cat) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: publishCategory === cat.key }}
                    key={cat.key}
                    onPress={() => setPublishCategory(cat.key)}
                    style={[
                      styles.wordChip,
                      {
                        backgroundColor:
                          publishCategory === cat.key ? colors.primaryFill : 'transparent',
                        borderColor: publishCategory === cat.key ? colors.primaryFill : modalBorder,
                      },
                    ]}
                  >
                    <Text
                      variant="caption"
                      style={{
                        color: publishCategory === cat.key ? colors.onPrimary : modalTextSecondary,
                        fontWeight: '700',
                      }}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.addField}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Теги (через запятую)
              </Text>
              <TextInput
                value={publishTags}
                onChangeText={setPublishTags}
                placeholder="например: A1, начинающим, еда"
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
          </ScrollView>

          <View style={styles.addActions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.secondaryAction, { borderColor: modalBorder }]}
              onPress={() => !isPublishing && setShowPublishModal(false)}
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
                    publishCategory && !isPublishing ? colors.primaryFill : modalBorder,
                  flexDirection: 'row',
                  gap: spacing.xs,
                },
              ]}
              disabled={!publishCategory || isPublishing}
              onPress={handlePublish}
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <>
                  <Globe size={18} color={colors.onPrimary} />
                  <Text variant="body" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                    Опубликовать
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
