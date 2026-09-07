/**
 * StudyModeSheet
 * @description Единая шторка выбора режима изучения — общий источник правды для Home и Set Detail
 * экранов (раньше была продублирована в обоих и успела разойтись по функциональности).
 * Полностью анимируется на UI-потоке через Reanimated и монтирует контент только когда видима,
 * размонтируя его после завершения анимации закрытия — это устраняет исходный источник "жора"
 * при открытии (тяжёлое монтирование ~50 элементов одновременно с JS-driven анимацией).
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Puzzle, ClipboardList, Type, Headphones, BookOpenCheck } from 'lucide-react-native';
import { useThemeColors, useSettingsStore } from '@/store';
import { Text } from '@/components/common';
import { ToggleSwitch } from '@/components/common/ToggleSwitch';
import { spacing, borderRadius } from '@/constants';
import { GameRow } from './GameRow';
import { RecommendedModeCard } from './RecommendedModeCard';

export type StudyMode = 'classic' | 'match' | 'multipleChoice' | 'wordBuilder' | 'audio' | 'contextFill';
export type WordLimit = '10' | '20' | '30' | 'all';

export interface StudyModeGame {
  mode: StudyMode;
  // lucide-react-native's icon component type isn't exported, so this stays loosely typed
  icon: React.ComponentType<any>;
  title: string;
  tag: string;
  description: string;
}

export const DEFAULT_STUDY_MODE_GAMES: StudyModeGame[] = [
  { mode: 'match', icon: Puzzle, title: 'Match', tag: 'Быстро', description: 'Сопоставление слов и переводов' },
  { mode: 'multipleChoice', icon: ClipboardList, title: 'Multiple Choice', tag: 'Лёгко', description: 'Выбери правильный из 4 вариантов' },
  { mode: 'wordBuilder', icon: Type, title: 'Word Builder', tag: 'Правописание', description: 'Собери слово из букв' },
  { mode: 'audio', icon: Headphones, title: 'Audio Tap', tag: 'Аудирование', description: 'Прослушай и выбери верное' },
  { mode: 'contextFill', icon: BookOpenCheck, title: 'Fill in the Blank', tag: 'Контекст', description: 'Угадай слово по примеру' },
];

export interface StudyModeSettings {
  onlyHard: boolean;
  onToggleOnlyHard: () => void;
  showMnemonic: boolean;
  onToggleShowMnemonic: () => void;
  wordLimit: WordLimit;
  onSelectWordLimit: (value: WordLimit) => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  subtitle: string;
  onSelectMode: (mode: StudyMode) => void;
  games?: StudyModeGame[];
  settings: StudyModeSettings;
}

const HIDDEN_TRANSLATE_Y = 700;
const WORD_LIMIT_OPTIONS: WordLimit[] = ['10', '20', '30', 'all'];

export function StudyModeSheet({
  visible,
  onClose,
  subtitle,
  onSelectMode,
  games = DEFAULT_STUDY_MODE_GAMES,
  settings,
}: Props) {
  const colors = useThemeColors();
  const isDarkMode = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(HIDDEN_TRANSLATE_Y);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 260 });
    } else {
      translateY.value = withTiming(HIDDEN_TRANSLATE_Y, { duration: 260, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible]);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!mounted) return null;

  const backdropColor = isDarkMode ? 'rgba(6, 8, 20, 0.65)' : 'rgba(0, 0, 0, 0.35)';
  const surfaceColor = isDarkMode ? 'rgb(32, 34, 44)' : colors.surface;
  const sheetBorderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : colors.border;
  const textPrimary = isDarkMode ? '#F8FAFC' : colors.textPrimary;
  const textSecondary = isDarkMode ? '#A8B3C1' : colors.textSecondary;
  const handleColor = isDarkMode ? '#4b5563' : '#cbd5e1';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.wrapper} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
          <ReAnimated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropColor }, backdropAnimStyle]}
          />
        </Pressable>
        <ReAnimated.View
          style={[styles.sheet, { backgroundColor: surfaceColor, borderColor: sheetBorderColor }, sheetAnimStyle]}
        >
          <View style={[styles.handle, { backgroundColor: handleColor }]} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text variant="h3" style={{ color: textPrimary }}>
                Выбор режима
              </Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text variant="body" style={{ color: textSecondary, fontWeight: '600' }}>
                  Отмена
                </Text>
              </Pressable>
            </View>
            <Text variant="caption" color="secondary">
              {subtitle}
            </Text>

            <RecommendedModeCard onPress={() => onSelectMode('classic')} />

            <View style={styles.section}>
              <Text variant="caption" color="secondary" style={styles.sectionTitle}>
                Игры для закрепления
              </Text>
              <View style={styles.gameList}>
                {games.map((game) => (
                  <GameRow
                    key={game.mode}
                    icon={game.icon}
                    title={game.title}
                    tag={game.tag}
                    description={game.description}
                    onPress={() => onSelectMode(game.mode)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text variant="caption" color="secondary" style={styles.sectionTitle}>
                Настройки
              </Text>
              <View style={styles.settingRow}>
                <Text variant="body" style={{ color: colors.textPrimary, flexShrink: 1 }}>
                  Только «Не запомнил»
                </Text>
                <ToggleSwitch value={settings.onlyHard} onToggle={settings.onToggleOnlyHard} />
              </View>
              <View style={styles.settingRow}>
                <Text variant="body" style={{ color: colors.textPrimary, flexShrink: 1 }}>
                  Показывать мнемонику после ошибки
                </Text>
                <ToggleSwitch value={settings.showMnemonic} onToggle={settings.onToggleShowMnemonic} />
              </View>
              <View style={styles.settingRow}>
                <Text variant="body" style={{ color: colors.textPrimary, flexShrink: 1 }}>
                  Количество слов
                </Text>
                <View style={styles.wordChips}>
                  {WORD_LIMIT_OPTIONS.map((val) => (
                    <Pressable
                      key={val}
                      onPress={() => settings.onSelectWordLimit(val)}
                      style={[
                        styles.wordChip,
                        {
                          backgroundColor: settings.wordLimit === val ? colors.primary : colors.surface,
                          borderColor: settings.wordLimit === val ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        variant="caption"
                        style={{
                          color: settings.wordLimit === val ? colors.textInverse : colors.textPrimary,
                          fontWeight: '700',
                        }}
                      >
                        {val === 'all' ? 'Все' : val}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </ReAnimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.xl,
    gap: spacing.m,
    maxHeight: '85%',
  },
  handle: {
    width: 48,
    height: 6,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
  },
  content: {
    paddingBottom: spacing.l,
    gap: spacing.l,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: {
    gap: spacing.s,
  },
  sectionTitle: {
    letterSpacing: 1,
  },
  gameList: {
    gap: spacing.s,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s,
  },
  wordChips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  wordChip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
});
