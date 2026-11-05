/**
 * LanguageDropdown — элемент формы редактора набора
 * (Clean 8 — перенесено из SetEditorScreen.tsx без изменений.)
 */
import { View, ScrollView, Pressable } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha } from '@/constants';
import { Check } from 'lucide-react-native';
import { styles } from './styles';

export function LanguageDropdown({
  options,
  selected,
  onSelect,
  colors,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[
        styles.languageDropdown,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <ScrollView
        style={styles.languageDropdownScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {options.map((option, index) => {
          const isActive = option === selected;
          const isFirst = index === 0;
          const isLast = index === options.length - 1;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [
                styles.languageDropdownOption,
                {
                  backgroundColor:
                    pressed && !isActive
                      ? colors.surfaceVariant
                      : isActive
                        ? alpha(colors.primary, 10)
                        : colors.surface,
                  borderBottomColor: colors.border,
                },
                isFirst && styles.languageDropdownOptionFirst,
                isLast && styles.languageDropdownOptionLast,
              ]}
            >
              <Text
                variant="body"
                style={{
                  color: isActive ? colors.primary : colors.textPrimary,
                  fontWeight: isActive ? '700' : '600',
                  fontSize: 16,
                }}
              >
                {option}
              </Text>
              {isActive && (
                <View style={[styles.checkmark, { backgroundColor: colors.primaryFill }]}>
                  <Check size={iconSize.xs} color={colors.onPrimary} strokeWidth={3} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
