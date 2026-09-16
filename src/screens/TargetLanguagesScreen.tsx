/**
 * TargetLanguagesScreen
 * @description Шаг 4: выбор изучаемых языков (1-3). Только UI, без сохранения.
 */
import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Button, Text } from '@/components/common';
import { spacing, borderRadius, TOP_LANGUAGES, MAX_TARGET_LANGUAGES } from '@/constants';
import { useThemeColors } from '@/store';

type Props = {
  nativeLanguage?: string;
  onContinue?: (codes: string[]) => void;
  onBack?: () => void;
};

export function TargetLanguagesScreen({ nativeLanguage, onContinue, onBack }: Props) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string[]>(['en']);

  // Изучать свой же родной язык бессмысленно — убираем его из списка выбора.
  const options = useMemo(
    () => TOP_LANGUAGES.filter((l) => l.code !== nativeLanguage),
    [nativeLanguage]
  );

  const toggle = (code: string) => {
    setSelected((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= MAX_TARGET_LANGUAGES) {
        Alert.alert('Можно выбрать до 3 языков', 'Сначала уберите один из выбранных, чтобы добавить другой.');
        return prev;
      }
      return [...prev, code];
    });
  };

  const renderOption = (lang: (typeof TOP_LANGUAGES)[number]) => {
    const active = selected.includes(lang.code);
    return (
      <Pressable
        key={lang.code}
        onPress={() => toggle(lang.code)}
        style={[
          styles.option,
          {
            borderColor: active ? colors.primary : colors.border,
            backgroundColor: active ? `${colors.primary}0D` : colors.surface,
          },
        ]}
      >
        <View
          style={[
            styles.optionIcon,
            { backgroundColor: active ? colors.primary : `${colors.surface}99` },
          ]}
        >
          <Text style={styles.optionFlag}>{lang.flag}</Text>
        </View>
        <View style={styles.optionText}>
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            {lang.label}
          </Text>
        </View>
        <View
          style={[
            styles.optionRadio,
            {
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? colors.primary : 'transparent',
            },
          ]}
        >
          {active && <Ionicons name="checkmark" size={14} color={colors.textInverse} />}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.shell,
          { backgroundColor: colors.background, shadowColor: colors.shadow, borderColor: colors.border },
        ]}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.backHit}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text variant="h3" align="center" style={{ flex: 1, color: colors.textPrimary }}>
            Flashly
          </Text>
          <View style={styles.backHit} />
        </View>

        {/* Progress */}
        <View style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text variant="bodySmall" color="primary">
              Шаг 4 из 6
            </Text>
            <Text variant="bodySmall" color="secondary">
              67%
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: '67%' }]} />
          </View>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headlineBlock}>
            <Text variant="h1" style={[styles.headline, { color: colors.textPrimary }]}>
              Какие языки хотите учить?
            </Text>
            <Text variant="body" color="secondary" style={styles.bodyText}>
              Выберите от 1 до 3 языков — можно изменить позже в настройках.
            </Text>
          </View>

          <View style={styles.options}>{options.map(renderOption)}</View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Button
            title="Продолжить"
            onPress={() => onContinue?.(selected)}
            disabled={selected.length === 0}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },
  backHit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBlock: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    paddingBottom: spacing.l,
    gap: spacing.s,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBar: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  content: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.xl,
    paddingTop: spacing.l,
    gap: spacing.l,
  },
  headlineBlock: {
    gap: spacing.s,
  },
  headline: {
    letterSpacing: -0.4,
  },
  bodyText: {
    lineHeight: 22,
  },
  options: {
    gap: spacing.s,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderWidth: 2,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionFlag: {
    fontSize: 22,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
});
