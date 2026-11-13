/**
 * Экран отчёта (14; plan/new/teacher_cabinet.md, Teacher 55): вкладки «Родителям» (один ученик)
 * и «Группе» (весь курс), выбор ученика и периода, превью, комментарий учителя, «Отправить
 * ссылкой» и «PDF». Данные — сервер (report-data), подписи — services/teacherReport.ts.
 * Превью повторяет страницу отчёта по ссылке. Цвета — только токены (обе темы).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Share2, Zap } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, ScreenHeader, TextField, toast } from '@/components/ui';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import {
  REPORT_COMMENT_MAX,
  REPORT_GOOD_PCT,
  REPORT_PERIODS,
  REPORT_TABS,
  groupDigits,
  reportFigures,
  reportSubtitle,
  reportTitle,
  unitLabel,
  type ReportKind,
  type ReportParams,
  type ReportPeriod,
  type TeacherReport,
} from '@/services/teacherReport';
import type { RootStackParamList } from '@/types/navigation';
import { shareReportLink, shareReportPdf, type ShareResult } from './teacherReport/shareReport';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherReport'>;
type Colors = ReturnType<typeof useThemeColors>;

export function TeacherReportScreen({ navigation, route }: Props) {
  const { courseId } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState<ReportKind>(route.params.studentId ? 'parent' : 'group');
  const [studentId, setStudentId] = useState<string | null>(route.params.studentId ?? null);
  const [period, setPeriod] = useState<ReportPeriod>('all');
  const [comment, setComment] = useState('');
  const [students, setStudents] = useState<Array<{ id: string; name: string }> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [report, setReport] = useState<TeacherReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [busy, setBusy] = useState<'link' | 'pdf' | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    NeonService.loadCourseMembers(courseId)
      .then((list) => setStudents(list.map((m) => ({ id: m.id, name: m.displayName }))))
      .catch(() => setStudents([]));
  }, [courseId]);

  const needsStudent = kind === 'parent' && !studentId;
  const params: ReportParams = useMemo(
    () => ({ courseId, kind, studentId, period, comment }),
    [courseId, kind, studentId, period, comment]
  );

  // Превью: комментарий в запрос не входит — он подставляется на устройстве и уходит при отправке
  const load = useCallback(async () => {
    if (needsStudent) {
      setReport(null);
      setState('ready');
      return;
    }
    const id = ++requestRef.current;
    setState('loading');
    const res = await NeonService.loadReport({ courseId, kind, studentId, period });
    if (id !== requestRef.current) return;
    setReport(res);
    setState(res ? 'ready' : 'failed');
  }, [courseId, kind, studentId, period, needsStudent]);

  useEffect(() => {
    load();
  }, [load]);

  const studentName =
    students?.find((s) => s.id === studentId)?.name ?? route.params.studentName ?? null;

  const after = (result: ShareResult) => {
    if (result === 'failed') toast.error('Не получилось. Проверь интернет');
    else if (result === 'copied') toast.success('Ссылка на отчёт скопирована');
  };
  const sendLink = async () => {
    if (!report || busy) return;
    Analytics.teacherAction('report_share', 'course');
    setBusy('link');
    after(await shareReportLink(params, report));
    setBusy(null);
  };
  const sendPdf = async () => {
    if (!report || busy) return;
    Analytics.teacherAction('report_pdf', 'course');
    setBusy('pdf');
    after(await shareReportPdf(params, report));
    setBusy(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <ScreenHeader title="Отчёт" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {/* Вкладки */}
        <View style={[st.tabs, { backgroundColor: colors.surfaceMuted }]}>
          {REPORT_TABS.map((tab) => {
            const active = tab.key === kind;
            return (
              <View key={tab.key} style={st.flex}>
                <Button
                  title={tab.label}
                  size="s"
                  variant={active ? 'secondary' : 'quiet'}
                  tone={active ? 'primary' : 'secondary'}
                  fullWidth
                  accessibilityState={{ selected: active }}
                  onPress={() => setKind(tab.key)}
                />
              </View>
            );
          })}
        </View>

        {/* Ученик и период */}
        <View style={st.chips}>
          {kind === 'parent' && (
            <Chip
              label={studentName ?? 'Выбрать ученика'}
              selected={pickerOpen}
              onPress={() => setPickerOpen((v) => !v)}
            />
          )}
          {REPORT_PERIODS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={p.key === period}
              onPress={() => setPeriod(p.key)}
            />
          ))}
        </View>
        {kind === 'parent' && (pickerOpen || needsStudent) && (
          <View style={st.chips}>
            {students === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : students.length === 0 ? (
              <Text color="secondary">В курсе пока нет учеников</Text>
            ) : (
              students.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={s.id === studentId}
                  onPress={() => {
                    setStudentId(s.id);
                    setPickerOpen(false);
                  }}
                />
              ))
            )}
          </View>
        )}

        {/* Превью */}
        {state === 'loading' ? (
          <View style={st.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : state === 'failed' ? (
          <View style={st.center}>
            <Text color="secondary">Не получилось собрать отчёт</Text>
            <Button title="Повторить" variant="secondary" onPress={load} />
          </View>
        ) : report ? (
          <>
            <Preview colors={colors} report={report} comment={comment} />
            <TextField
              label="Комментарий учителя"
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={REPORT_COMMENT_MAX}
              placeholder={
                kind === 'parent'
                  ? 'Что получается и на что обратить внимание'
                  : 'Что сказать группе'
              }
            />
          </>
        ) : (
          <Text color="secondary">Выбери ученика — соберём отчёт для родителей</Text>
        )}
      </ScrollView>

      <View
        style={[
          st.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + spacing.m,
          },
        ]}
      >
        <View style={st.flex}>
          <Button
            title="Отправить ссылкой"
            icon={Share2}
            fullWidth
            disabled={!report || busy === 'pdf'}
            loading={busy === 'link'}
            onPress={sendLink}
          />
        </View>
        <Button
          title="PDF"
          variant="secondary"
          disabled={!report || busy === 'link'}
          loading={busy === 'pdf'}
          onPress={sendPdf}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Карточка отчёта — как страница по ссылке */
function Preview({
  colors,
  report,
  comment,
}: {
  colors: Colors;
  report: TeacherReport;
  comment: string;
}) {
  const top = Math.max(0, ...report.weeks.map((w) => w.share));
  const subtitle = reportSubtitle(report);
  return (
    <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={st.spread}>
        <View style={st.brand}>
          <View style={[st.logo, { backgroundColor: colors.primaryFill }]}>
            <Zap size={iconSize.xs} color={colors.onPrimary} />
          </View>
          <Text variant="body" style={st.bold}>
            Flashly
          </Text>
        </View>
        <Text variant="caption" color="secondary">
          {report.periodLabel}
        </Text>
      </View>

      <View>
        <Text variant="h3">{reportTitle(report)}</Text>
        {subtitle ? (
          <Text variant="bodySmall" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={st.grid}>
        {reportFigures(report).map((f) => (
          <View key={f.label} style={st.figureWrap}>
            <View style={[st.figure, { backgroundColor: colors.background }]}>
              <Text variant="h2" style={f.good ? { color: colors.successText } : undefined}>
                {f.value}
              </Text>
              <Text variant="caption" color="secondary">
                {f.label}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {report.weeks.length > 0 && (
        <View style={st.block}>
          <Text variant="caption" color="secondary" style={st.overline}>
            ОТВЕТОВ ЗА НЕДЕЛЮ
          </Text>
          <View style={st.bars}>
            {report.weeks.map((w) => (
              <View key={w.label} style={st.barCol}>
                <View
                  style={[
                    st.bar,
                    {
                      height: `${Math.max(4, w.share)}%`,
                      backgroundColor:
                        w.share === top
                          ? colors.primaryFill
                          : alpha(colors.primary, w.share < 30 ? 20 : 40),
                    },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={st.barLabels}>
            {report.weeks.map((w) => (
              <Text
                key={w.label}
                variant="caption"
                color="secondary"
                style={st.barLabel}
                numberOfLines={2}
              >
                {`${w.label} · ${groupDigits(w.answers)}`}
              </Text>
            ))}
          </View>
        </View>
      )}

      {report.kind === 'parent' &&
        (report.units ?? []).slice(-4).map((u) => {
          const good = (u.correctPct ?? 0) >= REPORT_GOOD_PCT;
          return (
            <Line
              key={u.title}
              colors={colors}
              left={unitLabel(u)}
              right={u.correctPct === null ? '—' : `${u.correctPct}% верно`}
              good={good}
            />
          );
        })}

      {report.kind === 'group' && (report.best ?? []).length > 0 && (
        <View style={st.block}>
          <Text variant="caption" color="secondary" style={st.overline}>
            ЛУЧШИЕ
          </Text>
          {(report.best ?? []).map((b) => (
            <Line
              key={b.name}
              colors={colors}
              left={b.name}
              right={`${groupDigits(b.answers)} · ${b.correctPct === null ? '—' : `${b.correctPct}%`}`}
              good
            />
          ))}
        </View>
      )}

      {report.kind === 'group' && (report.inactive ?? []).length > 0 && (
        <View style={st.block}>
          <Text variant="caption" color="secondary" style={st.overline}>
            НЕ ЗАХОДЯТ 7+ ДНЕЙ
          </Text>
          <Text variant="bodySmall" color="secondary">
            {(report.inactive ?? []).join(', ')}
          </Text>
        </View>
      )}

      {comment.trim() ? (
        <View style={st.block}>
          <Text variant="caption" color="secondary" style={st.overline}>
            КОММЕНТАРИЙ УЧИТЕЛЯ
          </Text>
          <Text variant="bodySmall">{comment.trim()}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Line({
  colors,
  left,
  right,
  good,
}: {
  colors: Colors;
  left: string;
  right: string;
  good: boolean;
}) {
  return (
    <View
      style={[st.line, { backgroundColor: good ? alpha(colors.success, 10) : colors.surfaceMuted }]}
    >
      <Text variant="bodySmall" style={[st.flex, st.bold]} numberOfLines={1}>
        {left}
      </Text>
      <Text
        variant="bodySmall"
        style={[st.bold, { color: good ? colors.successText : colors.textSecondary }]}
      >
        {right}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '600' },
  content: { padding: spacing.m, gap: spacing.m, paddingBottom: spacing.xl },
  center: { alignItems: 'center', gap: spacing.m, paddingVertical: spacing.xl },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderRadius: borderRadius.m,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  card: {
    padding: spacing.m,
    gap: spacing.m,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  logo: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -spacing.xxs },
  figureWrap: { width: '50%', padding: spacing.xxs },
  figure: { padding: spacing.s, borderRadius: borderRadius.m },
  block: { gap: spacing.xs },
  overline: { fontWeight: '600', letterSpacing: 0.8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, height: 72 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: borderRadius.s },
  barLabels: { flexDirection: 'row', gap: spacing.xs },
  barLabel: { flex: 1, textAlign: 'center' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.m,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
