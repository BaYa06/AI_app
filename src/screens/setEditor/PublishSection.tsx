/**
 * Секция «Публикация в библиотеку» в редакторе: форма, публикация, снятие
 * (Clean 8 — вынесено из SetEditorScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, alpha } from '@/constants';
import { Button, CategoryIcon } from '@/components/ui';
import { Globe } from 'lucide-react-native';
import { LIBRARY_CATEGORIES } from '@/constants/library';
import { styles } from './styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  isPublished: boolean;
  showPublishForm: boolean;
  setShowPublishForm: React.Dispatch<React.SetStateAction<boolean>>;
  publishCategory: string;
  setPublishCategory: React.Dispatch<React.SetStateAction<string>>;
  publishDescription: string;
  setPublishDescription: React.Dispatch<React.SetStateAction<string>>;
  publishTags: string;
  setPublishTags: React.Dispatch<React.SetStateAction<string>>;
  isPublishing: boolean;
  handlePublish: () => void;
  handleUnpublish: () => void;
};

export function PublishSection({
  colors,
  isPublished,
  showPublishForm,
  setShowPublishForm,
  publishCategory,
  setPublishCategory,
  publishDescription,
  setPublishDescription,
  publishTags,
  setPublishTags,
  isPublishing,
  handlePublish,
  handleUnpublish,
}: Props) {
  return (
    <View style={styles.field}>
      <Text variant="label" color="primary" style={styles.fieldLabel}>
        Библиотека
      </Text>

      {isPublished && !showPublishForm ? (
        <View style={{ gap: spacing.s }}>
          <View
            style={[
              styles.publishedBadge,
              {
                backgroundColor: alpha(colors.success, 10),
                borderColor: alpha(colors.success, 20),
              },
            ]}
          >
            <Globe size={16} color={colors.success} />
            <Text variant="bodySmall" style={{ color: colors.success, fontWeight: '600' }}>
              Опубликовано в библиотеке
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.s }}>
            <Pressable
              onPress={() => setShowPublishForm(true)}
              accessibilityRole="button"
              style={[styles.publishActionBtn, { borderColor: colors.primary }]}
            >
              <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>
                Обновить
              </Text>
            </Pressable>
            <Pressable
              onPress={handleUnpublish}
              accessibilityRole="button"
              style={[styles.publishActionBtn, { borderColor: alpha(colors.error, 40) }]}
            >
              <Text variant="bodySmall" style={{ color: colors.errorText, fontWeight: '600' }}>
                Снять
              </Text>
            </Pressable>
          </View>
        </View>
      ) : !showPublishForm ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowPublishForm(true)}
          style={[
            styles.publishButton,
            {
              backgroundColor: alpha(colors.primary, 10),
              borderColor: alpha(colors.primary, 20),
            },
          ]}
        >
          <Globe size={18} color={colors.primary} />
          <Text variant="body" style={{ color: colors.primary, fontWeight: '600' }}>
            Опубликовать в библиотеке
          </Text>
        </Pressable>
      ) : null}

      {showPublishForm && (
        <View
          style={[
            styles.publishForm,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TextInput
            value={publishDescription}
            onChangeText={setPublishDescription}
            placeholder="Описание для библиотеки (необязательно)"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.publishInput,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            multiline
            maxLength={500}
          />

          <Text variant="caption" color="secondary" style={{ marginTop: spacing.xs }}>
            Категория
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: spacing.xs }}
          >
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {LIBRARY_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  onPress={() => setPublishCategory(publishCategory === cat.key ? '' : cat.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: publishCategory === cat.key }}
                  style={[
                    styles.publishChip,
                    {
                      backgroundColor:
                        publishCategory === cat.key ? colors.primaryFill : colors.surfaceMuted,
                      borderColor:
                        publishCategory === cat.key ? colors.primaryFill : colors.surfaceMuted,
                    },
                  ]}
                >
                  {/* Раньше здесь выводилось имя иконки Ionicons текстом («text-outline») */}
                  <CategoryIcon
                    category={cat.key}
                    size="xs"
                    color={publishCategory === cat.key ? colors.onPrimary : colors.textSecondary}
                  />
                  <Text
                    variant="label"
                    style={{
                      color: publishCategory === cat.key ? colors.onPrimary : colors.textPrimary,
                    }}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <TextInput
            value={publishTags}
            onChangeText={setPublishTags}
            placeholder="Теги через запятую (необязательно)"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.publishInput,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.background,
                marginTop: spacing.s,
              },
            ]}
            maxLength={200}
          />

          <View style={styles.publishActions}>
            <Button
              variant="quiet"
              tone="secondary"
              size="s"
              title="Отмена"
              onPress={() => setShowPublishForm(false)}
              style={styles.flex1}
            />
            <Button
              size="s"
              title={isPublishing ? 'Публикация...' : isPublished ? 'Обновить' : 'Опубликовать'}
              onPress={handlePublish}
              disabled={isPublishing}
              style={styles.flex1}
            />
          </View>
        </View>
      )}

      <Text variant="caption" color="tertiary" style={styles.helperText}>
        Опубликованные наборы доступны всем пользователям
      </Text>
    </View>
  );
}
