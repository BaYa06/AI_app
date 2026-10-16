/**
 * CourseScheduleSheet — «Расписание занятий» курса для учителя (plan/new/push_notifications.md, 2.8)
 * @description Учитель указывает дни и время один раз — ученики курса получают «Скоро занятие:
 * повтори N слов курса» за 1–2 часа до начала. Одно время на все выбранные дни (так у большинства групп).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, Sheet, toast } from '@/components/ui';
import { spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { WEEK_DAYS } from './AboutMeForm';

const STEP_MIN = 15;
const DEFAULT_MINUTES = 18 * 60;
const MIN_MINUTES = 7 * 60;
const MAX_MINUTES = 22 * 60;

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const fromTime = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

interface Props {
  visible: boolean;
  courseId: string;
  onClose: () => void;
}

export function CourseScheduleSheet({ visible, courseId, onClose }: Props) {
  const colors = useThemeColors();
  const [days, setDays] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    NeonService.getCourseSchedule(courseId)
      .then((schedule) => {
        if (!schedule) return;
        setDays(schedule.map((s) => s.day));
        if (schedule[0]) setMinutes(fromTime(schedule[0].time));
      })
      .finally(() => setLoading(false));
  }, [visible, courseId]);

  const toggleDay = (day: string) => setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  const shift = (delta: number) => setMinutes((m) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, m + delta)));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await NeonService.setCourseSchedule(courseId, days.map((day) => ({ day, time: toTime(minutes) })));
    setSaving(false);
    if (ok) {
      toast.success(days.length ? 'Расписание сохранено' : 'Расписание убрано');
      onClose();
    } else {
      toast.error('Не удалось сохранить. Проверь интернет');
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Расписание занятий"
      footer={<Button title={saving ? 'Сохранение…' : 'Сохранить'} onPress={handleSave} disabled={saving || loading} fullWidth />}
    >
      {loading ? (
        <View style={st.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={st.body}>
          <Text variant="body" color="secondary">
            За 1–2 часа до занятия ученики получат напоминание повторить слова курса.
          </Text>
          <Text variant="label" color="secondary">Дни занятий</Text>
          <View style={st.days}>
            {WEEK_DAYS.map((d) => (
              <Chip key={d.key} label={d.label} selected={days.includes(d.key)} onPress={() => toggleDay(d.key)} />
            ))}
          </View>
          <Text variant="label" color="secondary">Начало занятия</Text>
          <View style={st.timeRow}>
            <Button variant="icon" icon={ChevronDown} background="none" accessibilityLabel="Раньше на 15 минут" onPress={() => shift(-STEP_MIN)} />
            <Text variant="h2" accessibilityLabel={`Начало в ${toTime(minutes)}`} style={{ color: colors.textPrimary }}>
              {toTime(minutes)}
            </Text>
            <Button variant="icon" icon={ChevronUp} background="none" accessibilityLabel="Позже на 15 минут" onPress={() => shift(STEP_MIN)} />
          </View>
          <Text variant="caption" color="secondary">Время — по часовому поясу курса</Text>
        </View>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  body: {
    gap: spacing.s,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
});
