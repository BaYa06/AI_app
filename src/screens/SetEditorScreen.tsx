/**
 * Set Editor Screen
 * @description Экран создания/редактирования набора
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSetsStore, useCardsStore, useThemeColors, useSettingsStore } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import type { SetCategory } from '@/types';
import { ArrowLeftRight, ChevronDown, Lock, Unlock } from 'lucide-react-native';

type Props = RootStackScreenProps<'SetEditor'>;

const CATEGORY_OPTIONS: { value: SetCategory; label: string; icon: string }[] = [
  { value: 'general', label: 'Общие', icon: '⭐️' },
  { value: 'travel', label: 'Путешествия', icon: '✈️' },
  { value: 'food', label: 'Еда', icon: '🍽️' },
  { value: 'study', label: 'Учёба', icon: '📚' },
  { value: 'work', label: 'Работа', icon: '💼' },
  { value: 'grammar', label: 'Грамматика', icon: '✏️' },
  { value: 'custom', label: 'Свой вариант…', icon: '✨' },
];

const SOURCE_LANGUAGES = ['Немецкий (DE)', 'Английский (EN)'];
const TARGET_LANGUAGES = ['Русский (RU)', 'Украинский (UA)'];
const DESCRIPTION_LIMIT = 200;

export function SetEditorScreen({ navigation, route }: Props) {
  const { setId } = route.params || {};
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isEditing = !!setId;

  // Store
  const getSet = useSetsStore((s) => s.getSet);
  const addSet = useSetsStore((s) => s.addSet);
  const updateSet = useSetsStore((s) => s.updateSet);
  const deleteSet = useSetsStore((s) => s.deleteSet);
  const deleteCardsBySet = useCardsStore((s) => s.deleteCardsBySet);

  // Состояние формы
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SetCategory>('general');
  const [isPublic, setIsPublic] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState(SOURCE_LANGUAGES[0]);
  const [targetLanguage, setTargetLanguage] = useState(TARGET_LANGUAGES[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);

  // Загрузка данных для редактирования
  useEffect(() => {
    if (setId) {
      const set = getSet(setId);
      if (set) {
        setTitle(set.title);
        setDescription(set.description || '');
        setCategory(set.category);
        setIsPublic(!!set.isPublic);
      }
    }
  }, [setId, getSet]);

  const categoryOption = useMemo(
    () => CATEGORY_OPTIONS.find((c) => c.value === category),
    [category]
  );

  const isFormValid = !!title.trim();
  const titleError = showValidation && !title.trim();
  const isSaveDisabled = !isFormValid || isSaving;

  const cycleCategory = useCallback(() => {
    const index = CATEGORY_OPTIONS.findIndex((c) => c.value === category);
    const nextIndex = (index + 1) % CATEGORY_OPTIONS.length;
    setCategory(CATEGORY_OPTIONS[nextIndex].value);
  }, [category]);

  const cycleSourceLanguage = useCallback(() => {
    setSourceLanguage((current) => {
      const index = SOURCE_LANGUAGES.indexOf(current);
      const nextIndex = (index + 1) % SOURCE_LANGUAGES.length;
      return SOURCE_LANGUAGES[nextIndex];
    });
  }, []);

  const cycleTargetLanguage = useCallback(() => {
    setTargetLanguage((current) => {
      const index = TARGET_LANGUAGES.indexOf(current);
      const nextIndex = (index + 1) % TARGET_LANGUAGES.length;
      return TARGET_LANGUAGES[nextIndex];
    });
  }, []);

  const swapLanguages = useCallback(() => {
    setSourceLanguage((prevSource) => {
      setTargetLanguage(prevSource);
      return targetLanguage;
    });
  }, [targetLanguage]);

  // Сохранение
  const handleSave = useCallback(async () => {
    setShowValidation(true);

    if (!title.trim()) return;

    setIsSaving(true);

    try {
      const categoryData = CATEGORY_OPTIONS.find((c) => c.value === category);
      
      if (isEditing && setId) {
        updateSet(setId, {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          icon: categoryData?.icon,
          isPublic,
        });
      } else {
        const newSet = addSet({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          icon: categoryData?.icon,
          isPublic,
        });
        
        // Переход к новому набору
        navigation.replace('SetDetail', { setId: newSet.id });
        return;
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сохранить набор');
    } finally {
      setIsSaving(false);
    }
  }, [title, description, category, isPublic, isEditing, setId, updateSet, addSet, navigation]);

  // Удаление
  const handleDelete = useCallback(() => {
    if (!setId) return;

    Alert.alert(
      'Удалить набор?',
      'Все карточки в этом наборе также будут удалены. Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteCardsBySet(setId);
            deleteSet(setId);
            navigation.navigate('Main', { screen: 'Home' });
          },
        },
      ]
    );
  }, [setId, deleteCardsBySet, deleteSet, navigation]);

  return (
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <StatusBar
        translucent
        backgroundColor="rgba(0,0,0,0.25)"
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View style={styles.grabberContainer}>
            <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
          </View>

          <View style={styles.headerRow}>
            <Text variant="h2" style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {isEditing ? 'Редактировать набор' : 'Создать набор'}
            </Text>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Text
                variant="body"
                style={[styles.link, { color: colors.primary }]}
              >
                Отмена
              </Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {/* Название */}
            <View style={styles.field}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Название набора <Text style={{ color: colors.error }}>*</Text>
              </Text>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: titleError
                      ? colors.error
                      : titleFocused
                      ? colors.primary
                      : colors.border,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Например: Путешествия (A1)"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { color: colors.textPrimary, outlineStyle: 'none' }]}
                  onFocus={() => setTitleFocused(true)}
                  onBlur={() => setTitleFocused(false)}
                  maxLength={100}
                />
              </View>

              {titleError ? (
                <Text variant="caption" color="error" style={styles.helperText}>
                  Введите название
                </Text>
              ) : (
                <Text variant="caption" color="tertiary" style={styles.helperText}>
                  Название будет видно в каталоге
                </Text>
              )}
            </View>

            {/* Описание */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text variant="label" color="primary">
                  Описание
                </Text>
                <Text variant="caption" color="secondary">
                  {`${description.length}/${DESCRIPTION_LIMIT}`}
                </Text>
              </View>

              <View
                style={[
                  styles.textareaContainer,
                  {
                    backgroundColor: colors.surface,
                    borderColor: descriptionFocused ? colors.primary : colors.border,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Для каких тем/уровня и как использовать"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.textarea, { color: colors.textPrimary, outlineStyle: 'none' }]}
                  multiline
                  maxLength={DESCRIPTION_LIMIT}
                  onFocus={() => setDescriptionFocused(true)}
                  onBlur={() => setDescriptionFocused(false)}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Языки */}
            <View style={styles.field}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Языки
              </Text>
              <View style={styles.languageRow}>
                <SelectPill
                  label={sourceLanguage}
                  onPress={cycleSourceLanguage}
                  colors={colors}
                />
                <Pressable
                  onPress={swapLanguages}
                  style={[styles.swapButton, { backgroundColor: colors.surfaceVariant }]}
                >
                  <ArrowLeftRight size={18} color={colors.primary} />
                </Pressable>
                <SelectPill
                  label={targetLanguage}
                  onPress={cycleTargetLanguage}
                  colors={colors}
                />
              </View>
              <Text variant="caption" color="tertiary" style={styles.helperText}>
                Используется для импорта и тренировок
              </Text>
            </View>

            {/* Категория */}
            <View style={styles.field}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Категория
              </Text>
              <SelectPill
                label={categoryOption?.label || 'Другое'}
                onPress={cycleCategory}
                colors={colors}
              />
            </View>

            {/* Доступ */}
            <View style={styles.field}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Доступ
              </Text>
              <View
                style={[
                  styles.segmented,
                  { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                ]}
              >
                <Pressable
                  onPress={() => setIsPublic(false)}
                  style={[
                    styles.segmentButton,
                    !isPublic && { backgroundColor: colors.surface },
                  ]}
                >
                  <Lock size={16} color={isPublic ? colors.textSecondary : colors.textPrimary} />
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.segmentLabel,
                      { color: isPublic ? colors.textSecondary : colors.textPrimary },
                    ]}
                  >
                    Приватный
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsPublic(true)}
                  style={[
                    styles.segmentButton,
                    isPublic && { backgroundColor: colors.surface },
                  ]}
                >
                  <Unlock
                    size={16}
                    color={!isPublic ? colors.textSecondary : colors.textPrimary}
                  />
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.segmentLabel,
                      { color: !isPublic ? colors.textSecondary : colors.textPrimary },
                    ]}
                  >
                    Публичный
                  </Text>
                </Pressable>
              </View>
              <Text variant="caption" color="tertiary" style={styles.helperText}>
                Публичные наборы видны другим и могут быть использованы в каталоге
              </Text>
            </View>

            {isEditing && (
              <Pressable onPress={handleDelete} style={styles.deleteLink} disabled={isSaving}>
                <Text variant="bodySmall" style={{ color: colors.error, fontWeight: '600' }}>
                  Удалить набор
                </Text>
              </Pressable>
            )}
          </ScrollView>

          <View
            style={[
              styles.actions,
              { borderTopColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Pressable
              style={[
                styles.secondaryAction,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              onPress={() => navigation.goBack()}
              disabled={isSaving}
            >
              <Text variant="body" style={{ color: colors.textSecondary, fontWeight: '600' }}>
                Отмена
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.primaryAction,
                {
                  backgroundColor: isFormValid ? colors.primary : colors.border,
                  opacity: isSaveDisabled ? 0.75 : 1,
                },
              ]}
              onPress={handleSave}
              disabled={isSaveDisabled}
            >
              <Text
                variant="body"
                style={{
                  color: isSaveDisabled ? colors.textSecondary : '#ffffff',
                  fontWeight: '700',
                }}
              >
                Сохранить
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ====================

function SelectPill({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.select,
        { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow },
      ]}
    >
      <Text
        variant="bodySmall"
        style={[styles.selectLabel, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronDown size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

// ==================== СТИЛИ ====================

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '90%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
    borderWidth: 1,
  },
  grabberContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  grabber: {
    width: 50,
    height: 5,
    borderRadius: borderRadius.full,
    opacity: 0.5,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
  },
  headerTitle: {
    fontWeight: '700',
  },
  link: {
    fontWeight: '600',
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.l,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs / 2,
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    height: 56,
    justifyContent: 'center',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: {
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    marginTop: spacing.xs / 2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textareaContainer: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  textarea: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 96,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  swapButton: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s + 2,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    flex: 1,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  selectLabel: {
    fontWeight: '600',
  },
  deleteLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: borderRadius.l,
    padding: spacing.xs / 2,
    borderWidth: 1,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s,
    gap: spacing.xs,
    borderRadius: borderRadius.m,
  },
  segmentLabel: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.s,
    paddingHorizontal: spacing.s / 2,
    paddingBottom: spacing.l,
    paddingTop: spacing.m,
    borderTopWidth: 1,
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
  primaryAction: {
    flex: 1,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
});
