/**
 * Сдача задания в веб-кабинете (/courses/:id/homework/:homeworkId). Те же данные и правила, что у
 * экрана телефона TeacherHomeworkScreen (screens/teacherHomework/homeworkStatus.ts): сколько сдали,
 * срок, «закреплено», ученики со статусом и оценкой, «Напомнить», «Оценки в Excel»,
 * «Изменить срок», «Отменить задание». Отменённое — только просмотр и Excel.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ban, CalendarClock, ChevronRight, Download, Send, Trash2 } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge, Chip, type BadgeTone } from '@/components/ui/Controls';
import { Dialog } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/Toast';
import { dueRelative, formatDue, type HomeworkStatusData } from '@/services/homework';
import { cancelHomeworkMessage } from '@/components/teacher/teacherHomework';
import { duePresets, rescheduleStart } from '@/components/teacher/newHomework';
import {
  fixedText,
  homeworkCounts,
  homeworkHeaderSubtitle,
  homeworkHeaderTitle,
  remindButtonText,
  remindableIds,
  sortHomeworkRows,
  statusLabel,
  type RowTone,
} from '@/screens/teacherHomework/homeworkStatus';
import { describeApiError } from '../api';
import { navigate } from '../router';
import { useCourses } from '../data/CoursesContext';
import { HomeworkData, downloadBase64 } from '../data/homework';
import { useLoad } from '../useLoad';
import { ConfirmDialog } from '../ui/dialogs';
import { useSingleFlight } from '../ui/useSingleFlight';
import { ErrorPage, LoadingPage } from '../ui/states';
import { Avatar, PageHeader, SectionLabel, StatTile } from '../ui/kit';
import { DueInput } from '../courses/DueInput';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const TONE: Record<RowTone, BadgeTone> = {
  success: 'success',
  warning: 'warning',
  muted: 'neutral',
};

export function HomeworkPage({ courseId, homeworkId }: { courseId: string; homeworkId: string }) {
  const colors = useThemeColors();
  const { courses } = useCourses();
  const loaded = useLoad(() => HomeworkData.status(homeworkId), [homeworkId]);
  const [local, setLocal] = useState<HomeworkStatusData | null>(null);
  const data = local ?? loaded.data;

  const [reminding, setReminding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const once = useSingleFlight();

  const rows = useMemo(() => (data ? sortHomeworkRows(data.students) : []), [data]);
  const counts = useMemo(() => homeworkCounts(data?.students ?? []), [data]);
  const toRemind = useMemo(() => remindableIds(data?.students ?? []), [data]);

  if (loaded.error && !data) return <ErrorPage error={loaded.error} onRetry={loaded.reload} />;
  if (!data) return <LoadingPage />;

  const hw = data.homework;
  const courseTitle = courses?.find((c) => c.id === courseId)?.title ?? '';
  const canceled = hw.canceled;
  const fixed = fixedText(data.students, hw.words);
  const back = { label: courseTitle || 'Курс', path: `/courses/${courseId}?tab=homework` };

  const reload = async () => {
    try {
      setLocal(await HomeworkData.status(homeworkId));
    } catch {
      // не обновилось — останется прежний вид
    }
  };

  const remind = () =>
    void once(async () => {
      if (toRemind.length === 0) return;
      setReminding(true);
      try {
        const res = await HomeworkData.remind(homeworkId, toRemind);
        toast.success(
          res.reminded > 0
            ? `Напомнили: ${res.reminded}`
            : 'Всем уже напомнили сегодня — следующее напоминание завтра'
        );
        await reload();
      } catch (e) {
        toast.error(describeApiError(e));
      }
      setReminding(false);
    });

  const exportXlsx = () =>
    void once(async () => {
      setExporting(true);
      try {
        const file = await HomeworkData.exportXlsx(homeworkId);
        downloadBase64(file.filename, file.base64, XLSX);
      } catch (e) {
        toast.error(`Не получилось выгрузить оценки. ${describeApiError(e)}`);
      }
      setExporting(false);
    });

  const saveDue = async (due: Date): Promise<boolean> => {
    try {
      const dueAt = await HomeworkData.due(homeworkId, due.toISOString());
      setLocal({ ...data, homework: { ...hw, dueAt } });
      toast.success(`Новый срок: ${formatDue(dueAt)}`);
      return true;
    } catch (e) {
      toast.error(`Не получилось перенести срок. ${describeApiError(e)}`);
      return false;
    }
  };

  const cancel = async () => {
    setCanceling(true);
    setCancelError(null);
    try {
      await HomeworkData.cancel(homeworkId);
      toast.success('Задание отменено');
      navigate(`/courses/${courseId}?tab=homework`, { replace: true });
    } catch (e) {
      setCancelError(describeApiError(e));
      setCanceling(false);
    }
  };

  return (
    <View>
      <PageHeader
        title={homeworkHeaderTitle(data)}
        subtitle={homeworkHeaderSubtitle(courseTitle, hw.minScore)}
        back={back}
        actions={
          <>
            <Button
              variant="secondary"
              size="s"
              icon={Download}
              title="Оценки в Excel"
              loading={exporting}
              onPress={exportXlsx}
            />
            {!canceled ? (
              <>
                <Button
                  variant="secondary"
                  size="s"
                  icon={CalendarClock}
                  title="Изменить срок"
                  onPress={() => setDueOpen(true)}
                />
                <Button
                  variant="quiet"
                  tone="secondary"
                  size="s"
                  icon={Trash2}
                  title="Отменить"
                  onPress={() => {
                    setCancelError(null);
                    setCancelOpen(true);
                  }}
                />
              </>
            ) : null}
          </>
        }
      />

      <View style={{ gap: spacing.l }}>
        {canceled ? (
          <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
            <Ban size={16} color={colors.textSecondary} />
            <Text variant="bodySmall" color="secondary" style={{ flex: 1 }}>
              Задание отменено — ученики его не видят. Оценки сдавших сохранены.
            </Text>
          </View>
        ) : null}

        <View style={styles.tiles}>
          <StatTile value={`${counts.submitted}/${counts.total}`} label="Сдали" tone="success" />
          <StatTile value={counts.inProgress} label="В процессе" tone="warning" />
          <StatTile value={counts.notStarted} label="Не начали" />
          <Card style={{ flex: 1, minWidth: 200, gap: spacing.xxs }}>
            <Text variant="h3" style={{ color: colors.homeworkText }}>
              {formatDue(hw.dueAt)}
            </Text>
            <Text variant="bodySmall" color="secondary">
              Срок · {dueRelative(hw.dueAt)}
            </Text>
          </Card>
        </View>

        {fixed ? (
          <Text variant="bodySmall" color="secondary">
            {fixed}
          </Text>
        ) : null}

        <View style={{ gap: spacing.s }}>
          <View style={styles.listHead}>
            <SectionLabel>Ученики</SectionLabel>
            {!canceled ? (
              <Button
                size="s"
                icon={Send}
                title={
                  toRemind.length > 0 ? remindButtonText(toRemind.length) : 'Всем уже напомнили'
                }
                disabled={toRemind.length === 0}
                loading={reminding}
                onPress={remind}
              />
            ) : null}
          </View>
          {rows.length === 0 ? (
            <Text variant="body" color="secondary">
              В курсе пока нет учеников
            </Text>
          ) : (
            <Card padding="none">
              {rows.map((s, i) => {
                const label = statusLabel(s, hw.words, hw.minScore);
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="link"
                    accessibilityLabel={`${s.displayName}, ${label.text}`}
                    onPress={() => navigate(`/courses/${courseId}/students/${s.id}`)}
                    style={(state) => [
                      styles.row,
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                      (state as { hovered?: boolean }).hovered && {
                        backgroundColor: colors.surfaceMuted,
                      },
                    ]}
                  >
                    <Avatar name={s.displayName} size={32} />
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {s.displayName}
                    </Text>
                    {s.remindedAt && s.status !== 'submitted' ? (
                      <Text variant="caption" color="tertiary">
                        напомнили {formatDue(s.remindedAt).slice(0, 5)}
                      </Text>
                    ) : null}
                    <Badge label={label.text} tone={TONE[label.tone]} />
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </Pressable>
                );
              })}
            </Card>
          )}
        </View>
      </View>

      <DueDialog
        visible={dueOpen}
        dueAt={hw.dueAt}
        onClose={() => setDueOpen(false)}
        onSave={async (d) => {
          if (await saveDue(d)) setDueOpen(false);
        }}
      />
      <ConfirmDialog
        visible={cancelOpen}
        title="Отменить задание?"
        message={cancelHomeworkMessage(counts.submitted, counts.total)}
        confirmText="Отменить задание"
        destructive
        busy={canceling}
        error={cancelError}
        onConfirm={() => void cancel()}
        onClose={() => setCancelOpen(false)}
      />
    </View>
  );
}

/** «Изменить срок»: быстрые варианты и поле даты; прошедший срок не сохранить */
function DueDialog({
  visible,
  dueAt,
  onClose,
  onSave,
}: {
  visible: boolean;
  dueAt: string;
  onClose: () => void;
  onSave: (d: Date) => Promise<void>;
}) {
  const [due, setDue] = useState(() => rescheduleStart(dueAt, new Date()));
  const [saving, setSaving] = useState(false);
  React.useEffect(() => {
    if (visible) setDue(rescheduleStart(dueAt, new Date()));
  }, [visible, dueAt]);
  const presets = useMemo(() => duePresets(new Date(), null), [visible]);
  const past = due.getTime() <= Date.now();
  return (
    <Dialog
      visible={visible}
      onClose={saving ? () => {} : onClose}
      title="Изменить срок"
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s }}>
          <Button variant="quiet" tone="secondary" title="Отмена" onPress={onClose} />
          <Button
            title="Сохранить"
            loading={saving}
            disabled={past}
            onPress={async () => {
              setSaving(true);
              await onSave(due);
              setSaving(false);
            }}
          />
        </View>
      }
    >
      <View style={{ paddingHorizontal: spacing.m, gap: spacing.s }}>
        <View style={styles.chips}>
          {presets.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={p.date.getTime() === due.getTime()}
              onPress={() => setDue(p.date)}
            />
          ))}
        </View>
        <DueInput value={due} onChange={setDue} />
        <Text variant="caption" color={past ? 'error' : 'secondary'}>
          {past
            ? 'Срок уже прошёл — выбери позже'
            : `Ученики увидят новый срок: ${formatDue(due)} · ${dueRelative(due)}`}
        </Text>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.s,
    borderRadius: borderRadius.m,
  },
});
