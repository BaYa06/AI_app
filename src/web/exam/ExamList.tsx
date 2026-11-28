/**
 * Список экзаменов (plan/new/web_cabinet.md, Web 12; макет E0): черновики, идущие, прошедшие.
 * Один компонент для страницы «Экзамены» и вкладки «Экзамены» курса.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, FileText } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ExamListItem } from '@/services/exam';
import { navigate } from '../router';
import { SectionLabel } from '../ui/kit';
import { Centered } from '../ui/states';
import { examGroups, examMeta, statusBadge } from './listLogic';

const TONE: Record<string, BadgeTone> = {
  neutral: 'neutral',
  primary: 'primary',
  success: 'success',
};

export function ExamList({
  items,
  showCourse,
  empty,
}: {
  items: ExamListItem[];
  showCourse: boolean;
  empty?: React.ReactNode;
}) {
  const groups = examGroups(items);
  if (items.length === 0) {
    return (
      <>
        {empty ?? (
          <Centered>
            <EmptyState
              icon={FileText}
              title="Экзаменов пока нет"
              description="Собери первый экзамен: выбери набор, число слов и форматы."
            />
          </Centered>
        )}
      </>
    );
  }
  return (
    <View style={{ gap: spacing.l }}>
      {groups.map((g) => (
        <View key={g.key} style={{ gap: spacing.s }}>
          <SectionLabel>{g.title}</SectionLabel>
          <Card padding="none">
            {g.items.map((it, i) => (
              <Row key={it.sessionId} item={it} showCourse={showCourse} first={i === 0} />
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

function Row({
  item,
  showCourse,
  first,
}: {
  item: ExamListItem;
  showCourse: boolean;
  first: boolean;
}) {
  const colors = useThemeColors();
  const badge = statusBadge(item.status);
  const title = item.setTitle || 'Экзамен';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${badge.label}`}
      onPress={() => navigate(`/exams/${item.sessionId}`)}
      style={(state) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: colors.border },
        (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text variant="body" numberOfLines={1}>
          {title}
          {showCourse && item.courseTitle ? ` · ${item.courseTitle}` : ''}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {examMeta(item)}
        </Text>
      </View>
      <View style={{ alignSelf: 'center' }}>
        <Badge label={badge.label} tone={TONE[badge.tone] ?? 'neutral'} />
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
});
