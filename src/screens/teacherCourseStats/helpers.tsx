/**
 * Статистика курса: статусы учеников, форматирование дат, график, аватар-заглушка
 * (Clean 8 — перенесено из TeacherCourseStatsScreen.tsx без изменений.)
 */
import { View } from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { alpha } from '@/constants';
import { styles } from './styles';

export type StudentStatus = 'online' | 'away' | 'offline' | 'inactive';

export interface CourseMember {
  id: string;
  name: string;
  initials: string;
  status: StudentStatus;
  streak: number;
  lastActiveDate: string | null;
}

// ==================== HELPERS ====================

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function getStudentStatus(lastActiveDate: string | null): StudentStatus {
  if (!lastActiveDate) return 'inactive';
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 'online';
  if (diffDays <= 2) return 'away';
  if (diffDays <= 6) return 'offline';
  return 'inactive';
}

export function formatLastActive(
  lastActiveDate: string | null,
  colors: ReturnType<typeof useThemeColors>
): { text: string; color: string } | null {
  if (!lastActiveDate) return null;
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { text: 'Сегодня', color: colors.successText };
  if (diffDays === 1) return { text: 'Вчера', color: colors.warningText };
  if (diffDays <= 6) return { text: `${diffDays} дн. назад`, color: colors.errorText };
  return { text: `${diffDays} дн. назад`, color: colors.textTertiary };
}

// ==================== CHART HELPER ====================

export const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const MONTH_NAMES = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

export function buildChartDays(
  raw: { date: string; count: number }[],
  days: number,
  totalStudents: number
): { day: string; pct: number; count: number }[] {
  const map = new Map(raw.map((r) => [r.date, r.count]));

  if (days === 7) {
    const result: { day: string; pct: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const count = map.get(dateKey) ?? 0;
      const pct = totalStudents > 0 ? count / totalStudents : 0;
      result.push({ day: DAY_NAMES[d.getDay()], pct, count });
    }
    return result;
  }

  // 30д — группируем по 5 дней (6 столбцов)
  const CHUNK = 5;
  const chunks: { day: string; pct: number; count: number }[] = [];

  for (let c = 0; c < 6; c++) {
    const startOffset = 29 - c * CHUNK;
    let total = 0;
    let daysInChunk = 0;
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;

    for (let j = 0; j < CHUNK; j++) {
      const offset = startOffset - j;
      if (offset < 0) break;
      const d = new Date();
      d.setDate(d.getDate() - offset);
      const dateKey = d.toISOString().split('T')[0];
      total += map.get(dateKey) ?? 0;
      daysInChunk++;
      if (!firstDate) firstDate = d;
      lastDate = d;
    }

    const avg = daysInChunk > 0 ? total / daysInChunk : 0;
    const pct = totalStudents > 0 ? avg / totalStudents : 0;
    const label =
      firstDate && lastDate
        ? `${firstDate.getDate()}–${lastDate.getDate()} ${MONTH_NAMES[lastDate.getMonth()]}`
        : '';

    chunks.push({ day: label, pct: Math.min(pct, 1), count: Math.round(avg) });
  }

  return chunks;
}

// ==================== COMPONENTS ====================

export function AvatarPlaceholder({ member, colors }: { member: CourseMember; colors: any }) {
  const isInactive = member.status === 'inactive';
  const dotColor =
    member.status === 'online'
      ? colors.success
      : member.status === 'away'
        ? colors.warning
        : member.status === 'offline'
          ? colors.error
          : colors.textTertiary;
  const lastActive = formatLastActive(member.lastActiveDate, colors);

  return (
    <View style={styles.studentItem}>
      <View style={styles.avatarWrap}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: isInactive ? colors.border : alpha(colors.primary, 20) },
          ]}
        >
          <Text
            style={[
              styles.avatarInitials,
              { color: isInactive ? colors.textSecondary : colors.primary },
            ]}
          >
            {member.initials}
          </Text>
        </View>
        <View
          style={[styles.onlineDot, { backgroundColor: dotColor, borderColor: colors.background }]}
        />
      </View>
      <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>
        {member.name}
      </Text>
      {lastActive && (
        <Text style={[styles.studentLastActive, { color: lastActive.color }]}>
          {lastActive.text}
        </Text>
      )}
    </View>
  );
}
