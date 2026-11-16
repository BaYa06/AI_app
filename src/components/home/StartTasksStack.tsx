/**
 * Стопка «Начало пути» на главной (plan/new/new_user_activation.md, Start 3.2).
 *
 * Видна одна карточка, под ней края следующих двух. «Позже» убирает карточку под низ стопки,
 * кнопка задания ведёт к действию (выполненным оно станет само, по событию). Награда «+10»
 * алмазов — на каждой карточке. Кнопки не залиты: стопка не спорит с «Уроком дня».
 */
import React, { memo, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutLeft, useReducedMotion } from 'react-native-reanimated';
import {
  Bell,
  Camera,
  Folder,
  Gem,
  LayoutGrid,
  Layers,
  Library,
  Mic,
  PartyPopper,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button, type IconComponent } from '@/components/ui';
import { useStartTasksStore, useThemeColors } from '@/store';
import {
  isStartTasksFinished,
  startTaskUniverse,
  isStartTasksVisible,
  type StartTaskId,
} from '@/store/startTasksStore';
import { Analytics } from '@/services/analytics';
import { triggerHaptic } from '@/utils/haptic';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';

interface TaskMeta {
  icon: IconComponent;
  title: string;
  description: string;
  action: string;
}

export const START_TASK_META: Record<Exclude<StartTaskId, 'first_lesson'>, TaskMeta> = {
  session: {
    icon: Layers,
    title: 'Пройди первую сессию',
    description: 'Тест и «Собери слово» по набору «Первые слова»',
    action: 'Начать',
  },
  photo: {
    icon: Camera,
    title: 'Сделай набор из фото',
    description: 'Сфоткай страницу учебника, набор создастся сам',
    action: 'Сфоткать',
  },
  library: {
    icon: Library,
    title: 'Добавь набор из библиотеки',
    description: 'Готовые наборы по темам и учебникам, бесплатно',
    action: 'Открыть',
  },
  course: {
    icon: Folder,
    title: 'Создай свой курс',
    description:
      'Курс — папка для наборов: «Школа», «IELTS», «Работа». Наборы разных тем не смешиваются',
    action: 'Создать',
  },
  push: {
    icon: Bell,
    title: 'Включи напоминания',
    description: 'Напомним, когда слова начнут забываться',
    action: 'Включить',
  },
  widget: {
    icon: LayoutGrid,
    title: 'Добавь виджет',
    description: 'Слово дня на экране «Домой»',
    action: 'Добавить',
  },
  voice: {
    icon: Mic,
    title: 'Проверь произношение',
    description: 'Скажи слово вслух, мы проверим',
    action: 'Проверить',
  },
};

/** Виджет — только iPhone с iOS 16+ */
const WIDGET_SUPPORTED = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 16;

interface Props {
  /** Задание, которое не показываем на этом устройстве или для этого ученика */
  hidden?: StartTaskId[];
  onAction: (task: StartTaskId) => void;
}

export const StartTasksStack = memo(function StartTasksStack({ hidden = [], onAction }: Props) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const state = useStartTasksStore();
  const { done, order, later, close } = state;

  const universe = startTaskUniverse(state);
  const tasks = useMemo(
    () =>
      order.filter(
        (t) =>
          universe.tasks.includes(t) &&
          !done.includes(t) &&
          !hidden.includes(t) &&
          (t !== 'widget' || WIDGET_SUPPORTED)
      ),
    [order, done, hidden, universe.tasks]
  );

  const finished = isStartTasksFinished(state);
  useEffect(() => {
    if (!finished) return;
    triggerHaptic('notificationSuccess');
    Analytics.startTasksFinished();
  }, [finished]);

  if (finished) {
    return (
      <View
        style={[styles.finished, { backgroundColor: alpha(colors.success, 10) }]}
        accessibilityLiveRegion="polite"
      >
        <PartyPopper size={iconSize.m} color={colors.successText} />
        <View style={styles.text}>
          <Text variant="body" style={[styles.title, { color: colors.successText }]}>
            Начало пути пройдено
          </Text>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Достижение «Хорошее начало» — ты попробовал всё главное во Flashly
          </Text>
        </View>
        <Button title="Отлично" variant="quiet" size="s" onPress={close} />
      </View>
    );
  }

  if (!isStartTasksVisible(state) || tasks.length === 0) return null;

  const doneCount =
    universe.tasks.filter((t) => done.includes(t)).length + (state.courseStudent ? 0 : 1);
  const top = tasks[0] as Exclude<StartTaskId, 'first_lesson'>;
  const meta =
    top === 'push' && state.courseStudent
      ? { ...START_TASK_META.push, description: 'Напомним о заданиях учителя до срока' }
      : START_TASK_META[top];
  const behind = Math.min(2, tasks.length - 1);
  const Icon = meta.icon;
  const animated = Platform.OS !== 'web' && !reduceMotion;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text variant="overline" color="secondary">
          Начало пути
        </Text>
        <View style={styles.headRight}>
          <Text variant="caption" style={[styles.count, { color: colors.textSecondary }]}>
            {Math.min(doneCount, universe.total)} из {universe.total}
          </Text>
          <Button
            variant="icon"
            icon={X}
            background="none"
            iconSize={iconSize.xs}
            iconColor={colors.textTertiary}
            accessibilityLabel="Скрыть «Начало пути»"
            onPress={close}
          />
        </View>
      </View>

      <View style={{ paddingBottom: behind * 9 }}>
        {/* Края следующих карточек */}
        {Array.from({ length: behind }, (_, i) => (
          <View
            key={i}
            style={[
              styles.edge,
              {
                bottom: (behind - 1 - i) * 9,
                left: (i + 1) * 10,
                right: (i + 1) * 10,
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.border,
                zIndex: -1 - i,
              },
            ]}
          />
        ))}
        <Animated.View
          key={top}
          entering={animated ? FadeInDown.duration(260) : undefined}
          exiting={animated ? FadeOutLeft.duration(220) : undefined}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: alpha(colors.primary, 10) }]}>
              <Icon size={iconSize.m} color={colors.primary} />
            </View>
            <View style={styles.text}>
              <Text variant="body" style={[styles.title, { color: colors.textPrimary }]}>
                {meta.title}
              </Text>
              <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                {meta.description}
              </Text>
            </View>
            <View
              style={[styles.reward, { backgroundColor: alpha(colors.diamond, 10) }]}
              accessible
              accessibilityLabel="Награда 10 алмазов"
            >
              <Text variant="caption" style={[styles.rewardText, { color: colors.diamond }]}>
                +10
              </Text>
              <Gem size={iconSize.xs} color={colors.diamond} />
            </View>
          </View>
          <View style={styles.actions}>
            <Button
              title={meta.action}
              variant="secondary"
              size="s"
              style={styles.flex}
              onPress={() => {
                Analytics.startTaskAction(top);
                onAction(top);
              }}
            />
            <Button title="Позже" variant="quiet" size="s" onPress={() => later(top)} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  finished: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  section: {
    gap: spacing.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  count: {
    fontVariant: ['tabular-nums'],
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.s,
  },
  edge: {
    position: 'absolute',
    height: 24,
    borderWidth: 1,
    borderRadius: borderRadius.l,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontWeight: '600',
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  rewardText: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});
