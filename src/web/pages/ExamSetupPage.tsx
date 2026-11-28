/**
 * Настройки экзамена (plan/new/web_cabinet.md, Web 13; макет E1). Те же настройки и правила, что в
 * телефонном ExamSetupScreen: наборы, число слов, подбор, форматы, время с «Советуем», шкала 100,
 * когда показать результаты, контроль выхода. Справа — что получится; одна главная кнопка.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Users } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, Switch } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import {
  FORMATS,
  FORMAT_LABELS,
  defaultFormats,
  recommendedTime,
  timeExplanation,
  type FormatCounts,
} from '@/screens/exam/examConfig';
import { describeTestError } from '@/utils/testApiErrors';
import { describeApiError, WebApiError } from '../api';
import { navigate } from '../router';
import { useCourses } from '../data/CoursesContext';
import { ExamData } from '../data/exam';
import { useLoad } from '../useLoad';
import { rememberBuild } from '../exam/buildCache';
import {
  MAX_MINUTES,
  MIN_WORDS,
  canAddFormat,
  clampCount,
  formatsForCount,
  levelSplit,
  maxCountFor,
  minuteOptions,
  minutesFor,
  pointsPerWord,
  setFormatCount,
  setupProblem,
  type MinutesChoice,
} from '../exam/setupLogic';
import { Centered, ErrorPage, LoadingPage, NotFoundPage } from '../ui/states';
import { PageHeader, SectionLabel, Stepper } from '../ui/kit';
import { EmptyState } from '@/components/ui/EmptyState';

export function ExamSetupPage({ courseId }: { courseId: string }) {
  const colors = useThemeColors();
  const { courses } = useCourses();
  const sets = useLoad(() => ExamData.sets(courseId), [courseId]);

  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [mode, setMode] = useState<'difficulty' | 'random'>('difficulty');
  const [includeUnstudied, setIncludeUnstudied] = useState(false);
  const [formats, setFormats] = useState<FormatCounts>(defaultFormats(20));
  const [minutesChoice, setMinutesChoice] = useState<MinutesChoice>('rec');
  const [customMin, setCustomMin] = useState<number | null>(null);
  const [reveal, setReveal] = useState<'teacher' | 'on_submit'>('teacher');
  const [exitControl, setExitControl] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Первый набор выбираем сам, как в телефоне
  useEffect(() => {
    if (sets.data && sets.data.length > 0 && selected.length === 0)
      setSelected([sets.data[0].setId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets.data]);

  const available = useMemo(
    () =>
      (sets.data ?? [])
        .filter((s) => selected.includes(s.setId))
        .reduce((a, s) => a + s.totalCards, 0),
    [sets.data, selected]
  );
  const maxCount = maxCountFor(available);

  // Выбрали меньше слов, чем стояло в счётчике — подтягиваем счётчик вниз
  useEffect(() => {
    if (available > 0 && count > available) {
      const n = clampCount(available, available);
      setCount(n);
      setFormats(formatsForCount(n));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const course = courses?.find((c) => c.id === courseId);
  const rec = recommendedTime(formats);
  const options = minuteOptions(rec.minutes);
  const minutes = minutesFor(minutesChoice, customMin, rec.minutes);
  const split = levelSplit(count);
  const problem = setupProblem({ selected, count, formats });

  if (courses && !course) return <NotFoundPage />;
  if (sets.error && !sets.data) return <ErrorPage error={sets.error} onRetry={sets.reload} />;
  if (!sets.data || !course) return <LoadingPage />;

  const back = { label: course.title, path: `/courses/${courseId}?tab=exams` };

  if (sets.data.length === 0) {
    return (
      <View>
        <PageHeader title="Новый экзамен" back={back} />
        <Centered>
          <EmptyState
            icon={Users}
            title="В курсе нет наборов со словами"
            description="Экзамен собирается из наборов курса. Добавь набор в приложении Flashly и вернись сюда."
          />
        </Centered>
      </View>
    );
  }

  const changeCount = (n: number) => {
    const next = clampCount(n, available);
    setCount(next);
    setFormats(formatsForCount(next));
  };

  const toggleSet = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const build = async () => {
    if (problem || building) return;
    setBuilding(true);
    setError(null);
    try {
      const draft = await ExamData.build({
        courseId,
        setIds: selected,
        count,
        mode,
        includeUnstudied,
        formats,
        durationSec: minutes * 60,
        exitControl,
        revealMode: reveal,
      });
      rememberBuild(draft.sessionId, {
        steps: draft.steps ?? [],
        warnings: draft.warnings ?? [],
        courseId,
      });
      navigate(`/exams/${draft.sessionId}/build`);
    } catch (e) {
      const text =
        e instanceof WebApiError && e.serverError ? describeTestError(e.serverError, '') : '';
      setError(text || describeApiError(e));
      toast.error('Не удалось собрать экзамен');
      setBuilding(false);
    }
  };

  return (
    <View>
      <PageHeader title="Новый экзамен" subtitle={course.title} back={back} />
      <View style={styles.layout}>
        <View style={styles.main}>
          <Section label="Наборы">
            <View style={styles.chips}>
              {sets.data.map((s) => (
                <Chip
                  key={s.setId}
                  label={`${s.title} · ${s.totalCards}`}
                  selected={selected.includes(s.setId)}
                  onPress={() => toggleSet(s.setId)}
                />
              ))}
            </View>
          </Section>

          <Card>
            <Row
              title="Слов в экзамене"
              hint={`${count} из ${available}`}
              control={
                <Stepper
                  label="Слов в экзамене"
                  value={count}
                  onMinus={() => changeCount(count - 1)}
                  onPlus={() => changeCount(count + 1)}
                  minusDisabled={count <= MIN_WORDS}
                  plusDisabled={count >= maxCount}
                />
              }
            />
          </Card>

          <Section label="Какие слова взять">
            <View style={styles.chips}>
              <Chip
                label="По сложности"
                selected={mode === 'difficulty'}
                onPress={() => setMode('difficulty')}
              />
              <Chip
                label="Случайные"
                selected={mode === 'random'}
                onPress={() => setMode('random')}
              />
            </View>
            {mode === 'difficulty' ? (
              <Card tone="muted">
                <Text variant="bodySmall" color="secondary">
                  По тому, как класс учил слова: {split.easy} лёгких (выучили больше 70%),{' '}
                  {split.mid} средних (30–70%), {split.hard} сложных (меньше 30%).
                </Text>
              </Card>
            ) : null}
            <Card>
              <Row
                title="Брать слова, которые класс не открывал"
                hint="По умолчанию не берём: это не честная проверка"
                control={
                  <Switch
                    value={includeUnstudied}
                    onValueChange={setIncludeUnstudied}
                    accessibilityLabel="Брать неизученные слова"
                  />
                }
              />
            </Card>
            <View style={[styles.note, { backgroundColor: alpha(colors.success, 10) }]}>
              <Users size={16} color={colors.successText} />
              <Text variant="caption" style={{ flex: 1, color: colors.successText }}>
                Все ученики получат одни и те же слова. Порядок вопросов и вариантов у каждого свой
                — подсмотреть у соседа не получится.
              </Text>
            </View>
          </Section>

          <Section label="Форматы">
            <Card padding="s">
              {FORMATS.map((f, i) => (
                <View
                  key={f}
                  style={[
                    styles.formatRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{FORMAT_LABELS[f]}</Text>
                    {FORMAT_HINT[f] ? (
                      <Text variant="caption" color="secondary">
                        {FORMAT_HINT[f]}
                      </Text>
                    ) : null}
                  </View>
                  {f === 'choice' ? (
                    <Text
                      variant="h3"
                      align="center"
                      style={{ minWidth: 40 + 2 * 44 + 2 * spacing.xs }}
                    >
                      {formats.choice}
                    </Text>
                  ) : (
                    <Stepper
                      label={FORMAT_LABELS[f]}
                      value={formats[f]}
                      onMinus={() => setFormats((cur) => setFormatCount(cur, count, f, cur[f] - 1))}
                      onPlus={() => setFormats((cur) => setFormatCount(cur, count, f, cur[f] + 1))}
                      minusDisabled={formats[f] <= 0}
                      plusDisabled={!canAddFormat(formats, f)}
                    />
                  )}
                </View>
              ))}
            </Card>
          </Section>

          <Section label="Время на весь экзамен">
            <View style={styles.timeRow}>
              {(['less', 'rec', 'more'] as const).map((k) => (
                <TimeOption
                  key={k}
                  selected={minutesChoice === k}
                  title={`${options[k]} мин`}
                  sub={k === 'rec' ? 'Советуем' : undefined}
                  onPress={() => setMinutesChoice(k)}
                />
              ))}
              <TimeOption
                selected={minutesChoice === 'custom'}
                title="Своё"
                onPress={() => {
                  setMinutesChoice('custom');
                  setCustomMin(customMin || rec.minutes + 5);
                }}
              />
            </View>
            {minutesChoice === 'custom' ? (
              <Card>
                <Row
                  title="Минут"
                  control={
                    <Stepper
                      label="Минут"
                      value={customMin || rec.minutes}
                      onMinus={() => setCustomMin(Math.max(1, (customMin || rec.minutes) - 1))}
                      onPlus={() =>
                        setCustomMin(Math.min(MAX_MINUTES, (customMin || rec.minutes) + 1))
                      }
                      minusDisabled={(customMin || rec.minutes) <= 1}
                      plusDisabled={(customMin || rec.minutes) >= MAX_MINUTES}
                    />
                  }
                />
              </Card>
            ) : null}
            <Card tone="muted">
              <Text variant="label">Как посчитали {rec.minutes} мин</Text>
              <Text variant="caption" color="secondary">
                {timeExplanation(formats)} Меняется сразу, если поменять форматы или число слов.
              </Text>
            </Card>
          </Section>

          <Section label="Результаты ученикам">
            <View style={styles.chips}>
              <Chip
                label="Когда я открою"
                selected={reveal === 'teacher'}
                onPress={() => setReveal('teacher')}
              />
              <Chip
                label="Сразу после сдачи"
                selected={reveal === 'on_submit'}
                onPress={() => setReveal('on_submit')}
              />
            </View>
            <Card>
              <Row
                title="Контроль выхода из приложения"
                hint="Вышел дольше чем на 3 секунды — экзамен завершается"
                control={
                  <Switch
                    value={exitControl}
                    onValueChange={setExitControl}
                    accessibilityLabel="Контроль выхода"
                  />
                }
              />
            </Card>
          </Section>
        </View>

        <View style={styles.side}>
          <Card>
            <View style={{ gap: spacing.s }}>
              <SectionLabel>Что получится</SectionLabel>
              <Summary label="Слов" value={String(count)} />
              <Summary label="Время" value={`${minutes} мин`} />
              <Summary label="Шкала" value={`100 баллов · по ${pointsPerWord(count)} за слово`} />
              <Summary
                label="Форматы"
                value={FORMATS.filter((f) => formats[f] > 0)
                  .map((f) => `${FORMAT_LABELS[f]} ${formats[f]}`)
                  .join(', ')}
              />
              {problem ? (
                <Text variant="bodySmall" color="error" accessibilityRole="alert">
                  {problem}
                </Text>
              ) : null}
              {error ? (
                <Text variant="bodySmall" color="error" accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Button
                title="Собрать экзамен"
                fullWidth
                loading={building}
                disabled={Boolean(problem)}
                onPress={build}
              />
            </View>
          </Card>
        </View>
      </View>
    </View>
  );
}

const FORMAT_HINT: Partial<Record<(typeof FORMATS)[number], string>> = {
  choice: 'Остальные слова',
  gap: 'Если у слов есть примеры',
  match: 'Один экран, от 3 пар',
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.s }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}

function Row({ title, hint, control }: { title: string; hint?: string; control: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text variant="label">{title}</Text>
        {hint ? (
          <Text variant="caption" color="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
      {control}
    </View>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

function TimeOption({
  selected,
  title,
  sub,
  onPress,
}: {
  selected: boolean;
  title: string;
  sub?: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      role="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}${sub ? `, ${sub.toLowerCase()}` : ''}`}
      onPress={onPress}
      style={[
        styles.timeBtn,
        {
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
          backgroundColor: selected ? alpha(colors.primary, 10) : colors.surface,
        },
      ]}
    >
      <Text variant="label" style={{ color: selected ? colors.primary : colors.textPrimary }}>
        {title}
      </Text>
      {sub ? (
        <Text variant="caption" style={{ color: selected ? colors.primary : colors.textSecondary }}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  main: { flex: 1, gap: spacing.l, minWidth: 0 },
  side: { width: 320, position: 'sticky' as unknown as 'relative', top: spacing.l },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.xs,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    padding: spacing.s,
    borderRadius: borderRadius.m,
  },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  timeBtn: {
    minWidth: 110,
    minHeight: 56,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
