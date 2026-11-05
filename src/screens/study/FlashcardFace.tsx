/**
 * Флеш-карточка в сессии: лицо/оборот, подгонка текста, озвучка, подсказки свайпа
 * (Clean 8 — вынесено из StudyScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import { useStudyStore, useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { alpha } from '@/constants';
import { fitText, fitWordWithExample } from '@/utils/fitText';
import ReAnimated, { useAnimatedStyle } from 'react-native-reanimated';
import { styles } from './styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  session: ReturnType<typeof useStudyStore.getState>['session'];
  isFlipped: boolean;
  handleToggleCard: () => void;
  handleSpeak: (text: string, langHint?: string, counterpart?: string) => void;
  renderCardTop: (onSpeak: () => void) => React.ReactNode;
  measureTextBox: (side: 'front' | 'back') => (e: LayoutChangeEvent) => void;
  questionText: string;
  answerText: string;
  example: string;
  questionLang: string | undefined;
  answerLang: string | undefined;
  questionFit: ReturnType<typeof fitText>;
  answerFit: ReturnType<typeof fitWordWithExample>;
  frontAnimStyle: ReturnType<typeof useAnimatedStyle>;
  backAnimStyle: ReturnType<typeof useAnimatedStyle>;
  swipeLeftStyle: ReturnType<typeof useAnimatedStyle>;
  swipeRightStyle: ReturnType<typeof useAnimatedStyle>;
  showSwipeHint: boolean;
};

export function FlashcardFace({
  colors,
  session,
  isFlipped,
  handleToggleCard,
  handleSpeak,
  renderCardTop,
  measureTextBox,
  questionText,
  answerText,
  example,
  questionLang,
  answerLang,
  questionFit,
  answerFit,
  frontAnimStyle,
  backAnimStyle,
  swipeLeftStyle,
  swipeRightStyle,
  showSwipeHint,
}: Props) {
  return (
    <Pressable
      onPress={handleToggleCard}
      accessibilityRole="button"
      accessibilityLabel={
        isFlipped
          ? `Ответ: ${answerText}. Нажми, чтобы перевернуть`
          : `${questionText}. Нажми, чтобы перевернуть`
      }
      style={styles.cardWrapper}
    >
      {/* Передняя сторона (вопрос) */}
      <ReAnimated.View
        style={[styles.cardAnim, frontAnimStyle]}
        pointerEvents={isFlipped ? 'none' : 'auto'}
      >
        <View
          style={[
            styles.cardInner,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {renderCardTop(() => handleSpeak(questionText, questionLang, answerText))}

          <View style={styles.cardContent} onLayout={measureTextBox('front')}>
            <Text
              variant="h2"
              numberOfLines={questionFit.numberOfLines}
              style={[
                styles.cardWord,
                {
                  color: colors.textPrimary,
                  fontSize: questionFit.fontSize,
                  lineHeight: questionFit.lineHeight,
                },
              ]}
            >
              {questionText}
            </Text>
          </View>

          <View style={styles.cardBottom}>
            <Text variant="bodySmall" align="center" style={{ color: colors.textSecondary }}>
              {showSwipeHint && session?.currentIndex === 0
                ? '← Не знаю · Уверенно →'
                : 'Нажми, чтобы перевернуть'}
            </Text>
          </View>
        </View>
      </ReAnimated.View>

      {/* Задняя сторона (ответ) */}
      <ReAnimated.View
        style={[styles.cardAnim, backAnimStyle]}
        pointerEvents={isFlipped ? 'auto' : 'none'}
      >
        <View
          style={[
            styles.cardInner,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {renderCardTop(() => handleSpeak(answerText, answerLang, questionText))}

          <View style={styles.cardContent} onLayout={measureTextBox('back')}>
            <Text
              variant="h2"
              numberOfLines={answerFit.word.numberOfLines}
              style={[
                styles.cardWord,
                {
                  color: colors.textPrimary,
                  fontSize: answerFit.word.fontSize,
                  lineHeight: answerFit.word.lineHeight,
                },
              ]}
            >
              {answerText}
            </Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {example ? (
              <Text
                variant="bodyLarge"
                align="center"
                numberOfLines={answerFit.example.numberOfLines}
                style={{
                  color: colors.textSecondary,
                  fontSize: answerFit.example.fontSize,
                  lineHeight: answerFit.example.lineHeight,
                }}
              >
                {example}
              </Text>
            ) : null}
          </View>

          <View style={styles.cardBottom} />
        </View>
      </ReAnimated.View>

      {/* Подписи свайпа: влево — «Не знаю», вправо — «Уверенно» */}
      <ReAnimated.View
        pointerEvents="none"
        style={[
          styles.swipeOverlay,
          {
            borderColor: colors.ratingAgain,
            backgroundColor: alpha(colors.ratingAgain, 10),
          },
          swipeLeftStyle,
        ]}
      >
        <View
          style={[
            styles.swipeLabel,
            { borderColor: colors.ratingAgain, backgroundColor: colors.surface },
          ]}
        >
          <Text variant="label" style={{ color: colors.errorText }}>
            Не знаю
          </Text>
        </View>
      </ReAnimated.View>
      <ReAnimated.View
        pointerEvents="none"
        style={[
          styles.swipeOverlay,
          { borderColor: colors.ratingGood, backgroundColor: alpha(colors.ratingGood, 10) },
          swipeRightStyle,
        ]}
      >
        <View
          style={[
            styles.swipeLabel,
            { borderColor: colors.ratingGood, backgroundColor: colors.surface },
          ]}
        >
          <Text variant="label" style={{ color: colors.successText }}>
            Уверенно
          </Text>
        </View>
      </ReAnimated.View>
    </Pressable>
  );
}
