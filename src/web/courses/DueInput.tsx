/**
 * Срок задания: дата и время в часовом поясе компьютера. Вместо барабана из телефона — системное поле
 * браузера (datetime-local): клавиатура, календарь и доступность — из коробки.
 */
import React from 'react';
import { View } from 'react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing, typography } from '@/constants';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → «2026-11-30T20:00» (локальное время, как ждёт datetime-local) */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «2026-11-30T20:00» → Date; пустое или кривое — null */
export function fromLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function DueInput({
  value,
  onChange,
  label = 'Срок: дата и время',
}: {
  value: Date;
  onChange: (d: Date) => void;
  label?: string;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <input
        type="datetime-local"
        aria-label={label}
        value={toLocalInput(value)}
        min={toLocalInput(new Date())}
        step={300}
        onChange={(e) => {
          const d = fromLocalInput(e.currentTarget.value);
          if (d) onChange(d);
        }}
        style={{
          font: 'inherit',
          fontSize: typography.body.fontSize,
          color: colors.textPrimary,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.m,
          padding: `${spacing.xs}px ${spacing.s}px`,
          minHeight: 40,
          colorScheme: 'light dark',
        }}
      />
    </View>
  );
}
