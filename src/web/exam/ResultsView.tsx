/**
 * Итоги экзамена (plan/new/web_cabinet.md, Web 23; макеты E7 «Ученики» и E8 «Слова»): средний балл,
 * распределение, подозрительные вопросы, ученики и слова. Действия: открыть результаты ученикам,
 * домашка по ошибкам, таблица CSV, пересдача. Главная кнопка одна — «Открыть результаты ученикам».
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, BookOpenCheck, ChevronRight, Download, Repeat2 } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge, ProgressBar } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import { FORMAT_LABELS } from '@/screens/exam/examConfig';
import type { ResultStudent, Verdict } from '@/services/exam';
import { describeApiError } from '../api';
import { navigate, useQuery } from '../router';
import { ExamData } from '../data/exam';
import { useLoad } from '../useLoad';
import { ConfirmDialog } from '../ui/dialogs';
import { Avatar, PageHeader, TabBar } from '../ui/kit';
import { ErrorPage, LoadingPage } from '../ui/states';
import { downloadText } from './download';
import { useShowMore } from '../ui/useShowMore';
import { useSingleFlight } from '../ui/useSingleFlight';
import {
  VERDICT_CHIP,
  VERDICT_ORDER,
  csvFilename,
  distributionMax,
  errorCount,
  homeworkDue,
  resultsCsv,
  scoreTone,
  sortWords,
  studentsWithErrors,
  suspiciousWords,
} from './resultsLogic';

type Tab = 'students' | 'words';
const TABS = [
  { key: 'students' as Tab, label: 'Ученики' },
  { key: 'words' as Tab, label: 'Слова' },
];
const HOMEWORK_DAYS = 3;

export function ResultsView({ sessionId }: { sessionId: string }) {
  const colors = useThemeColors();
  const results = useLoad(() => ExamData.results(sessionId), [sessionId]);
  // Название курса нужно только для таблицы; не вышло загрузить — таблица без него
  const list = useLoad(() => ExamData.list().catch(() => []), []);
  const tab = (useQuery().get('tab') === 'words' ? 'words' : 'students') as Tab;

  const once = useSingleFlight();
  const studentsMore = useShowMore(results.data?.students.length ?? 0);
  const [confirm, setConfirm] = useState<'release' | 'homework' | 'retake' | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const data = results.data;
  const courseTitle = list.data?.find((e) => e.sessionId === sessionId)?.courseTitle ?? '';
  const words = useMemo(() => (data ? sortWords(data.words) : []), [data]);
  const warnings = useMemo(() => (data ? suspiciousWords(data.words) : []), [data]);

  if (results.error && !data) return <ErrorPage error={results.error} onRetry={results.reload} />;
  if (!data) return <LoadingPage />;

  const withErrors = studentsWithErrors(data);
  const maxDist = distributionMax(data.distribution);

  const run = (kind: 'release' | 'homework' | 'retake') => once(() => runOnce(kind));
  const runOnce = async (kind: 'release' | 'homework' | 'retake') => {
    setBusy(true);
    setDialogError(null);
    try {
      if (kind === 'release') {
        await ExamData.release(sessionId);
        toast.success('Результаты открыты');
        results.reload();
      } else if (kind === 'homework') {
        const r = await ExamData.homework(
          sessionId,
          homeworkDue(new Date(), HOMEWORK_DAYS).toISOString()
        );
        toast.success(`Задания отправлены: ${r.created}`);
      } else {
        const id = await ExamData.retake(sessionId);
        navigate(`/exams/${id}`);
      }
      setConfirm(null);
    } catch (e) {
      setDialogError(describeApiError(e));
    }
    setBusy(false);
  };

  const keep = async (itemId: string) => {
    try {
      await ExamData.decide(sessionId, itemId, 'keep');
      results.reload();
    } catch (e) {
      toast.error(describeApiError(e));
    }
  };

  const exportCsv = () => {
    downloadText(
      csvFilename(data.setTitle, data.date),
      resultsCsv(data, courseTitle),
      'text/csv;charset=utf-8'
    );
    toast.success('Таблица скачана');
  };

  const askHomework = () => {
    if (withErrors === 0) toast.info('Ошибок нет — домашка не нужна');
    else setConfirm('homework');
  };

  const subtitle = [courseTitle, data.setTitle, new Date(data.date).toLocaleDateString('ru-RU')]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <PageHeader
        title="Итоги экзамена"
        subtitle={subtitle}
        back={{ label: 'Экзамены', path: '/exams' }}
        actions={
          <>
            <Button
              variant="secondary"
              size="s"
              icon={Download}
              title="Таблица"
              onPress={exportCsv}
            />
            <Button
              variant="secondary"
              size="s"
              icon={BookOpenCheck}
              title="Домашка по ошибкам"
              onPress={askHomework}
            />
            <Button
              variant="secondary"
              size="s"
              icon={Repeat2}
              title="Пересдача"
              onPress={() => setConfirm('retake')}
            />
            {data.released ? (
              <Badge label="Результаты открыты ученикам" tone="success" />
            ) : (
              <Button
                size="s"
                title="Открыть результаты ученикам"
                onPress={() => setConfirm('release')}
              />
            )}
          </>
        }
      />

      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Text variant="caption" color="secondary">
            Средний балл
          </Text>
          <View style={styles.baseline}>
            <Text variant="display">{data.avgScore}</Text>
            <Text variant="label" color="secondary">
              / 100
            </Text>
          </View>
          <Text variant="caption" color="secondary">
            {data.students.length} сдавали · {data.totalQuestions} слов
          </Text>
        </Card>
        <Card style={[styles.tile, { flex: 2 }]}>
          <Text variant="caption" color="secondary">
            Распределение баллов
          </Text>
          <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
            {data.distribution.map((d) => (
              <View key={d.label} style={styles.dist}>
                <Text variant="caption" color="secondary" style={{ width: 64 }}>
                  {d.label}
                </Text>
                <View style={{ flex: 1 }}>
                  <ProgressBar animated={false} progress={(d.n / maxDist) * 100} />
                </View>
                <Text variant="caption" style={{ width: 24 }} align="right">
                  {d.n}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      {warnings.length > 0 ? (
        <View style={styles.section}>
          {warnings.map((w) => (
            <Card
              key={w.itemId}
              style={{
                backgroundColor: alpha(colors.warning, 10),
                borderColor: alpha(colors.warning, 40),
              }}
            >
              <View style={styles.warnRow}>
                <AlertTriangle size={20} color={colors.warningText} />
                <Text variant="bodySmall" style={{ flex: 1, color: colors.warningText }}>
                  «{w.prompt}»: ошиблись {w.wrong} из {w.answered}. Посмотри, что ответили ученики,
                  прежде чем решать.
                </Text>
                <Button
                  variant="secondary"
                  size="s"
                  title="Посмотреть вопрос"
                  onPress={() => navigate(`/exams/${sessionId}/questions/${w.itemId}`)}
                />
                <Button variant="quiet" size="s" title="Оставить" onPress={() => keep(w.itemId)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <TabBar
        tabs={TABS}
        active={tab}
        onChange={(t) =>
          navigate(`/exams/${sessionId}${t === 'students' ? '' : '?tab=words'}`, { replace: true })
        }
      />

      {tab === 'students' ? (
        <View style={{ gap: spacing.s }}>
          <Card padding="none">
            {data.students.length === 0 ? (
              <Text variant="body" color="secondary" style={{ padding: spacing.m }}>
                Никто не сдавал этот экзамен.
              </Text>
            ) : (
              data.students
                .slice(0, studentsMore.shown)
                .map((st, i) => (
                  <StudentRow
                    key={st.participantId}
                    st={st}
                    first={i === 0}
                    sessionId={sessionId}
                  />
                ))
            )}
          </Card>
          {studentsMore.hasMore ? (
            <Button
              variant="quiet"
              size="s"
              title={`Показать ещё ${studentsMore.next}`}
              onPress={studentsMore.showMore}
            />
          ) : null}
          {data.absent.length > 0 ? (
            <Text variant="bodySmall" color="secondary">
              Не пришли: {data.absent.map((a) => a.name).join(', ')}
            </Text>
          ) : null}
        </View>
      ) : (
        <Card padding="none">
          {words.map((w, i) => (
            <Pressable
              key={w.itemId}
              accessibilityRole="link"
              accessibilityLabel={`${w.prompt}: верно ${w.correct} из ${w.answered}. Открыть разбор`}
              onPress={() => navigate(`/exams/${sessionId}/questions/${w.itemId}`)}
              style={(state) => [
                styles.row,
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                (state as { hovered?: boolean }).hovered && {
                  backgroundColor: colors.surfaceMuted,
                },
              ]}
            >
              <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
                <Text variant="body" numberOfLines={2}>
                  {w.prompt}
                </Text>
                <Text variant="caption" color="secondary">
                  {FORMAT_LABELS[w.format]}
                </Text>
              </View>
              <View style={{ width: 220, gap: spacing.xxs }}>
                <ProgressBar
                  animated={false}
                  progress={(w.correct / Math.max(1, w.answered)) * 100}
                  color={w.correct / Math.max(1, w.answered) < 0.5 ? colors.error : colors.success}
                />
                <Text variant="caption" color="secondary">
                  верно {w.correct} из {w.answered}
                </Text>
              </View>
              <View style={styles.badges}>
                {w.voided ? <Badge label="аннулирован" tone="neutral" /> : null}
                {w.accepted.length > 0 ? <Badge label="засчитан ответ" tone="success" /> : null}
              </View>
              <ChevronRight size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </Card>
      )}

      <ConfirmDialog
        visible={confirm === 'release'}
        title="Открыть результаты ученикам?"
        message="Каждый увидит свой балл, ошибки и верные ответы. Засчитать ответ или изменить балл можно и после — ученики увидят обновлённый балл."
        confirmText="Открыть"
        busy={busy}
        error={dialogError}
        onConfirm={() => run('release')}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'homework'}
        title="Домашка по ошибкам"
        message={`Каждый из ${withErrors} учеников получит задание «повторить» из своих слов с ошибками. Срок — через ${HOMEWORK_DAYS} дня.`}
        confirmText="Отправить"
        busy={busy}
        error={dialogError}
        onConfirm={() => run('homework')}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'retake'}
        title="Пересдача"
        message="Соберём новый экзамен с теми же словами и вариантами. Порядок у учеников снова свой. Дай код тем, кто пересдаёт."
        confirmText="Собрать"
        busy={busy}
        error={dialogError}
        onConfirm={() => run('retake')}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}

/** Цвет балла: хорошо — зелёным, плохо — красным, посередине — обычным текстом */
function scoreColor(score: number, colors: ReturnType<typeof useThemeColors>): string {
  const t = scoreTone(score);
  return t === 'success'
    ? colors.successText
    : t === 'error'
      ? colors.errorText
      : colors.textPrimary;
}

function StudentRow({
  st,
  first,
  sessionId,
}: {
  st: ResultStudent;
  first: boolean;
  sessionId: string;
}) {
  const colors = useThemeColors();
  const tone: Record<Verdict, string> = {
    correct: colors.success,
    typo: colors.warning,
    wrong_form: colors.warning,
    wrong: colors.error,
    none: colors.border,
  };
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${st.name}: ${st.score} из 100, ошибок ${errorCount(st)}. Открыть карточку`}
      onPress={() => navigate(`/exams/${sessionId}/students/${st.participantId}`)}
      style={(state) => [
        styles.row,
        first ? null : { borderTopWidth: 1, borderTopColor: colors.border },
        (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <Avatar name={st.name} size={40} />
      <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
        <View style={styles.nameLine}>
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {st.name}
          </Text>
          {st.overridden ? <Badge label="балл изменён" tone="info" /> : null}
          {st.leftReason ? <Badge label="вышел из приложения" tone="warning" /> : null}
          {!st.leftReason && st.awayCount > 0 ? (
            <Badge label={`выходил ×${st.awayCount}`} tone="warning" />
          ) : null}
          {st.flags.includes('fast') ? (
            <Badge label="все ответы быстрее 2 с" tone="warning" />
          ) : null}
        </View>
        <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
          {VERDICT_ORDER.map((v) =>
            st.counts[v] ? (
              <View key={v} style={{ flex: st.counts[v], backgroundColor: tone[v] }} />
            ) : null
          )}
        </View>
        <View style={styles.counts}>
          {VERDICT_ORDER.filter((v) => st.counts[v] > 0).map((v) => (
            <View key={v} style={styles.countItem}>
              <View style={[styles.dot, { backgroundColor: tone[v] }]} />
              <Text variant="caption" color="secondary">
                {VERDICT_CHIP[v]}:{' '}
                <Text variant="caption" style={{ fontWeight: '700' }}>
                  {st.counts[v]}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.baseline}>
        <Text variant="h2" style={{ color: scoreColor(st.score, colors) }}>
          {st.score}
        </Text>
        <Text variant="caption" color="secondary">
          /100
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.m, marginBottom: spacing.l, alignItems: 'stretch' },
  tile: { flex: 1, gap: spacing.xxs },
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs },
  dist: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  section: { gap: spacing.s, marginBottom: spacing.l },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  bar: { height: 8, borderRadius: borderRadius.full, overflow: 'hidden', flexDirection: 'row' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  badges: { flexDirection: 'row', gap: spacing.xs, width: 190, justifyContent: 'flex-end' },
});
