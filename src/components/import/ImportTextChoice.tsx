/**
 * ImportTextChoice
 * @description Экран 3a ИИ-импорта (plan/ai_import.md, AI 6): загрузили сплошной текст, а не список
 * слов — спрашиваем, что из него сделать. По умолчанию — незнакомые слова под уровень
 * (пример возьмём из самого текста).
 */
import React, { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/common';
import { Button, Chip } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, screenPadding, spacing } from '@/constants';
import type { CefrLevel, ImportGoal } from '@/services/AiImportService';

type TextGoal = Extract<ImportGoal, 'pick_words' | 'all_words' | 'qa'>;

interface Props {
  excerpt?: string;
  level: CefrLevel;
  onLevelChange: (level: CefrLevel) => void;
  onContinue: (goal: TextGoal) => void;
  onBack: () => void;
}

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

const OPTIONS: Array<{ goal: TextGoal; title: string; hint: string }> = [
  {
    goal: 'pick_words',
    title: 'Выбрать незнакомые слова',
    hint: 'ИИ отберёт ~15 слов под твой уровень. Пример — предложение из этого же текста.',
  },
  {
    goal: 'all_words',
    title: 'Все слова подряд',
    hint: 'Включая самые простые («und», «der») — может получиться 100+ карточек.',
  },
  {
    goal: 'qa',
    title: 'Вопросы по тексту',
    hint: 'Понимание прочитанного: вопрос — короткий ответ.',
  },
];

export const ImportTextChoice = memo(function ImportTextChoice({ excerpt, level, onLevelChange, onContinue, onBack }: Props) {
  const colors = useThemeColors();
  const [goal, setGoal] = useState<TextGoal>('pick_words');

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="h2" style={{ color: colors.textPrimary }}>Это текст, а не список слов</Text>
        <Text variant="body" color="secondary">Что из него сделать?</Text>

        {!!excerpt && (
          <View style={[styles.excerpt, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="bodySmall" style={{ color: colors.textPrimary }} numberOfLines={5}>
              {excerpt}…
            </Text>
          </View>
        )}

        {OPTIONS.map(option => {
          const selected = goal === option.goal;
          return (
            <Pressable
              key={option.goal}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setGoal(option.goal)}
              style={[
                styles.option,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? alpha(colors.primary, 10) : colors.surface,
                },
              ]}
            >
              <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 6 : 2 }]} />
              <View style={styles.optionText}>
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{option.title}</Text>
                <Text variant="bodySmall" color="secondary">{option.hint}</Text>
                {selected && option.goal === 'pick_words' && (
                  <View style={styles.levels}>
                    {LEVELS.map(l => (
                      <Chip key={l} label={l} selected={level === l} onPress={() => onLevelChange(l)} />
                    ))}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        <Button title="Продолжить" onPress={() => onContinue(goal)} fullWidth />
        <Button variant="quiet" title="Загрузить другое" onPress={onBack} fullWidth />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: screenPadding, paddingTop: spacing.m, paddingBottom: spacing.l, gap: spacing.s },
  excerpt: { borderRadius: borderRadius.l, padding: spacing.m, marginBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    gap: spacing.s,
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  radio: { width: 20, height: 20, borderRadius: borderRadius.full, marginTop: 2 },
  optionText: { flex: 1, gap: spacing.xxs },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  actions: { paddingHorizontal: screenPadding, paddingBottom: spacing.l, gap: spacing.xs },
});
