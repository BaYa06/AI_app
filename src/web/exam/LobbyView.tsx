/**
 * Ожидание учеников (plan/new/web_cabinet.md, Web 18; макет E5): код крупно, как войти, кто зашёл,
 * «Начать». Опрос раз в 3 секунды; опоздавшие могут войти, пока экзамен идёт.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Copy, MonitorPlay } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import { describeApiError } from '../api';
import { LiveData } from '../data/live';
import { useLoad } from '../useLoad';
import { Avatar, PageHeader, SectionLabel } from '../ui/kit';
import { Banner } from '../ui/states';
import { studentsCountLabel } from '../teacherLogic';
import { oldVersionProblems } from './liveLogic';
import { buildState } from './projector';
import { useProjector } from './useProjector';
import { useHotkeys } from './useHotkeys';
import { useSingleFlight } from '../ui/useSingleFlight';

const POLL_MS = 3000;

export function LobbyView({
  sessionId,
  code,
  kind,
  showNames,
  onShowNames,
  onStatus,
}: {
  sessionId: string;
  code: string;
  /** exam — экзамен (движок 2), quick — быстрый тест (движок 1) */
  kind: 'exam' | 'quick';
  showNames: boolean;
  onShowNames: (v: boolean) => void;
  onStatus: (s: 'active' | 'finished') => void;
}) {
  const colors = useThemeColors();
  const [starting, setStarting] = useState(false);

  const monitor = useLoad(() => LiveData.monitor(sessionId), [sessionId], { refreshMs: POLL_MS });
  const events = useLoad(() => LiveData.events(sessionId), [sessionId], { refreshMs: POLL_MS });
  const m = monitor.data;

  // Экзамен уже начат (с телефона или другого окна) — переходим, а не показываем лобби
  React.useEffect(() => {
    if (m && (m.status === 'active' || m.status === 'finished')) onStatus(m.status);
  }, [m?.status]);

  const participants = m?.participants ?? [];
  const projectorState = useMemo(
    () => buildState(m ?? null, { code, setTitle: '', showNames, timeLeftSec: null }),
    [m, code, showNames]
  );
  const projector = useProjector(sessionId, projectorState);
  const late = oldVersionProblems(events.data ?? [], new Set(participants.map((p) => p.userId)));

  const openProjector = () => {
    if (!projector.supported)
      toast.error(
        'Этот браузер не умеет открывать окно проектора. Открой кабинет в свежем Chrome, Safari или Edge.'
      );
    else if (!projector.open())
      toast.error('Браузер заблокировал окно. Разреши всплывающие окна для кабинета.');
  };
  useHotkeys({ projector: openProjector });

  const once = useSingleFlight();
  const start = () => once(startOnce);
  const startOnce = async () => {
    if (participants.length === 0) return;
    setStarting(true);
    try {
      await LiveData.start(sessionId);
      onStatus('active');
    } catch (e) {
      toast.error(describeApiError(e));
      setStarting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Код скопирован');
    } catch {
      toast.error('Не получилось скопировать. Выдели код и скопируй вручную');
    }
  };

  return (
    <View>
      <PageHeader
        title="Ждём учеников"
        subtitle={
          kind === 'exam'
            ? 'Экзамен открыт. Ученики входят в приложении Flashly.'
            : 'Тест открыт. Ученики входят в приложении Flashly.'
        }
        back={
          kind === 'exam' ? { label: 'Экзамены', path: '/exams' } : { label: 'Обзор', path: '/' }
        }
      />
      {monitor.error && m ? <Banner text="Нет связи, пробуем снова…" /> : null}
      <View style={styles.layout}>
        <View style={styles.main}>
          <Card>
            <View style={styles.codeBlock}>
              <Text variant="caption" color="secondary">
                Код для учеников
              </Text>
              <Text
                variant="hero"
                selectable
                accessibilityLabel={`Код ${code.split('').join(' ')}`}
                style={{ letterSpacing: 8 }}
              >
                {code}
              </Text>
              <View style={styles.row}>
                <Button
                  variant="secondary"
                  size="s"
                  icon={Copy}
                  title="Копировать код"
                  onPress={copy}
                />
                <Button
                  variant="secondary"
                  size="s"
                  icon={MonitorPlay}
                  title="Открыть на проекторе (P)"
                  onPress={openProjector}
                />
              </View>
            </View>
          </Card>

          <View style={{ gap: spacing.s }}>
            <SectionLabel>Как войти</SectionLabel>
            <Card>
              <View style={{ gap: spacing.xs }}>
                {[
                  'Открой приложение Flashly',
                  'Перейди во вкладку «Тест»',
                  `Введи код ${code}`,
                ].map((t, i) => (
                  <View key={t} style={styles.step}>
                    <View style={[styles.stepNo, { backgroundColor: alpha(colors.primary, 10) }]}>
                      <Text variant="label" style={{ color: colors.primary }}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text variant="body">{t}</Text>
                  </View>
                ))}
                {kind === 'exam' ? (
                  <Text variant="caption" color="secondary">
                    Нужна версия приложения 1.9.6 или новее.
                  </Text>
                ) : null}
              </View>
            </Card>
          </View>

          <Card>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text variant="label">Показывать имена на проекторе</Text>
                <Text variant="caption" color="secondary">
                  По умолчанию выключено: на проекторе только число зашедших. Включай, если в курсе
                  все старше 18.
                </Text>
              </View>
              <Switch
                value={showNames}
                onValueChange={onShowNames}
                accessibilityLabel="Показывать имена на проекторе"
              />
            </View>
          </Card>
        </View>

        <View style={styles.side}>
          <Card>
            <View style={{ gap: spacing.s }}>
              <SectionLabel>Зашли</SectionLabel>
              <Text variant="h1" accessibilityLiveRegion="polite">
                {participants.length}
              </Text>
              <Text variant="caption" color="secondary">
                {participants.length === 0
                  ? 'Пока никого'
                  : studentsCountLabel(participants.length)}
              </Text>
              <View style={styles.names}>
                {participants.map((p) => (
                  <View
                    key={p.userId}
                    style={[styles.person, { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Avatar name={p.name} size={24} />
                    <Text variant="bodySmall" numberOfLines={1} style={{ maxWidth: 160 }}>
                      {p.name}
                    </Text>
                  </View>
                ))}
              </View>
              {late.length > 0 ? (
                <View
                  style={[
                    styles.warn,
                    {
                      backgroundColor: alpha(colors.warning, 10),
                      borderColor: alpha(colors.warning, 40),
                    },
                  ]}
                >
                  <Text variant="label" style={{ color: colors.warningText }}>
                    Не смогли войти: нужно обновить Flashly
                  </Text>
                  <Text variant="bodySmall" style={{ color: colors.warningText }}>
                    {late.map((l) => l.name).join(', ')}
                  </Text>
                </View>
              ) : null}
              <Button
                title={kind === 'exam' ? 'Начать экзамен' : 'Начать тест'}
                fullWidth
                loading={starting}
                disabled={participants.length === 0}
                onPress={start}
              />
              <Text variant="caption" color="secondary">
                Опоздавшие смогут войти, пока {kind === 'exam' ? 'экзамен' : 'тест'} идёт.
              </Text>
            </View>
          </Card>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  main: { flex: 1, gap: spacing.l, minWidth: 0 },
  side: { width: 360 },
  codeBlock: { alignItems: 'center', gap: spacing.s, paddingVertical: spacing.m },
  row: { flexDirection: 'row', gap: spacing.s, flexWrap: 'wrap', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  stepNo: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.full,
  },
  warn: { padding: spacing.s, borderRadius: borderRadius.m, borderWidth: 1, gap: spacing.xxs },
});
