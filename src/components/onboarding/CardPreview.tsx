/**
 * Живой пример «Так будут выглядеть карточки» на экранах языков
 * (plan/new/new_user_activation.md, Start 2.3): слово сверху — на изучаемом языке,
 * перевод снизу — на родном. Меняется сразу при выборе языка.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/common/Text';
import { useThemeColors } from '@/store';
import { borderRadius, languageAccusative, spacing } from '@/constants';
import { STARTER_THEMES, isStarterLang } from '@/constants/starterWords';
import { useBridgeTone } from './LanguageBridge';

const SAMPLE = STARTER_THEMES.first_words.concepts[0];

function Tag({ side, text }: { side: 'native' | 'target'; text: string }) {
  const tone = useBridgeTone(side);
  return (
    <View style={[styles.tag, { backgroundColor: tone.soft }]}>
      <Text variant="caption" style={[styles.tagText, { color: tone.text }]}>
        {text}
      </Text>
    </View>
  );
}

export const CardPreview = memo(function CardPreview({
  native,
  target,
}: {
  native: string;
  target?: string;
}) {
  const colors = useThemeColors();
  const studied = isStarterLang(target) ? SAMPLE.words[target] : undefined;
  const translation = isStarterLang(native) ? SAMPLE.words[native].word : '';

  return (
    <View
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
      accessible
      accessibilityLabel={
        studied
          ? `Пример карточки: ${studied.word} — ${translation}`
          : `Пример карточки: перевод будет на ${languageAccusative(native)}: ${translation}`
      }
    >
      <View style={[styles.head, { backgroundColor: colors.surfaceVariant }]}>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          Так будут выглядеть карточки
        </Text>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          {studied ? (
            <>
              <Text variant="h3" style={{ color: colors.textPrimary }}>
                {studied.word}
              </Text>
              {studied.reading ? (
                <Text variant="caption" style={{ color: colors.textSecondary }}>
                  {studied.reading}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="body" style={{ color: colors.textTertiary }}>
              слово на языке, который учишь
            </Text>
          )}
        </View>
        <Tag side="target" text={target ? `слово · ${languageAccusative(target)}` : 'слово'} />
      </View>
      <View style={[styles.divider, { borderColor: colors.border }]} />
      <View style={styles.row}>
        <Text variant="h3" style={[styles.flex, { color: colors.textPrimary }]}>
          {translation}
        </Text>
        <Tag side="native" text={`перевод · ${languageAccusative(native)}`} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  head: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  flex: {
    flex: 1,
  },
  divider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  tag: {
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  tagText: {
    fontWeight: '700',
  },
});
