/**
 * AboutMeForm — «Сколько тебе лет?» и «Ходишь на курсы?» (plan/new/push_notifications.md, шаг 2.7)
 * @description Общая форма для необязательного шага после онбординга и для «Профиль → Мои данные».
 * Только то, что нужно напоминаниям: возраст диапазоном (до 18 — без чужих имён и вечерних пушей),
 * дни и час занятий в центре (пуш «повтори перед занятием»). Ничего из этого не обязательно.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip } from '@/components/ui';
import { spacing, borderRadius, alpha } from '@/constants';
import type { AgeRange } from '@/services/NeonService';

export interface AboutMeValue {
  ageRange: AgeRange | null;
  attendsClasses: boolean | null;
  classDays: string[];
  classHour: number;
}

export const AGE_OPTIONS: { key: AgeRange; label: string }[] = [
  { key: 'under13', label: 'До 13' },
  { key: '13-17', label: '13–17' },
  { key: '18-24', label: '18–24' },
  { key: '25-34', label: '25–34' },
  { key: '35+', label: '35+' },
];

export const WEEK_DAYS = [
  { key: 'mon', label: 'Пн' },
  { key: 'tue', label: 'Вт' },
  { key: 'wed', label: 'Ср' },
  { key: 'thu', label: 'Чт' },
  { key: 'fri', label: 'Пт' },
  { key: 'sat', label: 'Сб' },
  { key: 'sun', label: 'Вс' },
] as const;

const MIN_CLASS_HOUR = 6;
const MAX_CLASS_HOUR = 22;
export const DEFAULT_CLASS_HOUR = 18;

interface Props {
  value: AboutMeValue;
  onChange: (value: AboutMeValue) => void;
}

export function AboutMeForm({ value, onChange }: Props) {
  const colors = useThemeColors();
  const set = (patch: Partial<AboutMeValue>) => onChange({ ...value, ...patch });
  const toggleDay = (day: string) =>
    set({ classDays: value.classDays.includes(day) ? value.classDays.filter((d) => d !== day) : [...value.classDays, day] });
  const shiftHour = (delta: number) =>
    set({ classHour: Math.min(MAX_CLASS_HOUR, Math.max(MIN_CLASS_HOUR, value.classHour + delta)) });

  return (
    <View style={st.form}>
      <View style={st.block}>
        <Text variant="label" color="secondary">Сколько тебе лет?</Text>
        <View style={st.chips} accessibilityRole="radiogroup">
          {AGE_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              selected={value.ageRange === o.key}
              onPress={() => set({ ageRange: value.ageRange === o.key ? null : o.key })}
            />
          ))}
        </View>
      </View>

      <View style={st.block}>
        <Text variant="label" color="secondary">Ходишь на курсы или в учебный центр?</Text>
        <View style={st.chips} accessibilityRole="radiogroup">
          <Chip label="Да" selected={value.attendsClasses === true} onPress={() => set({ attendsClasses: true })} />
          <Chip label="Нет" selected={value.attendsClasses === false} onPress={() => set({ attendsClasses: false })} />
        </View>
      </View>

      {value.attendsClasses === true && (
        <View style={[st.block, st.classes, { backgroundColor: alpha(colors.primary, 10) }]}>
          <Text variant="bodySmall" color="secondary">
            Напомним повторить слова за пару часов до занятия
          </Text>
          <Text variant="label" color="secondary">В какие дни</Text>
          <View style={st.days}>
            {WEEK_DAYS.map((d) => (
              <Chip key={d.key} label={d.label} selected={value.classDays.includes(d.key)} onPress={() => toggleDay(d.key)} />
            ))}
          </View>
          <Text variant="label" color="secondary">Во сколько начинается</Text>
          <View style={st.hourRow}>
            <Button variant="icon" icon={ChevronDown} background="none" accessibilityLabel="Раньше на час" onPress={() => shiftHour(-1)} />
            <Text
              variant="h2"
              accessibilityLabel={`Занятие в ${value.classHour}:00`}
              style={{ color: colors.textPrimary }}
            >
              {`${value.classHour}:00`}
            </Text>
            <Button variant="icon" icon={ChevronUp} background="none" accessibilityLabel="Позже на час" onPress={() => shiftHour(1)} />
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  form: {
    gap: spacing.l,
  },
  block: {
    gap: spacing.s,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  classes: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
});
