/**
 * Card Editor Screen
 * @description Экран создания/редактирования карточки
 */
import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useCardsStore, useSetsStore, useThemeColors } from '@/store';
import { Container, Input, Button } from '@/components/common';
import { spacing } from '@/constants';
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

  // Состояние формы
  const [frontText, setFrontText] = useState('');
  const [backText, setBackText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Загрузка данных для редактирования
  useEffect(() => {
    if (cardId) {
      const card = getCard(cardId);
      if (card) {
        setFrontText(card.frontText);
        setBackText(card.backText);
      }
    }
  }, [cardId, getCard]);

  // Обновление заголовка
  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Редактировать' : 'Новая карточка',
    });
  }, [navigation, isEditing]);

  // Сохранение
  const handleSave = useCallback(async () => {
    // Валидация
    if (!frontText.trim()) {
      Alert.alert('Ошибка', 'Введите иностранное слово');
      return;
    }
    if (!backText.trim()) {
      Alert.alert('Ошибка', 'Введите перевод');
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
      Alert.alert('Ошибка', 'Не удалось сохранить карточку');
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
  const handleDelete = useCallback(() => {
    if (!cardId) return;

    Alert.alert(
      'Удалить карточку?',
      'Это действие нельзя отменить',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteCard(cardId);
            decrementCardCount(setId);
            navigation.goBack();
          },
        },
      ]
    );
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
      Alert.alert('Ошибка', 'Не удалось сохранить карточку');
    } finally {
      setIsSaving(false);
    }
  }, [frontText, backText, setId, addCard, incrementCardCount, handleSave]);

  return (
    <Container>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Иностранное слово"
          placeholder="Например: scharf"
          value={frontText}
          onChangeText={setFrontText}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          inputStyle={styles.textArea}
        />

        <Input
          label="Перевод"
          placeholder="Например: острый"
          value={backText}
          onChangeText={setBackText}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          inputStyle={styles.textArea}
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
              title="Сохранить и добавить еще"
              variant="outline"
              onPress={handleSaveAndNew}
              disabled={isSaving}
              fullWidth
            />
          )}

          {isEditing && (
            <Button
              title="Удалить карточку"
              variant="ghost"
              onPress={handleDelete}
              disabled={isSaving}
              fullWidth
              textStyle={{ color: colors.error }}
            />
          )}
        </View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  textArea: {
    height: 120,
    paddingTop: spacing.m,
  },

  buttons: {
    gap: spacing.m,
    marginTop: spacing.l,
    paddingBottom: spacing.xl,
  },
});
