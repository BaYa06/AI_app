/**
 * Предпросмотр карточки (тап по строке)
 * (Clean 8 — вынесено из SetDetailScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, Platform, Modal } from 'react-native';
import { BlurView } from '@/utils/BlurView';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { alpha } from '@/constants';
import type { Card, ThemeMode } from '@/types';
import { styles } from './styles';

type Props = {
  previewCard: Card | null;
  setPreviewCard: React.Dispatch<React.SetStateAction<Card | null>>;
  colors: ReturnType<typeof useThemeColors>;
  theme: ThemeMode;
};

export function CardPreviewModal({ previewCard, setPreviewCard, colors, theme }: Props) {
  return (
    <Modal
      visible={previewCard !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setPreviewCard(null)}
    >
      <Pressable
        accessibilityRole="button"
        style={[styles.previewOverlay, { backgroundColor: colors.overlay }]}
        onPress={() => setPreviewCard(null)}
        accessibilityLabel="Закрыть"
      >
        {Platform.OS === 'web' ? (
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: alpha(colors.surface, 40),
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.previewFrontSection}>
              <Text
                style={[styles.previewFrontText, { color: colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                allowFontScaling={false}
              >
                {previewCard?.frontText ?? (previewCard as any)?.front}
              </Text>
            </View>
            <View style={[styles.previewDivider, { backgroundColor: colors.border }]} />
            <View style={styles.previewBackSection}>
              <Text
                style={[styles.previewBackText, { color: colors.textSecondary }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                allowFontScaling={false}
              >
                {previewCard?.backText ?? (previewCard as any)?.back}
              </Text>
              {previewCard?.example ? (
                <Text style={[styles.previewExample, { color: colors.textTertiary }]}>
                  {previewCard.example}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <BlurView
            blurType={theme === 'dark' ? 'dark' : 'xlight'}
            blurAmount={24}
            style={[styles.previewCard, { borderColor: colors.border }]}
          >
            <View style={styles.previewFrontSection}>
              <Text
                style={[styles.previewFrontText, { color: colors.textPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                allowFontScaling={false}
              >
                {previewCard?.frontText ?? (previewCard as any)?.front}
              </Text>
            </View>
            <View style={[styles.previewDivider, { backgroundColor: colors.border }]} />
            <View style={styles.previewBackSection}>
              <Text
                style={[styles.previewBackText, { color: colors.textSecondary }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                allowFontScaling={false}
              >
                {previewCard?.backText ?? (previewCard as any)?.back}
              </Text>
              {previewCard?.example ? (
                <Text style={[styles.previewExample, { color: colors.textTertiary }]}>
                  {previewCard.example}
                </Text>
              ) : null}
            </View>
          </BlurView>
        )}
      </Pressable>
    </Modal>
  );
}
