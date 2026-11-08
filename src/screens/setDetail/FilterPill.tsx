/**
 * Кнопка-фильтр списка карточек (все / выучено / не выучено)
 * (Clean 8 — перенесено из SetDetailScreen.tsx без изменений.)
 */
import { Pressable } from 'react-native';
import { triggerHaptic } from '@/utils/haptic';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { styles } from './styles';

export function FilterPill({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        triggerHaptic('selection');
        onPress();
      }}
      style={[
        styles.filterPill,
        {
          backgroundColor: active ? colors.primaryFill : 'transparent',
          borderColor: active ? colors.primaryFill : colors.border,
        },
      ]}
    >
      <Text
        variant="bodySmall"
        style={{ color: active ? colors.onPrimary : colors.textSecondary, fontWeight: '700' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
