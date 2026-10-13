/**
 * ImportLangChoice
 * @description ИИ-импорт (plan/ai_import.md, AI 6): слова на фото не на языке набора
 * (набор DE → RU, а на фото английский). Новый набор (рекомендуем), перевести на язык набора
 * или добавить как есть.
 */
import React, { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button } from '@/components/ui';
import { useThemeColors } from '@/store';
import { TOP_LANGUAGES, alpha, borderRadius, iconSize, screenPadding, spacing } from '@/constants';
import { pluralize } from '@/utils';

interface Props {
  /** Язык, который определил ИИ (ISO 639-1) */
  foundLang: string;
  setLanguageFrom: string;
  setLanguageTo?: string;
  setTitle?: string;
  sampleWords: string[];
  count: number;
  onNewSet: () => void;
  onTranslateHere: () => void;
  onAddAsIs: () => void;
  onCancel: () => void;
}

export function languageLabel(code: string): string {
  const lang = TOP_LANGUAGES.find(l => l.code === code);
  return lang ? `${lang.label} (${code.toUpperCase()})` : code.toUpperCase();
}

export const ImportLangChoice = memo(function ImportLangChoice(props: Props) {
  const { foundLang, setLanguageFrom, setLanguageTo, setTitle, sampleWords, count } = props;
  const colors = useThemeColors();
  const pair = `${setLanguageFrom.toUpperCase()}${setLanguageTo ? ` → ${setLanguageTo.toUpperCase()}` : ''}`;
  const newPair = `${foundLang.toUpperCase()}${setLanguageTo ? ` → ${setLanguageTo.toUpperCase()}` : ''}`;

  const options = [
    { title: `Создать новый набор ${newPair}`, hint: 'Рекомендуем: слова не смешаются с набором', onPress: props.onNewSet, recommended: true },
    { title: `Перевести на ${languageLabel(setLanguageFrom)} и добавить сюда`, hint: 'Ещё одно распознавание из дневного лимита', onPress: props.onTranslateHere, recommended: false },
    { title: 'Добавить как есть', hint: `Слова на другом языке в наборе ${pair}`, onPress: props.onAddAsIs, recommended: false },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.badges} accessible accessibilityLabel={`Набор ${pair}, а слова: ${languageLabel(foundLang)}`}>
          <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="h3" color="secondary">{setLanguageFrom.toUpperCase()}</Text>
          </View>
          <ArrowRight size={iconSize.s} color={colors.warningText} />
          <View style={[styles.badge, { backgroundColor: alpha(colors.warning, 20) }]}>
            <Text variant="h3" style={{ color: colors.warningText }}>{foundLang.toUpperCase()}</Text>
          </View>
        </View>
        <Text variant="h2" align="center" style={{ color: colors.textPrimary }}>Похоже, слова на другом языке</Text>
        <Text variant="body" align="center" color="secondary">
          {`ИИ определил язык: ${languageLabel(foundLang)}. А набор${setTitle ? ` «${setTitle}»` : ''} — ${pair}. `}
          {`Нашли ${count} ${pluralize(count, 'слово', 'слова', 'слов')}: `}
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{sampleWords.join(', ')}…</Text>
        </Text>

        <View style={styles.options}>
          {options.map(option => (
            <Pressable
              key={option.title}
              accessibilityRole="button"
              onPress={option.onPress}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: option.recommended ? colors.primary : colors.border,
                  backgroundColor: option.recommended ? alpha(colors.primary, 10) : colors.surface,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{option.title}</Text>
              <Text variant="bodySmall" color="secondary">{option.hint}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button variant="secondary" title="Отмена" onPress={props.onCancel} fullWidth />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: screenPadding, paddingTop: spacing.xl, paddingBottom: spacing.l, gap: spacing.s, alignItems: 'stretch' },
  badges: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s, marginBottom: spacing.xs },
  badge: { borderRadius: borderRadius.l, paddingHorizontal: spacing.m, paddingVertical: spacing.xs },
  options: { gap: spacing.s, marginTop: spacing.m },
  option: { borderWidth: 1.5, borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.xxs },
  actions: { paddingHorizontal: screenPadding, paddingBottom: spacing.l },
});
