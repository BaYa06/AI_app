/**
 * Действия с заданием на экране сдачи (plan/done/teacher_cabinet.md, Teacher 57): «⋯» в шапке →
 * «Изменить срок» (карточка «до: …», быстрые варианты, барабан) и «Отменить задание» (подтверждение).
 *
 * Одно окно с тремя режимами, а не три окна подряд: на iOS новое модальное окно, открытое, пока
 * закрывается прежнее, может не показаться. Системный Alert поверх окна — по той же причине нет.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ban, CalendarClock, Clock } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, ListRow, Sheet } from '@/components/ui';
import { borderRadius, spacing } from '@/constants';
import { dueRelative } from '@/services/homework';
import { DueWheelPicker } from '@/components/teacher/DueWheelPicker';
import {
  NEW_HOMEWORK_TEXTS as T,
  dueCardText,
  duePresets,
  rescheduleStart,
} from '@/components/teacher/newHomework';
import { cancelHomeworkMessage } from '@/components/teacher/teacherHomework';

export type HomeworkActionsMode = 'menu' | 'due' | 'cancel';

/** true — действие удалось, окно закрывается */
type Done = Promise<boolean>;

interface Props {
  /** null — окно закрыто */
  mode: HomeworkActionsMode | null;
  onMode: (mode: HomeworkActionsMode | null) => void;
  title: string;
  dueAt: string;
  submitted: number;
  total: number;
  /** true — сохранено, окно закрывается */
  onSaveDue: (due: Date) => Done;
  onCancelHomework: () => Done;
}

export function HomeworkActionsSheet({
  mode,
  onMode,
  title,
  dueAt,
  submitted,
  total,
  onSaveDue,
  onCancelHomework,
}: Props) {
  const colors = useThemeColors();
  const [now, setNow] = useState(() => new Date());
  const [due, setDue] = useState(() => rescheduleStart(dueAt, new Date()));
  const [busy, setBusy] = useState(false);

  // Каждое открытие «Изменить срок» — от текущего срока
  useEffect(() => {
    if (mode !== 'due') return;
    const at = new Date();
    setNow(at);
    setDue(rescheduleStart(dueAt, at));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const presets = useMemo(() => duePresets(now, null), [now]);
  const duePast = due.getTime() <= Date.now();
  const unchanged = due.getTime() === new Date(dueAt).getTime();

  const close = () => {
    if (!busy) onMode(null);
  };

  const run = async (action: () => Done) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) onMode(null);
  };

  const sheetTitle =
    mode === 'due' ? 'Новый срок' : mode === 'cancel' ? `Отменить «${title}»?` : title;

  const footer =
    mode === 'due' ? (
      <Button
        title="Сохранить срок"
        onPress={() => run(() => onSaveDue(due))}
        disabled={duePast || unchanged}
        loading={busy}
        fullWidth
      />
    ) : mode === 'cancel' ? (
      <View style={st.buttons}>
        <Button
          title="Отменить задание"
          variant="danger"
          onPress={() => run(onCancelHomework)}
          loading={busy}
          fullWidth
        />
        <Button title="Не отменять" variant="secondary" onPress={close} disabled={busy} fullWidth />
      </View>
    ) : undefined;

  return (
    <Sheet visible={mode !== null} onClose={close} title={sheetTitle} footer={footer}>
      {mode === 'menu' && (
        <View style={[st.group, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <ListRow
            title="Изменить срок"
            subtitle={`сейчас ${T.duePrefix} ${dueCardText(new Date(dueAt))}`}
            icon={CalendarClock}
            iconColor={colors.homeworkText}
            onPress={() => onMode('due')}
          />
          <ListRow
            title="Отменить задание"
            icon={Ban}
            destructive
            onPress={() => onMode('cancel')}
            chevron={false}
          />
        </View>
      )}

      {mode === 'due' && (
        <View style={st.section}>
          <View style={[st.group, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <ListRow
              title={`${T.duePrefix} ${dueCardText(due)}`}
              subtitle={duePast ? T.duePast : dueRelative(due)}
              icon={Clock}
              iconColor={colors.homeworkText}
              chevron={false}
            />
          </View>
          <View style={st.presets}>
            {presets.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                selected={p.date.getTime() === due.getTime()}
                onPress={() => setDue(p.date)}
              />
            ))}
          </View>
          <DueWheelPicker value={due} onChange={setDue} now={now} />
          <Text variant="caption" color="secondary">
            Ученики увидят новый срок в задании. Кто уже сдал — сдал, оценки не меняются.
          </Text>
        </View>
      )}

      {mode === 'cancel' && (
        <Text color="secondary">{cancelHomeworkMessage(submitted, total)}</Text>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  section: { gap: spacing.m },
  group: {
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  buttons: { gap: spacing.xs },
});
