/**
 * Выбор типа набора: язык или предмет (plan/new/set_kind.md, Kind 3).
 * Обязательное поле без выбора по умолчанию — используют SetEditorScreen и PreviewImportScreen.
 */
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { BookOpen, Languages } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, iconSize, alpha } from '@/constants';
import type { SetKind } from '@/types';

const OPTIONS: { value: SetKind; title: string; hint: string; Icon: typeof Languages }[] = [
  { value: 'language', title: 'Язык', hint: 'Слова и фразы с переводом', Icon: Languages },
  { value: 'subject', title: 'Предмет', hint: 'История, география, ОРТ: вопрос → ответ', Icon: BookOpen },
];

interface SetKindPickerProps {
  value: SetKind | undefined;
  onChange: (kind: SetKind) => void;
  hasError?: boolean;
  disabled?: boolean;
}

export function SetKindPicker({ value, onChange, hasError = false, disabled = false }: SetKindPickerProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map(({ value: kind, title, hint, Icon }) => {
        const selected = value === kind;
        return (
          <Pressable
            key={kind}
            onPress={() => onChange(kind)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${title}. ${hint}`}
            style={[
              styles.option,
              {
                backgroundColor: selected ? alpha(colors.primary, 10) : colors.surface,
                borderColor: selected ? colors.primary : hasError ? colors.error : colors.border,
              },
            ]}
          >
            <Icon size={iconSize.m} color={selected ? colors.primary : colors.textSecondary} />
            <Text variant="label" style={{ color: selected ? colors.primary : colors.textPrimary }}>
              {title}
            </Text>
            <Text variant="caption" color="secondary">
              {hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  option: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.xs,
  },
});
