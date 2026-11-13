/**
 * Карточка задания на главной ученика вместо «Урока дня» (plan/new/teacher_cabinet.md, Teacher 26;
 * макет У2). Янтарная (токен homework), обе темы. Нажатие на карточку — экран задания (У3),
 * «Продолжить» — сразу сессия по словам задания.
 */
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { Badge, Button } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import type { StudentHomework } from '@/services/homework';
import { homeworkCardTexts, teacherInitials } from './homeworkCardText';

interface Props {
  homework: StudentHomework;
  onOpen: () => void;
  onContinue: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StudentHomeworkCard({ homework, onOpen, onContinue, style }: Props) {
  const colors = useThemeColors();
  const t = homeworkCardTexts(homework);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.from}. ${t.title}. ${t.due}. ${t.progress}`}
      onPress={onOpen}
      style={({ pressed }) => [
        st.card,
        {
          borderColor: colors.homework,
          backgroundColor: alpha(colors.homework, 10),
        },
        pressed && st.pressed,
        style,
      ]}
    >
      <View style={st.top}>
        <View style={st.from}>
          <View style={[st.avatar, { backgroundColor: colors.homeworkFill }]}>
            <Text variant="caption" style={[st.bold, { color: colors.onPrimary }]}>
              {teacherInitials(homework.teacher || 'У')}
            </Text>
          </View>
          <Text
            variant="label"
            numberOfLines={1}
            style={[st.shrink, { color: colors.textPrimary }]}
          >
            {t.from}
          </Text>
        </View>
        {t.isNew && <Badge label="Новое" tone="primary" />}
      </View>
      <View>
        <Text variant="h3" style={{ color: colors.textPrimary }}>
          {t.title}
        </Text>
        <Text variant="bodySmall" style={[st.bold, { color: colors.homeworkText }]}>
          {t.due}
        </Text>
      </View>
      <View style={st.progress}>
        <View style={[st.track, { backgroundColor: colors.surface }]}>
          <View
            style={[
              st.fill,
              { width: `${Math.round(t.pct * 100)}%`, backgroundColor: colors.homework },
            ]}
          />
        </View>
        <Text variant="bodySmall" color="secondary">
          {t.progress}
        </Text>
      </View>
      <Button title={t.button} onPress={onContinue} fullWidth />
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    gap: spacing.s,
  },
  pressed: { opacity: 0.92 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  from: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  shrink: { flexShrink: 1 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: { fontWeight: '600' },
  progress: { gap: spacing.xxs },
  track: { height: 10, borderRadius: borderRadius.full, overflow: 'hidden' },
  fill: { height: 10, borderRadius: borderRadius.full },
});
