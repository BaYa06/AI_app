/**
 * Card Editor Screen
 * @description Экран создания/редактирования карточки
 */
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useCardsStore, useSetsStore, useThemeColors } from '@/store';
import { Container, Text } from '@/components/common';
import { spacing } from '@/constants';
import { Button, ScreenHeader, TextField, confirmDialog, toast } from '@/components/ui';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'CardEditor'>;

export function CardEditorScreen({ navigation, route }: Props) {
  const { setId, cardId } = route.params;
  const colors = useThemeColors();
  const isEditing = !!cardId;

  // Store
  const getCard = useCardsStore((s) => s.getCard);
  const addCard = useCardsStore((s) => s.addCard);
  const updateCard = useCardsStore((s) => s.updateCard);
  const deleteCard = useCardsStore((s) => s.deleteCard);
  const incrementCardCount = useSetsStore((s) => s.incrementCardCount);
  const decrementCardCount = useSetsStore((s) => s.decrementCardCount);
  const getSet = useSetsStore((s) => s.getSet);

  // Состояние формы
  const [frontText, setFrontText] = useState('');
  const [backText, setBackText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const cardSet = getSet(setId);

  // Блокируем редактирование read-only наборов (курсы учителя)
  useEffect(() => {
    if (cardSet?.isReadOnly) {
      toast.info('Только чтение: этот набор создан учителем');
      navigation.goBack();
    }
  }, [cardSet?.isReadOnly, navigation]);

  // Загрузка данных для редактирования
  useEffect(() => {
    if (cardId) {
      const card = getCard(cardId);
      if (card) {
        setFrontText(card.frontText ?? (card as any).front ?? '');
        setBackText(card.backText ?? (card as any).back ?? '');
      }
    }
  }, [cardId, getCard]);

  const languageLabelMap: Record<string, string> = {
    de: 'немецком',
    en: 'английском',
    ru: 'русском',
  };

  const sourceLabel = cardSet?.languageFrom
    ? `Слово на ${languageLabelMap[cardSet.languageFrom] || cardSet.languageFrom}`
    : 'Иностранное слово';
  const targetLabel = cardSet?.languageTo
    ? `Перевод на ${languageLabelMap[cardSet.languageTo] || cardSet.languageTo}`
    : 'Перевод';

  // Сохранение
  const handleSave = useCallback(async () => {
    // Валидация
    if (!frontText.trim()) {
      toast.error('Введи иностранное слово');
      return;
    }
    if (!backText.trim()) {
      toast.error('Введи перевод');
      return;
    }

    setIsSaving(true);

    try {
      if (isEditing && cardId) {
        updateCard(cardId, {
          frontText: frontText.trim(),
          backText: backText.trim(),
        });
      } else {
        addCard({
          setId,
          frontText: frontText.trim(),
          backText: backText.trim(),
        });
        incrementCardCount(setId);
      }

      navigation.goBack();
    } catch (error) {
      toast.error('Не удалось сохранить карточку');
    } finally {
      setIsSaving(false);
    }
  }, [
    frontText,
    backText,
    isEditing,
    cardId,
    setId,
    updateCard,
    addCard,
    incrementCardCount,
    navigation,
  ]);

  // Удаление
  const handleDelete = useCallback(async () => {
    if (!cardId) return;

    const confirmed = await confirmDialog({
      title: 'Удалить карточку?',
      message: 'Это действие нельзя отменить',
      confirmText: 'Удалить',
      destructive: true,
    });
    if (!confirmed) return;
    deleteCard(cardId);
    decrementCardCount(setId);
    navigation.goBack();
  }, [cardId, setId, deleteCard, decrementCardCount, navigation]);

  // Создать и добавить еще
  const handleSaveAndNew = useCallback(async () => {
    if (!frontText.trim() || !backText.trim()) {
      handleSave();
      return;
    }

    setIsSaving(true);
    try {
      addCard({
        setId,
        frontText: frontText.trim(),
        backText: backText.trim(),
      });
      incrementCardCount(setId);
      
      // Очистка формы
      setFrontText('');
      setBackText('');
    } catch (error) {
      toast.error('Не удалось сохранить карточку');
    } finally {
      setIsSaving(false);
    }
  }, [frontText, backText, setId, addCard, incrementCardCount, handleSave]);

  return (
    <Container edges={['top', 'bottom']}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        style={styles.header}
        center={
          <View style={styles.headerTitles} accessibilityRole="header">
            <Text variant="button" numberOfLines={1} style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {isEditing ? 'Редактировать' : 'Новая карточка'}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {cardSet?.title || 'Набор'}
            </Text>
          </View>
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label={sourceLabel}
          placeholder="Например: scharf"
          value={frontText}
          onChangeText={setFrontText}
          multiline
          numberOfLines={2}
          inputStyle={styles.textArea}
          style={styles.field}
        />

        <TextField
          label={targetLabel}
          placeholder="Например: острый"
          value={backText}
          onChangeText={setBackText}
          multiline
          numberOfLines={2}
          inputStyle={styles.textArea}
          style={styles.field}
        />

        {/* Кнопки */}
        <View style={styles.buttons}>
          <Button
            title="Сохранить"
            onPress={handleSave}
            loading={isSaving}
            fullWidth
          />

          {!isEditing && (
            <Button
              title="Сохранить и добавить ещё"
              variant="secondary"
              onPress={handleSaveAndNew}
              disabled={isSaving}
              fullWidth
            />
          )}

          {isEditing && (
            <Button
              title="Удалить карточку"
              variant="danger"
              onPress={handleDelete}
              disabled={isSaving}
              fullWidth
              style={styles.hidden}
            />
          )}
        </View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  textArea: {
    minHeight: 96,
  },
  field: {
    marginBottom: spacing.m,
  },
  // Шапка внутри Container с отступом 16 — свой боковой отступ не нужен
  header: {
    paddingHorizontal: 0,
  },
  headerTitles: {
    alignItems: 'center',
  },
  headerTitle: {
    letterSpacing: 0,
  },
  hidden: {
    display: 'none',
  },
  buttons: {
    gap: spacing.s,
    marginTop: spacing.l,
    paddingBottom: spacing.xl,
  },
});
