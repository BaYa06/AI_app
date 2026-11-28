/**
 * Монитор идущего экзамена (plan/new/web_cabinet.md, Web 20; макет E6): таймер (красный за 3 минуты
 * до конца), прогресс каждого ученика, пауза, +время, «Разрешить продолжить», «Завершить для всех»,
 * «Нужно внимание» и журнал. Проблемы учеников видит только учитель — окно проектора их не получает.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlarmClockPlus, MonitorPlay, Pause, Play, RotateCcw } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge, ProgressBar, Switch, type BadgeTone } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import { describeApiError } from '../api';
import { LiveData } from '../data/live';
import { useLoad } from '../useLoad';
import { useNow } from '../ui/useNow';
import { useSingleFlight } from '../ui/useSingleFlight';
import { ConfirmDialog } from '../ui/dialogs';
import { Avatar, PageHeader, SectionLabel, StatTile } from '../ui/kit';
import { Banner } from '../ui/states';
import {
  STATE_LABEL,
  eventText,
  formatClock,
  isTimeWarning,
  problems,
  progressPct,
  shouldAutoFinish,
  studentState,
  summarize,
  quickTimeLeftSec,
  timeLeftSec,
  type Participant,
  type StudentState,
} from './liveLogic';
import { buildState } from './projector';
import { useProjector } from './useProjector';
import { useHotkeys } from './useHotkeys';

const POLL_MS = 3000;
const EVENTS_MS = 4000;

const TONE: Record<StudentState, BadgeTone> = {
  left: 'error',
  away: 'warning',
  done: 'success',
  working: 'primary',
  waiting: 'neutral',
};

export function MonitorView({
  sessionId,
  code,
  wordsCount,
  kind,
  showNames,
  onShowNames,
  onStatus,
}: {
  sessionId: string;
  code: string;
  wordsCount: number;
  /** exam — экзамен, quick — быстрый тест: без паузы и «+минуты», время на вопрос */
  kind: 'exam' | 'quick';
  showNames: boolean;
  onShowNames: (v: boolean) => void;
  onStatus: (s: 'finished') => void;
}) {
  const colors = useThemeColors();
  const monitor = useLoad(() => LiveData.monitor(sessionId), [sessionId], { refreshMs: POLL_MS });
  const events = useLoad(() => LiveData.events(sessionId), [sessionId], {
    refreshMs: EVENTS_MS,
    // Журнал событий есть только у экзамена
    skip: kind === 'quick',
  });
  const m = monitor.data;

  const [pausing, setPausing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const autoDone = useRef(false);

  // Остаток на момент ответа сервера + свой секундомер между опросами; на паузе не тикает
  const now = useNow(1000);
  const base = useRef<{ left: number | null; at: number }>({ left: null, at: Date.now() });
  useEffect(() => {
    if (m)
      base.current = {
        left: kind === 'quick' ? quickTimeLeftSec(m) : timeLeftSec(m),
        at: Date.now(),
      };
  }, [m]);
  const left =
    base.current.left === null
      ? null
      : m?.paused
        ? base.current.left
        : Math.max(0, base.current.left - Math.floor((now - base.current.at) / 1000));
  const warn = isTimeWarning(left);

  const participants = m?.participants ?? [];
  const summary = useMemo(() => summarize(participants), [participants]);
  const attention = useMemo(
    () => problems(participants, events.data ?? []),
    [participants, events.data]
  );

  const projectorState = useMemo(
    () => buildState(m ?? null, { code, setTitle: '', showNames, timeLeftSec: left }),
    [m, code, showNames, left]
  );
  const projector = useProjector(sessionId, projectorState);

  useEffect(() => {
    if (m?.status === 'finished') onStatus('finished');
  }, [m?.status]);

  const once = useSingleFlight();
  const noun = kind === 'quick' ? 'тест' : 'экзамен';
  const finish = (reason: 'manual' | 'all_done' | 'time' = 'manual') =>
    once(async () => {
      setFinishing(true);
      try {
        await LiveData.finish(sessionId);
        if (reason === 'all_done') toast.success(`Все сдали — ${noun} завершён`);
        if (reason === 'time') toast.success('Время вышло — тест завершён');
        onStatus('finished');
      } catch (e) {
        toast.error(describeApiError(e));
        setFinishing(false);
        setConfirmFinish(false);
      }
    });

  // Все сдали и никто не вышел досрочно — закрываем сами (как в приложении)
  useEffect(() => {
    if (m?.status === 'active' && !autoDone.current && shouldAutoFinish(participants)) {
      autoDone.current = true;
      void finish('all_done');
    }
  }, [m]);

  // Быстрый тест: время вышло — завершаем сами (у экзамена срок считает сервер)
  useEffect(() => {
    if (kind === 'quick' && m?.status === 'active' && left === 0 && !autoDone.current) {
      autoDone.current = true;
      void finish('time');
    }
  }, [left, m?.status]);

  const togglePause = async () => {
    if (pausing || !m || m.status !== 'active') return;
    setPausing(true);
    try {
      await LiveData.pause(sessionId, !m.paused);
      monitor.reload();
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setPausing(false);
  };

  const openProjector = () => {
    if (!projector.supported)
      toast.error(
        'Этот браузер не умеет открывать окно проектора. Открой кабинет в свежем Chrome, Safari или Edge.'
      );
    else if (!projector.open())
      toast.error('Браузер заблокировал окно. Разреши всплывающие окна для кабинета.');
  };
  useHotkeys({
    ...(kind === 'exam' ? { pause: togglePause } : {}),
    projector: openProjector,
  });

  const addTime = async (p: Participant) => {
    setBusyUser(p.userId);
    try {
      await LiveData.extraTime(sessionId, p.userId, 2);
      toast.success(`${p.name}: добавили 2 минуты`);
      events.reload();
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setBusyUser(null);
  };

  const reinstate = async (p: Participant) => {
    setBusyUser(p.userId);
    try {
      await LiveData.reinstate(sessionId, p.userId);
      toast.success(`${p.name} может продолжить`);
      monitor.reload();
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setBusyUser(null);
  };

  return (
    <View>
      <PageHeader
        title={kind === 'quick' ? 'Тест идёт' : m?.paused ? 'Экзамен на паузе' : 'Экзамен идёт'}
        subtitle={`Код ${code} · ${wordsCount} слов`}
        back={
          kind === 'exam' ? { label: 'Экзамены', path: '/exams' } : { label: 'Обзор', path: '/' }
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="s"
              icon={MonitorPlay}
              title="Проектор (P)"
              onPress={openProjector}
            />
            {kind === 'exam' ? (
              <Button
                variant="secondary"
                size="s"
                icon={m?.paused ? Play : Pause}
                title={m?.paused ? 'Продолжить (пробел)' : 'Пауза (пробел)'}
                onPress={togglePause}
                loading={pausing}
                disabled={!m}
              />
            ) : null}
            <Button
              variant="danger"
              size="s"
              title="Завершить для всех"
              onPress={() => setConfirmFinish(true)}
              disabled={!m}
            />
          </>
        }
      />
      {monitor.error && m ? (
        <Banner text="Нет связи, пробуем снова… Данные могут отставать." />
      ) : null}

      <View style={styles.top}>
        <Card
          style={[
            styles.clock,
            warn && { borderColor: colors.error, backgroundColor: alpha(colors.error, 10) },
          ]}
        >
          <Text variant="caption" color="secondary">
            Осталось
          </Text>
          <Text
            variant="display"
            accessibilityLiveRegion={warn ? 'polite' : 'none'}
            style={{ color: warn ? colors.errorText : colors.textPrimary }}
          >
            {left === null ? '—' : formatClock(left)}
          </Text>
          {m?.paused ? <Badge label="Пауза" tone="warning" /> : null}
        </Card>
        <StatTile value={summary.total} label="Зашли" />
        <StatTile value={summary.working} label="Пишут" />
        <StatTile value={summary.done} label="Сдали" tone="success" />
        <StatTile
          value={summary.left}
          label="Вышли"
          tone={summary.left > 0 ? 'warning' : 'neutral'}
        />
      </View>

      <View style={styles.layout}>
        <View style={styles.main}>
          <SectionLabel>Ученики</SectionLabel>
          <Card padding="none">
            {participants.length === 0 ? (
              <Text variant="body" color="secondary" style={{ padding: spacing.m }}>
                Пока никто не зашёл.
              </Text>
            ) : (
              participants.map((p, i) => {
                const st = studentState(p);
                return (
                  <View
                    key={p.userId}
                    style={[
                      styles.row,
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    ]}
                  >
                    <Avatar name={p.name} size={36} />
                    <View style={{ flex: 1, gap: spacing.xxs, minWidth: 0 }}>
                      <Text variant="body" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <View style={styles.progress}>
                        <View style={{ flex: 1 }}>
                          <ProgressBar
                            progress={progressPct(p)}
                            color={st === 'done' ? colors.success : undefined}
                          />
                        </View>
                        <Text variant="caption" color="secondary" style={{ width: 72 }}>
                          {p.answered} из {p.total}
                        </Text>
                      </View>
                    </View>
                    <View style={{ width: 132 }}>
                      <Badge label={STATE_LABEL[st]} tone={TONE[st]} />
                    </View>
                    <View style={styles.actions}>
                      {st === 'left' ? (
                        <Button
                          variant="icon"
                          background="none"
                          icon={RotateCcw}
                          accessibilityLabel={`Разрешить продолжить: ${p.name}`}
                          onPress={() => reinstate(p)}
                          loading={busyUser === p.userId}
                        />
                      ) : null}
                      {kind === 'exam' && st !== 'done' && st !== 'left' ? (
                        <Button
                          variant="icon"
                          background="none"
                          icon={AlarmClockPlus}
                          accessibilityLabel={`Добавить 2 минуты: ${p.name}`}
                          onPress={() => addTime(p)}
                          loading={busyUser === p.userId}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        </View>

        <View style={styles.side}>
          <View style={{ gap: spacing.s }}>
            <SectionLabel>Нужно внимание</SectionLabel>
            <Card>
              {attention.length === 0 ? (
                <Text variant="bodySmall" color="secondary">
                  Всё спокойно: никто не вышел и не пропал.
                </Text>
              ) : (
                <View style={{ gap: spacing.s }}>
                  {attention.map((a) => (
                    <View key={a.key} style={{ gap: spacing.xxs }}>
                      <Text variant="label">{a.name}</Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: a.kind === 'left' ? colors.errorText : colors.warningText }}
                      >
                        {a.text}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.m }}>
              <View style={{ flex: 1 }}>
                <Text variant="label">Имена на проекторе</Text>
                <Text variant="caption" color="secondary">
                  Выключено: только число учеников.
                </Text>
              </View>
              <Switch
                value={showNames}
                onValueChange={onShowNames}
                accessibilityLabel="Показывать имена на проекторе"
              />
            </View>
          </Card>
          {kind === 'exam' ? (
            <View style={{ gap: spacing.s }}>
              <SectionLabel>Что происходило</SectionLabel>
              <Card>
                {(events.data ?? []).length === 0 ? (
                  <Text variant="bodySmall" color="secondary">
                    Пока событий нет.
                  </Text>
                ) : (
                  <View style={{ gap: spacing.xs }}>
                    {(events.data ?? []).slice(0, 12).map((e) => (
                      <Text key={e.id} variant="bodySmall">
                        <Text variant="caption" color="tertiary">
                          {new Date(e.at).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}{' '}
                        </Text>
                        {eventText(e)}
                      </Text>
                    ))}
                  </View>
                )}
              </Card>
            </View>
          ) : null}
        </View>
      </View>

      <ConfirmDialog
        visible={confirmFinish}
        title={`Завершить ${noun} для всех?`}
        message={`Не сдавшие получат баллы за то, что успели. ${summary.working > 0 ? `Сейчас пишут: ${summary.working}.` : ''} Отменить это нельзя.`}
        confirmText="Завершить"
        destructive
        busy={finishing}
        onConfirm={() => finish('manual')}
        onClose={() => setConfirmFinish(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m, marginBottom: spacing.l },
  clock: { minWidth: 200, gap: spacing.xxs },
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  main: { flex: 1, gap: spacing.s, minWidth: 0 },
  side: { width: 340, gap: spacing.l },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    minHeight: 64,
  },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  actions: { width: 44, alignItems: 'center' },
});
