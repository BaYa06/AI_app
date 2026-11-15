/**
 * Первый урок · карточки (plan/new/new_user_activation.md, Start 2.5): 5 новых слов стартового
 * набора. Нажатие переворачивает карточку, кнопка звука озвучивает слово, одна главная кнопка:
 * «Показать перевод» → «Следующее слово» → «Сыграть в „Пары“».
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Volume2 } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, languageAccusative, spacing } from '@/constants';
import type { Card } from '@/types';
import { speak } from '@/utils/speech';
import { FIRST_LESSON_SIZE, FirstLessonLayout, recordFirstLessonWord } from './FirstLessonLayout';

export function FirstCardsScreen({
  cards,
  target,
  native,
  onDone,
}: {
  cards: Card[];
  target: string;
  native: string;
  onDone: () => void;
}) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const words = cards.slice(0, FIRST_LESSON_SIZE);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flip = useSharedValue(0);
  const card = words[index];
  const last = index === words.length - 1;

  const setSide = (back: boolean) => {
    setFlipped(back);
    flip.value = reduceMotion ? (back ? 1 : 0) : withTiming(back ? 1 : 0, { duration: 450 });
  };

  const next = () => {
    if (!flipped) {
      setSide(true);
      return;
    }
    recordFirstLessonWord(card);
    if (last) {
      onDone();
      return;
    }
    flip.value = 0;
    setFlipped(false);
    setIndex(index + 1);
  };

  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${flip.value * 180}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${flip.value * 180 - 180}deg` }],
  }));

  if (!card) return null;
  // Чтение zh/ja/ko лежит в переводе: «Привет (nǐ hǎo)» — на лицевой стороне показываем его отдельно
  const reading = card.backText.match(/\(([^)]+)\)$/)?.[1];
  const translation = card.backText.replace(/\s*\([^)]+\)$/, '');

  return (
    <FirstLessonLayout
      label="Первый урок"
      counter={`${index + 1} из ${words.length}`}
      progress={((index + (flipped ? 1 : 0)) / words.length) * 60}
      footer={
        <Button
          title={flipped ? (last ? 'Сыграть в «Пары»' : 'Следующее слово') : 'Показать перевод'}
          onPress={next}
          fullWidth
        />
      }
    >
      <Text variant="overline" style={{ color: colors.textSecondary }}>
        Новое слово · нажми, чтобы увидеть перевод
      </Text>
      <Pressable
        style={styles.cardArea}
        onPress={() => setSide(!flipped)}
        accessibilityRole="button"
        accessibilityLabel={
          flipped ? `${translation}. Перевернуть` : `${card.frontText}. Перевернуть`
        }
      >
        <Animated.View
          pointerEvents={flipped ? 'none' : 'auto'}
          style={[
            styles.face,
            { backgroundColor: colors.surface, borderColor: colors.border },
            frontStyle,
          ]}
        >
          <Tag text={languageAccusative(target)} color={colors.primary} />
          <Text variant="display" align="center" style={{ color: colors.textPrimary }}>
            {card.frontText}
          </Text>
          {reading ? (
            <Text variant="body" style={{ color: colors.textSecondary }}>
              {reading}
            </Text>
          ) : null}
          <Button
            variant="icon"
            icon={Volume2}
            iconSize={iconSize.m}
            iconColor={colors.primary}
            accessibilityLabel="Послушать"
            onPress={() => speak(card.frontText, target)}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.face,
            { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 20) },
            backStyle,
          ]}
        >
          <Tag text={languageAccusative(native)} color={colors.successText} />
          <Text variant="display" align="center" style={{ color: colors.textPrimary }}>
            {translation}
          </Text>
          <Text variant="body" style={{ color: colors.textSecondary }}>
            {card.frontText}
            {reading ? ` · ${reading}` : ''}
          </Text>
        </Animated.View>
      </Pressable>
    </FirstLessonLayout>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: alpha(color, 10) }]}>
      <Text variant="caption" style={[styles.tagText, { color }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardArea: {
    flex: 1,
    marginBottom: spacing.m,
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    padding: spacing.l,
    backfaceVisibility: 'hidden',
  },
  tag: {
    position: 'absolute',
    top: spacing.m,
    left: spacing.m,
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  tagText: {
    fontWeight: '700',
  },
});
