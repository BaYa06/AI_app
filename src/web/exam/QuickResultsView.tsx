/**
 * Итоги быстрого теста (plan/new/web_cabinet.md, Web 26): средний результат, таблица учеников с местами,
 * самые трудные слова, «не пришли», таблица CSV. Оценки учителем и разбора вопросов у быстрого теста нет.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Download } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge, ProgressBar } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import { QuickData } from '../data/live';
import { useLoad } from '../useLoad';
import { Avatar, PageHeader, SectionLabel } from '../ui/kit';
import { ErrorPage, LoadingPage } from '../ui/states';
import { csvFilename, scoreTone } from './resultsLogic';
import { leftLabel, quickCsv, ranks } from './quickLogic';
import { downloadText } from './download';
import { useShowMore } from '../ui/useShowMore';

export function QuickResultsView({ sessionId }: { sessionId: string }) {
  const colors = useThemeColors();
  const results = useLoad(() => QuickData.results(sessionId), [sessionId]);
  const data = results.data;
  const more = useShowMore(data?.participants.length ?? 0);

  if (results.error && !data) return <ErrorPage error={results.error} onRetry={results.reload} />;
  if (!data) return <LoadingPage />;

  const place = ranks(data.participants);
  const exportCsv = () => {
    downloadText(
      csvFilename(data.setTitle, data.date).replace('экзамен-', 'тест-'),
      quickCsv(data, ''),
      'text/csv;charset=utf-8'
    );
    toast.success('Таблица скачана');
  };

  return (
    <View>
      <PageHeader
        title="Итоги теста"
        subtitle={`${data.setTitle} · ${new Date(data.date).toLocaleDateString('ru-RU')}`}
        back={{ label: 'Обзор', path: '/' }}
        actions={
          <Button
            variant="secondary"
            size="s"
            icon={Download}
            title="Таблица"
            onPress={exportCsv}
          />
        }
      />
      <View style={styles.tiles}>
        <Card style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="caption" color="secondary">
            Средний результат
          </Text>
          <Text variant="display">{data.avgScore}%</Text>
          <Text variant="caption" color="secondary">
            {data.participants.length} сдавали · {data.totalQuestions} вопросов
          </Text>
        </Card>
      </View>

      <View style={styles.layout}>
        <View style={{ flex: 1, gap: spacing.s, minWidth: 0 }}>
          <SectionLabel>Ученики</SectionLabel>
          <Card padding="none">
            {data.participants.length === 0 ? (
              <Text variant="body" color="secondary" style={{ padding: spacing.m }}>
                Никто не сдавал этот тест.
              </Text>
            ) : (
              data.participants.slice(0, more.shown).map((p, i) => {
                const tone = scoreTone(p.score);
                const color =
                  tone === 'success'
                    ? colors.successText
                    : tone === 'error'
                      ? colors.errorText
                      : colors.textPrimary;
                return (
                  <View
                    key={`${p.userId ?? p.name}-${i}`}
                    style={[
                      styles.row,
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <Text variant="label" color="secondary" style={{ width: 28 }}>
                      {place[i]}
                    </Text>
                    <Avatar name={p.name} size={36} />
                    <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
                      <View style={styles.nameLine}>
                        <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {p.name}
                        </Text>
                        {p.leftReason ? (
                          <Badge label={leftLabel(p.leftReason).toLowerCase()} tone="warning" />
                        ) : null}
                        {!p.leftReason && (p.awayCount ?? 0) > 0 ? (
                          <Badge label={`выходил ×${p.awayCount}`} tone="warning" />
                        ) : null}
                      </View>
                      <ProgressBar
                        animated={false}
                        progress={p.total ? (p.correct / p.total) * 100 : 0}
                        color={tone === 'error' ? colors.error : colors.success}
                      />
                    </View>
                    <Text variant="caption" color="secondary" style={{ width: 72 }} align="right">
                      {p.correct} из {p.total}
                    </Text>
                    <Text variant="h3" style={{ color, width: 64 }} align="right">
                      {p.score}%
                    </Text>
                  </View>
                );
              })
            )}
          </Card>
          {more.hasMore ? (
            <Button
              variant="quiet"
              size="s"
              title={`Показать ещё ${more.next}`}
              onPress={more.showMore}
            />
          ) : null}
          {(data.absent ?? []).length > 0 ? (
            <Text variant="bodySmall" color="secondary">
              Не пришли: {data.absent!.map((a) => a.name).join(', ')}
            </Text>
          ) : null}
        </View>

        <View style={{ width: 340, gap: spacing.s }}>
          <SectionLabel>Самые трудные слова</SectionLabel>
          <Card padding="none">
            {data.hardestCards.length === 0 ? (
              <Text variant="bodySmall" color="secondary" style={{ padding: spacing.m }}>
                Ошибок почти не было.
              </Text>
            ) : (
              data.hardestCards.map((c, i) => (
                <View
                  key={c.word}
                  style={[
                    styles.hard,
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {c.word}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {c.hint}
                    </Text>
                  </View>
                  <Text variant="bodySmall" style={{ color: colors.warningText }}>
                    ошиблись {c.missed} из {c.total}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.m, marginBottom: spacing.l },
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  hard: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, padding: spacing.m },
});
