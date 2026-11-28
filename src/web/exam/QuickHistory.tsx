/** «Быстрые тесты» курса: завершённые, новые первыми (plan/new/web_cabinet.md, Web 26) */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { navigate } from '../router';
import { QuickData } from '../data/live';
import { useLoad } from '../useLoad';
import { SectionLabel } from '../ui/kit';
import { useShowMore } from '../ui/useShowMore';
import { historyTitle, onlyQuick } from './quickLogic';

export function QuickHistory({ courseId }: { courseId: string }) {
  const colors = useThemeColors();
  const list = useLoad(() => QuickData.history(courseId).then(onlyQuick), [courseId]);
  const more = useShowMore(list.data?.length ?? 0);
  // Ошибка или пусто — раздел просто не показываем: основное на вкладке — экзамены
  if (!list.data || list.data.length === 0) return null;
  return (
    <View style={{ gap: spacing.s }}>
      <SectionLabel>Быстрые тесты</SectionLabel>
      <Card padding="none">
        {list.data.slice(0, more.shown).map((it, i) => (
          <Pressable
            key={it.sessionId}
            accessibilityRole="link"
            accessibilityLabel={`${historyTitle(it)}. Средний результат ${it.avgScore}%`}
            onPress={() => navigate(`/tests/${it.sessionId}`)}
            style={(state) => [
              styles.row,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="body" numberOfLines={1}>
                {historyTitle(it)}
              </Text>
              <Text variant="caption" color="secondary">
                {it.participantCount} сдавали · средний результат {it.avgScore}%
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textTertiary} />
          </Pressable>
        ))}
      </Card>
      {more.hasMore ? (
        <Button
          variant="quiet"
          size="s"
          title={`Показать ещё ${more.next}`}
          onPress={more.showMore}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
});
