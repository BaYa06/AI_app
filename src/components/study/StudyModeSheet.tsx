/**
 * StudyModeSheet
 * @description Единая шторка выбора режима изучения — общий источник правды для Home и Set Detail
 * экранов (раньше была продублирована в обоих и успела разойтись по функциональности).
 * Оформление — общий нижний лист `Sheet` (брендбук, 7.6): анимация на нативном драйвере,
 * контент монтируется только пока лист виден или закрывается.
 * На iOS — нативная шторка (nativeStudyModeSheet.ts, plan/new/liquid_glass.md, Glass 0).
 *
 * Шторка набора (plan/new/study_session.md, решения 15–18): одна яркая кнопка сессии «Изучить»,
 * под ней тихая «Свободная практика» со всеми режимами, настройки практики — под шестерёнкой.
 * На главной кнопки сессии нет: главный путь там «Урок дня», шторка — только свободная практика.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BookOpenCheck,
  ChevronRight,
  ClipboardList,
  Headphones,
  Layers,
  Play,
  Puzzle,
  Settings,
  Type,
  X,
} from 'lucide-react-native';
import { useCardsStore, useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, Sheet, Switch, type IconComponent } from '@/components/ui';
import { alpha, borderRadius, heights, iconSize, spacing } from '@/constants';
import type { SetSessionPlan } from '@/services/LessonService';
import { GameRow } from './GameRow';
import type { SetSessionInfo } from './setSession';
import { sessionSheetMeta, sessionSheetStages, sessionSheetText } from './sessionSheetText';
import { isNativeStudyModeSheet, useNativeStudyModeSheet } from './nativeStudyModeSheet';

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
  // Режим просит сказать перевод вслух (AudioLearningScreen), а не слушать — решение 20 плана
  { mode: 'audio', icon: Headphones, title: 'Аудио', tag: 'Речь', description: 'Скажи перевод вслух за 5 секунд' },
  { mode: 'contextFill', icon: BookOpenCheck, title: 'Слово в контексте', tag: 'Контекст', description: 'Угадай слово по примеру' },
];

/** Карточки в свободной практике — раньше были отдельной карточкой «Рекомендуем» */
export const CARDS_GAME: StudyModeGame = {
  mode: 'classic',
  icon: Layers,
  title: 'Карточки',
  tag: 'Классика',
  description: 'Переверни и оцени себя',
};

export interface StudyModeSettings {
  onlyHard: boolean;
  onToggleOnlyHard: () => void;
  wordLimit: WordLimit;
  onSelectWordLimit: (value: WordLimit) => void;
}

/** Шторка набора: кнопка сессии «Изучить» */
export interface SetSheetSession {
  title: string;
  info: SetSessionInfo;
  onStart: () => void;
  onAddWords: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  subtitle: string;
  onSelectMode: (mode: StudyMode) => void;
  games?: StudyModeGame[];
  settings: StudyModeSettings;
  /** Есть — шторка набора с кнопкой сессии; нет — главная, только свободная практика */
  setSession?: SetSheetSession;
}

const WORD_LIMIT_OPTIONS: WordLimit[] = ['10', '20', '30', 'all'];

export function StudyModeSheet({ games = DEFAULT_STUDY_MODE_GAMES, ...props }: Props) {
  // Нативной шторке — вся свободная практика сразу, с Карточками
  useNativeStudyModeSheet({ ...props, games: [CARDS_GAME, ...games] });
  if (isNativeStudyModeSheet) return null;
  return <StudyModeSheetRN {...props} games={games} />;
}

function StudyModeSheetRN({
  visible,
  onClose,
  subtitle,
  onSelectMode,
  games,
  settings,
  setSession,
}: Props & { games: StudyModeGame[] }) {
  const colors = useThemeColors();
  const [view, setView] = useState<'main' | 'settings'>('main');
  // На главной свободная практика — всё содержимое шторки, поэтому сразу раскрыта
  const [freeOpen, setFreeOpen] = useState(!setSession);
  useEffect(() => {
    if (!visible) return;
    setView('main');
    setFreeOpen(!setSession);
  }, [visible]);

  const plan = setSession?.info.plan;
  const practice = useMemo(() => [CARDS_GAME, ...games], [games]);
  const isEmpty = plan?.mode === 'empty';

  const title = view === 'settings' ? 'Настройки практики' : setSession ? setSession.title : 'Свободная практика';
  const meta = setSession && plan ? sessionSheetMeta(plan) : subtitle;

  const headerRight =
    view === 'settings' ? (
      <Button variant="quiet" title="Готово" onPress={() => setView('main')} />
    ) : (
      <View style={styles.headerButtons}>
        {isEmpty ? null : (
          <Button
            variant="icon"
            icon={Settings}
            iconSize={iconSize.s}
            iconColor={colors.textSecondary}
            accessibilityLabel="Настройки практики"
            onPress={() => setView('settings')}
          />
        )}
        <Button
          variant="icon"
          icon={X}
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel="Закрыть"
          onPress={onClose}
        />
      </View>
    );

  return (
    <Sheet visible={visible} onClose={onClose} title={title} headerRight={headerRight}>
      {view === 'settings' ? (
        <View style={styles.content}>
          <View style={styles.settingRow}>
            <Text variant="body" style={[styles.flexShrink, { color: colors.textPrimary }]}>
              Только «Не запомнил»
            </Text>
            <Switch
              value={settings.onlyHard}
              onValueChange={settings.onToggleOnlyHard}
              accessibilityLabel="Только «Не запомнил»"
            />
          </View>
          <View style={styles.settingRow}>
            <Text variant="body" style={[styles.flexShrink, { color: colors.textPrimary }]}>
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
          <Text variant="caption" color="secondary">
            Действуют только на свободную практику. Сколько слов взять в сессию, приложение решает само.
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          <Text variant="bodySmall" color="secondary" style={styles.meta}>
            {meta}
          </Text>

          {setSession && plan ? <SessionButton plan={plan} session={setSession} /> : null}

          {setSession ? (
            <View style={[styles.free, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={() => setFreeOpen((v) => !v)}
                disabled={isEmpty}
                accessibilityRole="button"
                accessibilityState={{ expanded: freeOpen, disabled: isEmpty }}
                accessibilityLabel="Свободная практика"
                style={({ pressed }) => [styles.freeToggle, (pressed || isEmpty) && styles.dimmed]}
              >
                <View style={styles.flex1}>
                  <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>
                    Свободная практика
                  </Text>
                  <Text variant="caption" color="secondary">
                    {isEmpty ? 'Появится, когда добавите слова' : 'Любой режим отдельно'}
                  </Text>
                </View>
                <View style={styles.iconStack}>
                  {practice.slice(0, 5).map(({ mode, icon: Icon }, i) => (
                    <View
                      key={mode}
                      style={[
                        styles.stackIcon,
                        { backgroundColor: colors.surfaceMuted, borderColor: colors.surface },
                        i > 0 && styles.stackOverlap,
                      ]}
                    >
                      <Icon size={iconSize.xs - 2} color={colors.textSecondary} />
                    </View>
                  ))}
                </View>
                <ChevronRight
                  size={iconSize.xs}
                  color={colors.textTertiary}
                  style={freeOpen ? styles.chevronOpen : undefined}
                />
              </Pressable>
            </View>
          ) : null}

          {freeOpen && !isEmpty ? (
            <View style={styles.gameList}>
              {practice.map((game) => (
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
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

/** Главная кнопка шторки набора — единственный яркий элемент; пустой или маленький набор — подсказка */
function SessionButton({ plan, session }: { plan: SetSessionPlan; session: SetSheetSession }) {
  const colors = useThemeColors();
  const cardsMap = useCardsStore((s) => s.cards);
  const text = useMemo(() => sessionSheetText(plan, sessionSheetStages(plan, cardsMap)), [plan, cardsMap]);

  if (text.kind === 'empty') {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <Text variant="h3" align="center" style={{ color: colors.textPrimary }}>
          {text.title}
        </Text>
        <Text variant="bodySmall" align="center" color="secondary">
          {text.text}
        </Text>
        <Button title="Добавить слова" fullWidth onPress={session.onAddWords} style={styles.emptyButton} />
      </View>
    );
  }

  const { title, caption, route, stageCount } = text;

  return (
    <Pressable
      onPress={session.onStart}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${caption}. Рекомендуем`}
      style={({ pressed }) => [styles.sessionButton, { backgroundColor: colors.primaryFill }, pressed && styles.pressed]}
    >
      <View style={styles.sessionRow}>
        <View style={[styles.play, { backgroundColor: colors.onPrimary }]}>
          <Play size={iconSize.s} color={colors.primaryFill} fill={colors.primaryFill} />
        </View>
        <View style={styles.flex1}>
          <Text variant="h3" style={[styles.bold, { color: colors.onPrimary }]}>
            {title}
          </Text>
          <Text variant="bodySmall" style={[styles.onFillMuted, { color: colors.onPrimary }]}>
            {caption}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: alpha(colors.onPrimary, 20) }]}>
          <Text variant="caption" style={[styles.bold, { color: colors.onPrimary }]}>
            Рекомендуем
          </Text>
        </View>
      </View>
      <View style={styles.routeRow}>
        <View style={styles.miniSegments}>
          {Array.from({ length: stageCount }, (_, i) => (
            <View
              key={i}
              style={[styles.miniSegment, { backgroundColor: i === 0 ? colors.onPrimary : alpha(colors.onPrimary, 40) }]}
            />
          ))}
        </View>
        <Text variant="caption" numberOfLines={1} style={[styles.flex1, styles.onFillMuted, { color: colors.onPrimary }]}>
          {route}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  semibold: {
    fontWeight: '600',
  },
  bold: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  dimmed: {
    opacity: 0.6,
  },
  // Второстепенный текст на цветной заливке
  onFillMuted: {
    opacity: 0.85,
  },
  content: {
    gap: spacing.m,
    paddingBottom: spacing.m,
  },
  meta: {
    marginTop: -spacing.xs,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sessionButton: {
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    gap: spacing.s,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  play: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.s,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  miniSegments: {
    flexDirection: 'row',
    gap: 3,
  },
  miniSegment: {
    width: 14,
    height: 4,
    borderRadius: borderRadius.full,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.xl,
    padding: spacing.l,
    gap: spacing.xs,
    alignItems: 'center',
  },
  emptyButton: {
    marginTop: spacing.s,
  },
  free: {
    borderTopWidth: 1,
    paddingTop: spacing.xs,
  },
  freeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: heights.touch,
  },
  iconStack: {
    flexDirection: 'row',
  },
  stackIcon: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackOverlap: {
    marginLeft: -6,
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
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
  wordChips: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
