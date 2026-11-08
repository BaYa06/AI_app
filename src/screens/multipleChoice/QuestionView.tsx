/**
 * Вопрос теста: слово (или «на слух»), варианты ответа с подсветкой
 * (Clean 8 — вынесено из MultipleChoiceScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { Check, Volume2, X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button } from '@/components/ui';
import { useThemeColors } from '@/store';
import { iconSize, alpha } from '@/constants';
import { cardSpeechLangs, isCardSpeakable } from '@/utils/speech';
import type { Card } from '@/types';
import { styles } from './styles';
import { type OptionState, type Option } from './types';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  currentCard: Card;
  getFront: (card: Card) => string;
  getBack: (card: Card) => string;
  options: Option[];
  optionState: (option: Option) => OptionState;
  handleSelectOption: (option: Option) => void;
  handleSpeak: (text: string, counterpartText?: string, langHint?: string, rate?: number) => void;
  playWord: (slow?: boolean) => void;
  isListen: boolean;
  isPlainTest: boolean;
  showResult: boolean;
};

export function QuestionView({
  colors,
  currentCard,
  getFront,
  getBack,
  options,
  optionState,
  handleSelectOption,
  handleSpeak,
  playWord,
  isListen,
  isPlainTest,
  showResult,
}: Props) {
  return (
    <>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {isPlainTest ? null : (
          <View style={styles.cardChip}>
            <Text variant="overline" style={{ color: colors.primary }}>
              Выбери правильный ответ
            </Text>
          </View>
        )}
        {isListen ? (
          <View style={styles.listenRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Прослушать ещё раз"
              onPress={() => playWord()}
              style={({ pressed }) => [
                styles.listenButton,
                {
                  backgroundColor: pressed ? alpha(colors.primary, 20) : alpha(colors.primary, 10),
                },
              ]}
            >
              <Volume2 size={iconSize.l} color={colors.primary} />
            </Pressable>
            <Button variant="secondary" size="s" title="Медленнее" onPress={() => playWord(true)} />
          </View>
        ) : null}
        {/* «На слух»: слово видно только после ответа */}
        {!isListen || showResult ? (
          <Text variant="h1" style={[styles.word, { color: colors.textPrimary }]}>
            {getFront(currentCard)}
          </Text>
        ) : null}
        {!isListen && isCardSpeakable(currentCard) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Прослушать слово"
            style={({ pressed }) => [
              styles.audioButton,
              {
                backgroundColor: pressed ? alpha(colors.primary, 20) : colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
            onPress={() =>
              handleSpeak(
                getFront(currentCard),
                getBack(currentCard),
                cardSpeechLangs(currentCard).front
              )
            }
          >
            <Volume2 size={iconSize.m} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.optionsBlock}>
        {options.map((option) => {
          const state = optionState(option);
          const isCorrect = state === 'correct';
          const isWrong = state === 'wrong';

          const baseBorder = isCorrect ? colors.success : isWrong ? colors.error : colors.border;
          const baseBg = isCorrect
            ? alpha(colors.success, 10)
            : isWrong
              ? alpha(colors.error, 10)
              : colors.surface;
          // Текст ответа — «текстовые» токены: заливки как текст нечитаемы
          const textColor = isCorrect
            ? colors.successText
            : isWrong
              ? colors.errorText
              : colors.textPrimary;

          return (
            <Pressable
              key={option.id}
              onPress={() => handleSelectOption(option)}
              disabled={showResult}
              accessibilityRole="button"
              accessibilityLabel={`${option.label}. ${option.text}${isCorrect ? ', верно' : isWrong ? ', неверно' : ''}`}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: baseBorder,
                  backgroundColor:
                    pressed && !isCorrect && !isWrong ? alpha(colors.primary, 10) : baseBg,
                },
              ]}
            >
              <View
                style={[
                  styles.optionBadge,
                  { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                ]}
              >
                <Text variant="label" style={{ color: colors.textSecondary }}>
                  {option.label}
                </Text>
              </View>
              <Text variant="bodyLarge" style={[styles.optionText, { color: textColor }]}>
                {option.text}
              </Text>
              {/* Верно/неверно — цвет и иконка, не только цвет (брендбук, 11) */}
              {isCorrect ? (
                <Check size={iconSize.s} color={colors.successText} strokeWidth={3} />
              ) : isWrong ? (
                <X size={iconSize.s} color={colors.errorText} strokeWidth={3} />
              ) : (
                <View style={styles.optionMarkPlaceholder} />
              )}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
