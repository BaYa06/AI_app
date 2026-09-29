/**
 * StudyModeSheet
 * @description Единая шторка выбора режима изучения — общий источник правды для Home и Set Detail
 * экранов (раньше была продублирована в обоих и успела разойтись по функциональности).
 * Оформление — общий нижний лист `Sheet` (брендбук, 7.6): анимация на нативном драйвере,
 * контент монтируется только пока лист виден или закрывается.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Puzzle, ClipboardList, Type, Headphones, BookOpenCheck } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, Sheet, Switch, type IconComponent } from '@/components/ui';
import { heights, spacing } from '@/constants';
import { GameRow } from './GameRow';
import { RecommendedModeCard } from './RecommendedModeCard';

export type StudyMode = 'classic' | 'match' | 'multipleChoice' | 'wordBuilder' | 'audio' | 'contextFill';
export type WordLimit = '10' | '20' | '30' | 'all';

export interface StudyModeGame {
  mode: StudyMode;
  icon: IconComponent;
  title: string;
  tag: string;
  description: string;
}

export const DEFAULT_STUDY_MODE_GAMES: StudyModeGame[] = [
  { mode: 'match', icon: Puzzle, title: 'Пары', tag: 'Быстро', description: 'Сопоставление слов и переводов' },
  { mode: 'multipleChoice', icon: ClipboardList, title: 'Тест', tag: 'Легко', description: 'Выбери правильный из 4 вариантов' },
  { mode: 'wordBuilder', icon: Type, title: 'Собери слово', tag: 'Правописание', description: 'Собери слово из букв' },
  { mode: 'audio', icon: Headphones, title: 'Аудио', tag: 'Аудирование', description: 'Прослушай и выбери верное' },
  { mode: 'contextFill', icon: BookOpenCheck, title: 'Слово в контексте', tag: 'Контекст', description: 'Угадай слово по примеру' },
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

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Выбор режима"
      headerRight={<Button variant="quiet" tone="secondary" title="Отмена" onPress={onClose} />}
    >
      <Text variant="bodySmall" color="secondary" style={styles.subtitle}>
        {subtitle}
      </Text>
      <View style={styles.content}>

        <RecommendedModeCard onPress={() => onSelectMode('classic')} />

        <View style={styles.section}>
          <Text variant="overline" color="secondary">
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
          <Text variant="overline" color="secondary">
            Настройки
          </Text>
          <View style={styles.settingRow}>
            <Text variant="body" style={[styles.settingLabel, { color: colors.textPrimary }]}>
              Только «Не запомнил»
            </Text>
            <Switch
              value={settings.onlyHard}
              onValueChange={settings.onToggleOnlyHard}
              accessibilityLabel="Только «Не запомнил»"
            />
          </View>
          <View style={styles.settingRow}>
            <Text variant="body" style={[styles.settingLabel, { color: colors.textPrimary }]}>
              Показывать мнемонику после ошибки
            </Text>
            <Switch
              value={settings.showMnemonic}
              onValueChange={settings.onToggleShowMnemonic}
              accessibilityLabel="Показывать мнемонику после ошибки"
            />
          </View>
          <View style={styles.settingRow}>
            <Text variant="body" style={[styles.settingLabel, { color: colors.textPrimary }]}>
              Количество слов
            </Text>
            <View style={styles.wordChips}>
              {WORD_LIMIT_OPTIONS.map((val) => (
                <Chip
                  key={val}
                  label={val === 'all' ? 'Все' : val}
                  selected={settings.wordLimit === val}
                  onPress={() => settings.onSelectWordLimit(val)}
                />
              ))}
            </View>
          </View>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.l,
    paddingBottom: spacing.m,
  },
  subtitle: {
    marginBottom: spacing.m,
  },
  section: {
    gap: spacing.s,
  },
  gameList: {
    gap: spacing.s,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: heights.touch,
  },
  settingLabel: {
    flexShrink: 1,
  },
  wordChips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
