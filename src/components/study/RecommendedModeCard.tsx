/**
 * RecommendedModeCard
 * @description Рекомендованная карточка режима "Flashcards" внутри StudyModeSheet
 */
import React, { memo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';

const RATE_LABELS: Array<{ label: string; color: string }> = [
  { label: 'Не знаю', color: '#EF4444' },
  { label: 'Сомневаюсь', color: '#F97316' },
  { label: 'Почти', color: '#2563EB' },
  { label: 'Уверенно', color: '#10B981' },
];

interface Props {
  onPress: () => void;
}

export const RecommendedModeCard = memo(function RecommendedModeCard({ onPress }: Props) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { borderColor: colors.primary, backgroundColor: colors.surface }]}
    >
      <View style={styles.badge}>
        <Text variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
          Recommended
        </Text>
      </View>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Sparkles size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            Flashcards
          </Text>
          <Text variant="caption" color="secondary">
            Переворот 180° • Классический режим
          </Text>
        </View>
      </View>
      <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
          scharf
        </Text>
        <Text variant="caption" color="secondary">
          Нажми, чтобы перевернуть
        </Text>
      </View>
      <View style={styles.rateRow}>
        {RATE_LABELS.map(({ label, color }) => (
          <View key={label} style={[styles.ratePill, { borderColor: `${color}33`, backgroundColor: `${color}1A` }]}>
            <Text variant="caption" style={{ color, fontWeight: '700' }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: '#2d65e6',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs / 2,
    borderBottomLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.s,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.l,
    backgroundColor: 'rgba(45,101,230,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  rateRow: {
    flexDirection: 'row',
    gap: spacing.s,
    flexWrap: 'wrap',
  },
  ratePill: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs / 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
});
