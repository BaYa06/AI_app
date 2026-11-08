/**
 * SelectPill — элемент формы редактора набора
 * (Clean 8 — перенесено из SetEditorScreen.tsx без изменений.)
 */
import { Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { ChevronDown } from 'lucide-react-native';
import { styles } from './styles';

export function SelectPill({
  label,
  placeholder,
  onPress,
  colors,
  isOpen = false,
  fullWidth = false,
  hasError = false,
}: {
  label: string;
  placeholder?: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
  isOpen?: boolean;
  fullWidth?: boolean;
  hasError?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: !!isOpen }}
      onPress={onPress}
      style={[
        styles.select,
        fullWidth && styles.selectFullWidth,
        {
          backgroundColor: colors.surface,
          borderColor: hasError ? colors.error : isOpen ? colors.primary : colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <Text
        variant="bodySmall"
        style={[styles.selectLabel, { color: label ? colors.textPrimary : colors.textTertiary }]}
        numberOfLines={1}
      >
        {label || placeholder}
      </Text>
      <ChevronDown
        size={18}
        color={isOpen ? colors.primary : colors.textSecondary}
        style={[
          // transition — только web, в типах RN его нет
          { transition: 'transform 0.2s ease' } as any,
          isOpen ? { transform: [{ rotate: '180deg' }] } : undefined,
        ]}
      />
    </Pressable>
  );
}
