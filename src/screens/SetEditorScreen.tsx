/**
 * Set Editor Screen
 * @description Экран создания/редактирования набора
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  StatusBar,
  Alert,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { useSetsStore, useCardsStore, useThemeColors, useSettingsStore, useCoursesStore } from '@/store';
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
const TARGET_LANGUAGES = ['Русский (RU)'];
const DESCRIPTION_LIMIT = 200;

export function SetEditorScreen({ navigation, route }: Props) {
  const { setId, autoFocusTitle } = route.params || {};
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isEditing = !!setId;
  const screenHeight = Dimensions.get('window').height;
  const hiddenOffset = Math.min(screenHeight, 720);
  const sheetTranslate = useRef(new Animated.Value(hiddenOffset)).current;
  const titleInputRef = useRef<TextInput>(null);

  // Store
  const getSet = useSetsStore((s) => s.getSet);
  const addSet = useSetsStore((s) => s.addSet);
  const updateSet = useSetsStore((s) => s.updateSet);
  const deleteSet = useSetsStore((s) => s.deleteSet);
  const deleteCardsBySet = useCardsStore((s) => s.deleteCardsBySet);
  
  // Courses store - для назначения courseId при создании набора
  const activeCourseId = useCoursesStore((s) => s.activeCourseId);
  const courses = useCoursesStore((s) => s.courses);

  // Состояние формы
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SetCategory>('general');
  const [courseId, setCourseId] = useState<string | null>(activeCourseId ?? null);
  const [isPublic, setIsPublic] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState(SOURCE_LANGUAGES[0]);
  const [targetLanguage, setTargetLanguage] = useState(TARGET_LANGUAGES[0]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
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
        setCourseId(set.courseId ?? null);
        // Публичные наборы временно недоступны
        setIsPublic(false);
      }
    }
  }, [setId, getSet]);

  // Автофокус на названии при открытии по запросу
  useEffect(() => {
    if (autoFocusTitle) {
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [autoFocusTitle]);

  const categoryOption = useMemo(
    () => CATEGORY_OPTIONS.find((c) => c.value === category),
    [category]
  );

  const selectedCourseTitle = useMemo(() => {
    if (!courseId) return 'Без курса';
    return courses.find((c) => c.id === courseId)?.title || 'Без курса';
  }, [courseId, courses]);

  const isFormValid = !!title.trim();
  const titleError = showValidation && !title.trim();
  const isSaveDisabled = !isFormValid || isSaving;

  const toggleCoursePicker = useCallback(() => {
    setCoursePickerOpen((open) => !open);
    setSourcePickerOpen(false);
    setTargetPickerOpen(false);
  }, []);

  const toggleSourcePicker = useCallback(() => {
    setSourcePickerOpen((open) => !open);
    setTargetPickerOpen(false);
    setCoursePickerOpen(false);
  }, []);

  const toggleTargetPicker = useCallback(() => {
    setTargetPickerOpen((open) => !open);
    setSourcePickerOpen(false);
    setCoursePickerOpen(false);
  }, []);

  const handleSelectSourceLanguage = useCallback((lang: string) => {
    setSourceLanguage(lang);
    setSourcePickerOpen(false);
  }, []);

  const handleSelectTargetLanguage = useCallback((lang: string) => {
    setTargetLanguage(lang);
    setTargetPickerOpen(false);
  }, []);

  const swapLanguages = useCallback(() => {
    setSourceLanguage((prevSource) => {
      // Переключаем, но целевой язык остаётся среди доступных целей
      const newTarget = prevSource;
      setTargetLanguage(TARGET_LANGUAGES.includes(newTarget) ? newTarget : TARGET_LANGUAGES[0]);
      return targetLanguage;
    });
    setSourcePickerOpen(false);
    setTargetPickerOpen(false);
  }, [targetLanguage]);

  // Анимация появления/скрытия модального шита
  useEffect(() => {
    Animated.timing(sheetTranslate, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [sheetTranslate]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetTranslate, {
      toValue: hiddenOffset,
      duration: 180,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        navigation.goBack();
      }
    });
  }, [hiddenOffset, navigation, sheetTranslate]);

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
          courseId,
        });
      } else {
        // Создаем набор с courseId из активного курса
        const newSet = await addSet({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          icon: categoryData?.icon,
          isPublic,
          courseId, // выбранный курс (может быть null)
        });
        
        // Переход к новому набору
        navigation.replace('SetDetail', { setId: newSet.id });
        return;
      }

      closeSheet();
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сохранить набор');
    } finally {
      setIsSaving(false);
    }
  }, [title, description, category, isPublic, isEditing, setId, updateSet, addSet, navigation, closeSheet, courseId]);

  // Удаление
  const handleDelete = useCallback(() => {
    if (!setId) return;

    const performDelete = () => {
      console.log('Удаление набора:', setId);
      deleteCardsBySet(setId);
      deleteSet(setId);
      navigation.navigate('Main', { screen: 'Home' });
    };

    if (Platform.OS === 'web') {
      // Для веба используем window.confirm
      const confirmed = window.confirm(
        'Удалить набор?\n\nВсе карточки в этом наборе также будут удалены. Это действие нельзя отменить.'
      );
      if (confirmed) {
        performDelete();
      }
    } else {
      // Для нативных платформ используем Alert
      Alert.alert(
        'Удалить набор?',
        'Все карточки в этом наборе также будут удалены. Это действие нельзя отменить.',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Удалить',
            style: 'destructive',
            onPress: performDelete,
          },
        ]
      );
    }
  }, [setId, deleteCardsBySet, deleteSet, navigation]);

  return (
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <StatusBar
        translucent
        backgroundColor="rgba(0,0,0,0.25)"
        barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={styles.safeArea}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              shadowColor: colors.shadow,
            },
            { transform: [{ translateY: sheetTranslate }] },
          ]}
        >
          <View style={styles.grabberContainer}>
            <View style={[styles.grabber, { backgroundColor: colors.textTertiary }]} />
          </View>

          <View style={styles.headerRow}>
            <Text variant="h2" style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {isEditing ? 'Редактировать набор' : 'Создать набор'}
            </Text>
            <Pressable onPress={closeSheet} hitSlop={8}>
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
                  ref={titleInputRef}
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
                <View style={styles.languageSelectWrapper}>
                  <SelectPill
                    label={sourceLanguage}
                    onPress={toggleSourcePicker}
                    isOpen={sourcePickerOpen}
                    colors={colors}
                  />
                  {sourcePickerOpen && (
                    <LanguageDropdown
                      options={SOURCE_LANGUAGES}
                      selected={sourceLanguage}
                      onSelect={handleSelectSourceLanguage}
                      colors={colors}
                    />
                  )}
                </View>

                <Pressable
                  onPress={swapLanguages}
                  style={[styles.swapButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <ArrowLeftRight size={20} color={colors.primary} />
                </Pressable>

                <View style={styles.languageSelectWrapper}>
                  <SelectPill
                    label={targetLanguage}
                    onPress={toggleTargetPicker}
                    isOpen={targetPickerOpen}
                    colors={colors}
                  />
                  {targetPickerOpen && (
                    <LanguageDropdown
                      options={TARGET_LANGUAGES}
                      selected={targetLanguage}
                      onSelect={handleSelectTargetLanguage}
                      colors={colors}
                    />
                  )}
                </View>
              </View>
              <Text variant="caption" color="tertiary" style={styles.helperText}>
                Выберите язык источника и язык перевода
              </Text>
            </View>

            {/* Курс */}
            <View style={styles.field}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Курс
              </Text>
              <View style={styles.courseSelectContainer}>
                <SelectPill
                  label={selectedCourseTitle}
                  onPress={toggleCoursePicker}
                  isOpen={coursePickerOpen}
                  colors={colors}
                  fullWidth
                />
                {coursePickerOpen && (
                  <CourseDropdown
                    courses={courses}
                    selectedCourseId={courseId}
                    onSelect={(value) => {
                      setCourseId(value);
                      setCoursePickerOpen(false);
                      setSourcePickerOpen(false);
                      setTargetPickerOpen(false);
                    }}
                    colors={colors}
                  />
                )}
              </View>
              <Text variant="caption" color="tertiary" style={styles.helperText}>
                Организуйте наборы по курсам для удобного управления
              </Text>
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
                  disabled
                  style={[
                    styles.segmentButton,
                    { opacity: 0.45 },
                  ]}
                >
                  <Unlock
                    size={16}
                    color={colors.textSecondary}
                  />
                  <Text
                    variant="bodySmall"
                    style={[
                      styles.segmentLabel,
                      { color: colors.textSecondary },
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
              <Pressable 
                onPress={handleDelete} 
                style={styles.deleteLink} 
                disabled={isSaving}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text variant="bodySmall" style={{ color: colors.error, fontWeight: '600' }}>
                  Удалить набор
                </Text>
              </Pressable>
            )}
          </ScrollView>

          <View
            style={[
              styles.actions,
              { borderTopColor: colors.border, backgroundColor: 'transparent' },
            ]}
          >
            <Pressable
              style={[
                styles.secondaryAction,
                { borderColor: colors.border },
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
        </Animated.View>
      </View>
    </View>
  );
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ====================

function SelectPill({
  label,
  onPress,
  colors,
  isOpen = false,
  fullWidth = false,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  isOpen?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.select,
        fullWidth && styles.selectFullWidth,
        {
          backgroundColor: colors.surface,
          borderColor: isOpen ? colors.primary : colors.border,
          shadowColor: colors.shadow
        },
      ]}
    >
      <Text
        variant="bodySmall"
        style={[styles.selectLabel, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronDown
        size={18}
        color={isOpen ? colors.primary : colors.textSecondary}
        style={[
          { transition: 'transform 0.2s ease' },
          isOpen ? { transform: [{ rotate: '180deg' }] } : undefined,
        ]}
      />
    </Pressable>
  );
}

function LanguageDropdown({
  options,
  selected,
  onSelect,
  colors,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[
        styles.languageDropdown,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <ScrollView
        style={styles.languageDropdownScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {options.map((option, index) => {
          const isActive = option === selected;
          const isFirst = index === 0;
          const isLast = index === options.length - 1;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [
                styles.languageDropdownOption,
                {
                  backgroundColor: pressed && !isActive
                    ? colors.surfaceVariant
                    : isActive
                    ? colors.primary + '12'
                    : colors.surface,
                  borderBottomColor: colors.border,
                },
                isFirst && styles.languageDropdownOptionFirst,
                isLast && styles.languageDropdownOptionLast,
              ]}
            >
              <Text
                variant="body"
                style={{
                  color: isActive ? colors.primary : colors.textPrimary,
                  fontWeight: isActive ? '700' : '600',
                  fontSize: 15,
                }}
              >
                {option}
              </Text>
              {isActive && (
                <View style={[styles.checkmark, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CategoryDropdown({
  options,
  selected,
  onSelect,
  colors,
}: {
  options: typeof CATEGORY_OPTIONS;
  selected: SetCategory;
  onSelect: (value: SetCategory) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[
        styles.dropdown,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      {options.map((option) => {
        const isActive = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[
              styles.dropdownOption,
              isActive && { backgroundColor: colors.surfaceVariant },
            ]}
          >
            <Text
              variant="body"
              style={{
                color: isActive ? colors.primary : colors.textPrimary,
                fontWeight: isActive ? '700' : '600',
              }}
            >
              {`${option.icon} ${option.label}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CourseDropdown({
  courses,
  selectedCourseId,
  onSelect,
  colors,
}: {
  courses: Array<{ id: string; title: string }>;
  selectedCourseId: string | null;
  onSelect: (value: string | null) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const items = [{ id: null, title: 'Без курса' }, ...courses];

  return (
    <View
      style={[
        styles.courseDropdown,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <ScrollView
        style={styles.courseDropdownScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {items.map((course, index) => {
          const isActive = course.id === selectedCourseId;
          const isFirst = index === 0;
          const isLast = index === items.length - 1;
          return (
            <Pressable
              key={course.id ?? 'none'}
              onPress={() => onSelect(course.id)}
              style={({ pressed }) => [
                styles.courseDropdownOption,
                {
                  backgroundColor: pressed && !isActive
                    ? colors.surfaceVariant
                    : isActive
                    ? colors.primary + '12'
                    : colors.surface,
                  borderBottomColor: colors.border,
                },
                isFirst && styles.courseDropdownOptionFirst,
                isLast && styles.courseDropdownOptionLast,
              ]}
            >
              <Text
                variant="body"
                style={{
                  color: isActive ? colors.primary : colors.textPrimary,
                  fontWeight: isActive ? '700' : '600',
                  fontSize: 15,
                }}
              >
                {course.title}
              </Text>
              {isActive && (
                <View style={[styles.checkmark, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
    alignItems: 'flex-start',
    gap: spacing.s,
    zIndex: 20,
  },
  languageSelectWrapper: {
    flex: 1,
    position: 'relative',
    zIndex: 10,
  },
  swapButton: {
    width: 48,
    height: 52,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    flexShrink: 0,
  },
  languageDropdown: {
    marginTop: spacing.xs,
    borderWidth: 1.5,
    borderRadius: borderRadius.l,
    maxHeight: 280,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: 'hidden',
    zIndex: 100,
    position: 'relative',
  },
  languageDropdownScroll: {
    maxHeight: 280,
  },
  languageDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
  },
  languageDropdownOptionFirst: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
  },
  languageDropdownOptionLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: borderRadius.l,
    borderBottomRightRadius: borderRadius.l,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s + 2,
    borderWidth: 1.5,
    borderRadius: borderRadius.l,
    flex: 1,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minHeight: 52,
    position: 'relative',
    zIndex: 1,
  },
  selectFullWidth: {
    width: '100%',
    flex: undefined,
  },
  selectLabel: {
    fontWeight: '600',
    flex: 1,
  },
  dropdown: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    minWidth: '48%',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dropdownOption: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  courseSelectContainer: {
    position: 'relative',
    width: '100%',
    zIndex: 10,
    marginBottom: spacing.s,
  },
  courseDropdown: {
    marginTop: spacing.xs,
    borderWidth: 1.5,
    borderRadius: borderRadius.l,
    maxHeight: 280,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: 'hidden',
    zIndex: 100,
    position: 'relative',
  },
  courseDropdownScroll: {
    maxHeight: 280,
  },
  courseDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
  },
  courseDropdownOptionFirst: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
  },
  courseDropdownOptionLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: borderRadius.l,
    borderBottomRightRadius: borderRadius.l,
  },
  checkmark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
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
