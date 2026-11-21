/**
 * Настройка экзамена с оценкой (plan/new/live_exam.md, LiveExam 13; макет «1. Новый экзамен»).
 *
 * Наборы курса, число слов, подбор (по сложности ~33/33/33 или случайно), неизученные слова,
 * форматы, время с «Советуем» и расчётом, шкала 100, когда показать результаты, контроль выхода.
 * «Собрать экзамен» → сервер собирает и сохраняет черновик → экран шагов сборки.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Minus, Plus, Users } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Screen,
  ScreenHeader,
  SkeletonCard,
  Switch,
  toast,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, alpha, iconSize, screenPadding } from '@/constants';
import type { RootStackParamList } from '@/types/navigation';
import { NeonService } from '@/services/NeonService';
import { ExamApi, type ExamFormat } from '@/services/exam';
import { describeTestError } from '@/utils/testApiErrors';
import { log } from '@/utils/logger';
import { Analytics } from '@/services/analytics';
import {
  FORMATS,
  FORMAT_LABELS,
  PAIR_MIN,
  defaultFormats,
  recommendedTime,
  timeExplanation,
  type FormatCounts,
} from './exam/examConfig';

type Props = NativeStackScreenProps<RootStackParamList, 'ExamSetup'>;
type SetStat = { setId: string; title: string; totalCards: number };

const MIN_WORDS = 4;
const MAX_WORDS = 50;

function Stepper({
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  label,
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  label: string;
}) {
  const colors = useThemeColors();
  const btn = (disabled: boolean | undefined) => [
    styles.stepBtn,
    { backgroundColor: colors.surfaceMuted, opacity: disabled ? 0.4 : 1 },
  ];
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={onMinus}
        disabled={minusDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: меньше`}
        style={btn(minusDisabled)}
      >
        <Minus size={iconSize.s} color={colors.textPrimary} />
      </Pressable>
      <Text variant="h3" style={styles.stepValue}>
        {value}
      </Text>
      <Pressable
        onPress={onPlus}
        disabled={plusDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: больше`}
        style={btn(plusDisabled)}
      >
        <Plus size={iconSize.s} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

export function ExamSetupScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const { courseId, courseTitle } = route.params;

  const [sets, setSets] = useState<SetStat[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [mode, setMode] = useState<'difficulty' | 'random'>('difficulty');
  const [includeUnstudied, setIncludeUnstudied] = useState(false);
  const [formats, setFormats] = useState<FormatCounts>(defaultFormats(20));
  const [customMin, setCustomMin] = useState<number | null>(null);
  const [minutesChoice, setMinutesChoice] = useState<'rec' | 'less' | 'more' | 'custom'>('rec');
  const [reveal, setReveal] = useState<'teacher' | 'on_submit'>('teacher');
  const [exitControl, setExitControl] = useState(true);
  const [building, setBuilding] = useState(false);

  const load = async () => {
    setLoadError(false);
    try {
      const stats = await NeonService.loadCourseSetStats(courseId);
      const list = stats.filter((s) => s.totalCards > 0);
      setSets(list);
      if (list.length) setSelected([list[0].setId]);
    } catch (e) {
      log.error('ExamSetup', 'load sets failed', e);
      setLoadError(true);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const available = useMemo(
    () =>
      (sets || []).filter((s) => selected.includes(s.setId)).reduce((a, s) => a + s.totalCards, 0),
    [sets, selected]
  );
  const maxCount = Math.max(MIN_WORDS, Math.min(MAX_WORDS, available || MAX_WORDS));

  // Новое число слов — доли форматов по умолчанию
  const changeCount = (n: number) => {
    const next = Math.max(MIN_WORDS, Math.min(maxCount, n));
    setCount(next);
    setFormats(defaultFormats(next));
  };
  useEffect(() => {
    if (available > 0 && count > available) changeCount(Math.max(MIN_WORDS, available));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  // Выбор = остаток; остальные форматы меняет учитель
  const others = (f: FormatCounts) => f.write + f.scramble + f.match + f.gap;
  const setFormat = (f: ExamFormat, v: number) => {
    setFormats((cur) => {
      const next = { ...cur, [f]: Math.max(0, v) };
      if (f === 'match' && next.match > 0 && next.match < PAIR_MIN) {
        next.match = v > cur.match ? PAIR_MIN : 0;
      }
      const rest = count - others(next);
      if (rest < 0) return cur;
      next.choice = rest;
      return next;
    });
  };

  const rec = recommendedTime(formats);
  const minuteOptions = {
    less: Math.max(1, rec.minutes - 2),
    rec: rec.minutes,
    more: rec.minutes + 3,
  };
  const minutes =
    minutesChoice === 'custom' ? customMin || rec.minutes : minuteOptions[minutesChoice];
  const perWord = Math.round((100 / count) * 100) / 100;

  const toggleSet = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const build = async () => {
    if (!selected.length || building) return;
    setBuilding(true);
    try {
      const res = await ExamApi.build({
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
      if (!res.ok) {
        toast.error(describeTestError(res.error, 'Не удалось собрать экзамен. Попробуй ещё раз.'));
        return;
      }
      Analytics.examBuilt({
        words: res.data.items.length,
        mode,
        formats: Object.entries(res.data.counts || {})
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}:${v}`)
          .join(','),
        warnings: (res.data.warnings || []).length,
        minutes,
      });
      navigation.navigate('ExamBuild', {
        courseId,
        courseTitle,
        sessionId: res.data.sessionId,
        steps: res.data.steps || [],
        warnings: res.data.warnings || [],
      });
    } finally {
      setBuilding(false);
    }
  };

  const header = <ScreenHeader title="Новый экзамен" onBack={() => navigation.goBack()} />;
  if (loadError) {
    return (
      <Screen header={header}>
        <ErrorState onRetry={load} />
      </Screen>
    );
  }
  if (!sets) {
    return (
      <Screen header={header} contentStyle={styles.content}>
        <SkeletonCard height={100} />
        <SkeletonCard height={160} />
      </Screen>
    );
  }

  const third = Math.ceil(count / 3);
  const lastThird = count - 2 * third;

  return (
    <Screen
      header={header}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button
            title="Собрать экзамен"
            fullWidth
            loading={building}
            disabled={!selected.length}
            onPress={build}
          />
        </View>
      }
    >
      <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
        {courseTitle}
      </Text>

      {/* Наборы */}
      <View style={styles.section}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Наборы
        </Text>
        <View style={styles.chips}>
          {sets.map((s) => (
            <Chip
              key={s.setId}
              label={`${s.title} · ${s.totalCards}`}
              selected={selected.includes(s.setId)}
              onPress={() => toggleSet(s.setId)}
            />
          ))}
        </View>
      </View>

      {/* Сколько слов */}
      <Card style={styles.rowCard}>
        <View style={styles.flex}>
          <Text variant="label">Слов в экзамене</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {count} из {available}
          </Text>
        </View>
        <Stepper
          label="Слов в экзамене"
          value={count}
          onMinus={() => changeCount(count - 1)}
          onPlus={() => changeCount(count + 1)}
          minusDisabled={count <= MIN_WORDS}
          plusDisabled={count >= maxCount}
        />
      </Card>

      {/* Подбор */}
      <View style={styles.section}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Какие слова взять
        </Text>
        <View style={styles.chips}>
          <Chip
            label="По сложности"
            selected={mode === 'difficulty'}
            onPress={() => setMode('difficulty')}
          />
          <Chip label="Случайные" selected={mode === 'random'} onPress={() => setMode('random')} />
        </View>
        {mode === 'difficulty' ? (
          <Card tone="muted" style={styles.levels}>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              По тому, как класс учил слова:
            </Text>
            <View style={styles.levelRow}>
              <Level color={colors.success} n={third} label="лёгких" hint="выучили > 70%" />
              <Level color={colors.warning} n={third} label="средних" hint="30–70%" />
              <Level color={colors.error} n={lastThird} label="сложных" hint="< 30%" />
            </View>
          </Card>
        ) : null}
        <Card style={styles.rowCard}>
          <View style={styles.flex}>
            <Text variant="label">Брать слова, которые класс не открывал</Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              По умолчанию не берём: это не честная проверка
            </Text>
          </View>
          <Switch
            value={includeUnstudied}
            onValueChange={setIncludeUnstudied}
            accessibilityLabel="Брать неизученные слова"
          />
        </Card>
        <View style={[styles.note, { backgroundColor: alpha(colors.success, 10) }]}>
          <Users size={iconSize.xs} color={colors.successText} />
          <Text variant="caption" style={[styles.flex, { color: colors.successText }]}>
            Все ученики получат одни и те же слова. Порядок вопросов и вариантов у каждого свой —
            подсмотреть у соседа не получится.
          </Text>
        </View>
      </View>

      {/* Форматы */}
      <View style={styles.section}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Форматы
        </Text>
        <Card padding="s" style={styles.formats}>
          {FORMATS.map((f) => (
            <View key={f} style={styles.formatRow}>
              <View style={styles.flex}>
                <Text variant="label">{FORMAT_LABELS[f]}</Text>
                {f === 'choice' ? (
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    Остальные слова
                  </Text>
                ) : f === 'gap' ? (
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    Если у слов есть примеры
                  </Text>
                ) : f === 'match' ? (
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    Один экран, от 3 пар
                  </Text>
                ) : null}
              </View>
              {f === 'choice' ? (
                <Text variant="h3" style={styles.stepValue}>
                  {formats.choice}
                </Text>
              ) : (
                <Stepper
                  label={FORMAT_LABELS[f]}
                  value={formats[f]}
                  onMinus={() => setFormat(f, formats[f] - 1)}
                  onPlus={() => setFormat(f, formats[f] + 1)}
                  minusDisabled={formats[f] <= 0}
                  plusDisabled={
                    formats.choice <= 0 ||
                    (f === 'match' && formats.choice < PAIR_MIN && formats.match === 0)
                  }
                />
              )}
            </View>
          ))}
        </Card>
      </View>

      {/* Время */}
      <View style={styles.section}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Время на весь экзамен
        </Text>
        <View style={styles.timeRow}>
          {(['less', 'rec', 'more'] as const).map((k) => {
            const on = minutesChoice === k;
            return (
              <Pressable
                key={k}
                onPress={() => setMinutesChoice(k)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${minuteOptions[k]} минут${k === 'rec' ? ', советуем' : ''}`}
                style={[
                  styles.timeBtn,
                  {
                    borderColor: on ? colors.primary : colors.border,
                    borderWidth: on ? 2 : 1,
                    backgroundColor: on ? alpha(colors.primary, 10) : colors.surface,
                  },
                ]}
              >
                <Text variant="label" style={{ color: on ? colors.primary : colors.textPrimary }}>
                  {minuteOptions[k]} мин
                </Text>
                {k === 'rec' ? (
                  <Text
                    variant="caption"
                    style={{ color: on ? colors.primary : colors.textSecondary }}
                  >
                    Советуем
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              setMinutesChoice('custom');
              setCustomMin(customMin || rec.minutes + 5);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: minutesChoice === 'custom' }}
            accessibilityLabel="Своё время"
            style={[
              styles.timeBtn,
              {
                borderColor: minutesChoice === 'custom' ? colors.primary : colors.border,
                borderWidth: minutesChoice === 'custom' ? 2 : 1,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Text variant="label">Своё</Text>
          </Pressable>
        </View>
        {minutesChoice === 'custom' ? (
          <Card style={styles.rowCard}>
            <Text variant="label" style={styles.flex}>
              Минут
            </Text>
            <Stepper
              label="Минут"
              value={customMin || rec.minutes}
              onMinus={() => setCustomMin(Math.max(1, (customMin || rec.minutes) - 1))}
              onPlus={() => setCustomMin(Math.min(180, (customMin || rec.minutes) + 1))}
              minusDisabled={(customMin || rec.minutes) <= 1}
            />
          </Card>
        ) : null}
        <Card tone="muted">
          <Text variant="label">Как посчитали {rec.minutes} мин</Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {timeExplanation(formats)} Меняется сразу, если поменять форматы или число слов.
          </Text>
        </Card>
      </View>

      {/* Оценка и результаты */}
      <View style={styles.section}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Оценка
        </Text>
        <Card style={styles.rowCard}>
          <Text variant="label" style={styles.flex}>
            Шкала 100 баллов
          </Text>
          <Text variant="label" style={{ color: colors.textSecondary }}>
            по {perWord} за слово
          </Text>
        </Card>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          Результаты ученикам
        </Text>
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
        <Card style={styles.rowCard}>
          <View style={styles.flex}>
            <Text variant="label">Контроль выхода из приложения</Text>
            <Text variant="caption" style={{ color: colors.textSecondary }}>
              Вышел дольше чем на 3 секунды — экзамен завершается
            </Text>
          </View>
          <Switch
            value={exitControl}
            onValueChange={setExitControl}
            accessibilityLabel="Контроль выхода"
          />
        </Card>
      </View>
    </Screen>
  );
}

function Level({
  color,
  n,
  label,
  hint,
}: {
  color: string;
  n: number;
  label: string;
  hint: string;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.level}>
      <View style={styles.levelTop}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text variant="label">
          {n} {label}
        </Text>
      </View>
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, gap: spacing.l },
  footer: { paddingHorizontal: screenPadding },
  section: { gap: spacing.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  flex: { flex: 1 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepBtn: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 32, textAlign: 'center', fontVariant: ['tabular-nums'] },
  levels: { gap: spacing.s },
  levelRow: { flexDirection: 'row', gap: spacing.s },
  level: { flex: 1, gap: 2 },
  levelTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.s,
    borderRadius: borderRadius.m,
    alignItems: 'flex-start',
  },
  formats: { gap: spacing.xs },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: heights.touch,
  },
  timeRow: { flexDirection: 'row', gap: spacing.xs },
  timeBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
  },
});
