/**
 * Первые шаги учителя на главной (plan/new/new_user_activation.md, Start 6.1, 6.3).
 * Пока курса нет — «Создай первый тест за минуту»: курс с готовым набором по предмету и демо теста.
 * Дальше — чек-лист: демо → курс → пригласи учеников → проведи тест → посмотри статистику.
 */
import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, Timer, X } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import {
  TEACHER_TASK_ORDER,
  closeTeacherStart,
  isTeacherStartVisible,
  useTeacherStartStore,
  type TeacherTaskId,
} from '@/services/teacherStart';
import { Analytics } from '@/services/analytics';

const TASK_TITLES: Record<TeacherTaskId, string> = {
  demo: 'Посмотри демо живого теста',
  course: 'Создай курс',
  invite: 'Пригласи учеников',
  test: 'Проведи первый тест',
  stats: 'Посмотри статистику курса',
};

interface Props {
  /** Есть свой курс — первый тест можно запускать из него */
  hasCourse: boolean;
  /** Может быть асинхронной — кнопка покажет загрузку */
  onCreateStarterCourse: () => unknown;
  onAction: (task: TeacherTaskId) => void;
}

export const TeacherStartSection = memo(function TeacherStartSection({
  hasCourse,
  onCreateStarterCourse,
  onAction,
}: Props) {
  const colors = useThemeColors();
  const state = useTeacherStartStore();
  const [creating, setCreating] = useState(false);
  if (!isTeacherStartVisible(state)) return null;

  const done = new Set(state.done);
  if (hasCourse) done.add('course');
  const next = TEACHER_TASK_ORDER.find((t) => !done.has(t));

  return (
    <View style={styles.wrap}>
      {!hasCourse && (
        <View
          style={[
            styles.hero,
            { backgroundColor: alpha(colors.primary, 10), borderColor: colors.primary },
          ]}
        >
          <View style={styles.heroHead}>
            <Timer size={iconSize.m} color={colors.primary} />
            <Text variant="h3" style={[styles.flex, { color: colors.textPrimary }]}>
              Создай первый тест за минуту
            </Text>
          </View>
          <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
            Соберём курс «Мой первый курс» с готовым набором по твоему предмету. Останется
            пригласить учеников и запустить тест.
          </Text>
          <Button
            title="Создать курс с набором"
            loading={creating}
            onPress={async () => {
              setCreating(true);
              try {
                await onCreateStarterCourse();
              } finally {
                setCreating(false);
              }
            }}
            fullWidth
          />
          <Button
            title="Сначала посмотреть демо теста"
            variant="quiet"
            onPress={() => onAction('demo')}
            fullWidth
          />
        </View>
      )}

      <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.listHead}>
          <Text variant="overline" color="secondary">
            Первые шаги
          </Text>
          <View style={styles.headRight}>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              {done.size} из {TEACHER_TASK_ORDER.length}
            </Text>
            <Button
              variant="icon"
              icon={X}
              background="none"
              iconSize={iconSize.xs}
              iconColor={colors.textTertiary}
              accessibilityLabel="Скрыть «Первые шаги»"
              onPress={closeTeacherStart}
            />
          </View>
        </View>
        {TEACHER_TASK_ORDER.map((task) => {
          const isDone = done.has(task);
          const isNext = task === next;
          // «Курс» без курса — это кнопка выше; остальное без курса недоступно
          const disabled = isDone || (!hasCourse && task !== 'demo');
          return (
            <Pressable
              key={task}
              disabled={disabled}
              onPress={() => {
                Analytics.teacherStartTaskAction(task);
                onAction(task);
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled, checked: isDone }}
              style={styles.row}
            >
              <View
                style={[
                  styles.dot,
                  isDone
                    ? { backgroundColor: colors.success, borderColor: colors.success }
                    : { borderColor: colors.border },
                ]}
              >
                {isDone ? <Check size={12} color={colors.onPrimary} strokeWidth={3} /> : null}
              </View>
              <Text
                variant="bodySmall"
                style={[
                  styles.flex,
                  {
                    color: isDone ? colors.textTertiary : colors.textPrimary,
                    fontWeight: isNext ? '600' : '400',
                  },
                  isDone && styles.strike,
                ]}
              >
                {TASK_TITLES[task]}
              </Text>
              {isNext && !disabled ? (
                <ChevronRight size={iconSize.s} color={colors.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.s },
  flex: { flex: 1 },
  hero: { borderWidth: 2, borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.s },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  list: { borderWidth: 1, borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.xs },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headRight: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, minHeight: 36 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strike: { textDecorationLine: 'line-through' },
});
