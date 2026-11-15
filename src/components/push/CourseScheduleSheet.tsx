/**
 * CourseScheduleSheet — «Расписание занятий» курса для учителя (plan/new/push_notifications.md, 2.8)
 * @description Учитель указывает дни и время один раз — ученики курса получают «Скоро занятие:
 * повтори N слов курса» за 1–2 часа до начала. Одно время на все выбранные дни (так у большинства групп).
 * Teacher 11 (plan/done/teacher_cabinet.md): на iOS — нативный лист (ScheduleSheet.swift,
 * nativeScheduleSheet.ts), здесь — Android и веб. Время, тексты и сохранение — courseSchedule.ts.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, Sheet, toast } from '@/components/ui';
import { spacing } from '@/constants';
import { WEEK_DAYS } from './AboutMeForm';
import {
  DEFAULT_MINUTES,
  SCHEDULE_TEXTS as T,
  loadScheduleForm,
  saveSchedule,
} from './courseSchedule';
import { LessonTimeWheel } from './LessonTimeWheel';
import { isNativeScheduleSheet, useNativeScheduleSheet } from './nativeScheduleSheet';

// Прежние экспорты — для тех, кто брал время отсюда
export { STEP_MIN, DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES, toTime } from './courseSchedule';

interface Props {
  visible: boolean;
  courseId: string;
  onClose: () => void;
}

export function CourseScheduleSheet(props: Props) {
  useNativeScheduleSheet(props);
  if (isNativeScheduleSheet) return null;
  return <CourseScheduleSheetRN {...props} />;
}

function CourseScheduleSheetRN({ visible, courseId, onClose }: Props) {
  const colors = useThemeColors();
  const [days, setDays] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadScheduleForm(courseId)
      .then((form) => {
        setDays(form.days);
        setMinutes(form.minutes);
      })
      .finally(() => setLoading(false));
  }, [visible, courseId]);

  const toggleDay = (day: string) =>
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await saveSchedule(courseId, days, minutes);
    setSaving(false);
    if (ok) {
      toast.success(days.length ? T.saved : T.removed);
      onClose();
    } else {
      toast.error(T.saveFailed);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={T.title}
      footer={
        <Button
          title={saving ? T.saving : T.save}
          onPress={handleSave}
          disabled={saving || loading}
          fullWidth
        />
      }
    >
      {loading ? (
        <View style={st.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={st.body}>
          <Text variant="body" color="secondary">
            {T.description}
          </Text>
          <Text variant="label" color="secondary">
            {T.daysLabel}
          </Text>
          <View style={st.days}>
            {WEEK_DAYS.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                selected={days.includes(d.key)}
                onPress={() => toggleDay(d.key)}
              />
            ))}
          </View>
          <Text variant="label" color="secondary">
            {T.timeLabel}
          </Text>
          <LessonTimeWheel value={minutes} onChange={setMinutes} />
          <Text variant="caption" color="secondary">
            {T.timeHint}
          </Text>
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
});
