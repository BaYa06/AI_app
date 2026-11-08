/**
 * Ученики курса: статусы, фильтры, форматирование, строка ученика
 * (Clean 8 — перенесено из TeacherStudentsScreen.tsx без изменений.)
 */
import { View, Pressable, TouchableOpacity } from 'react-native';
import { Trash2, Flame } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { alpha, iconSize } from '@/constants';
import { pluralize } from '@/utils';
import { styles } from './styles';

export type StudentStatus = 'online' | 'away' | 'offline' | 'inactive';

export interface Student {
  id: string;
  name: string;
  initials: string;
  status: StudentStatus;
  streak: number;
  lastActivity: string;
  lastActivityColor: string;
  todayCards: number;
  /** Слова курса, которым пришло время повторения */
  waitingReviews: number;
}

export type FilterKey = 'all' | 'active' | 'away3d' | 'away7d';

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'away3d', label: 'Не заходили 3д' },
  { key: 'away7d', label: 'Не заходили 7д+' },
];

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

export function formatLastActivity(
  lastActiveDate: string | null,
  colors: ReturnType<typeof useThemeColors>
): { text: string; color: string } {
  if (!lastActiveDate) return { text: 'Нет активности', color: colors.textTertiary };
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { text: 'Сегодня', color: colors.successText };
  if (diffDays === 1) return { text: 'Вчера', color: colors.warningText };
  if (diffDays <= 6) return { text: `${diffDays} дн. назад`, color: colors.errorText };
  if (diffDays < 30) return { text: `${diffDays} дн. назад`, color: colors.textTertiary };
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5) return { text: `${weeks} нед. назад`, color: colors.textTertiary };
  const months = Math.floor(diffDays / 30);
  return { text: `${months} мес. назад`, color: colors.textTertiary };
}

// ==================== STUDENT ROW ====================

export function StudentRow({
  student,
  colors,
  onPress,
  onRemove,
}: {
  student: Student;
  colors: any;
  onPress: () => void;
  onRemove: () => void;
}) {
  const isInactive = student.status === 'inactive';
  const dotColor = student.lastActivityColor;

  const avatarBg = isInactive ? colors.surfaceMuted : alpha(colors.primary, 20);
  const avatarTextColor = isInactive ? colors.textSecondary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      // «Удалить ученика» внутри строки VoiceOver не видит — даём его действием строки
      accessibilityActions={[{ name: 'remove', label: 'Удалить ученика' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'remove') onRemove();
      }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          opacity: pressed ? 0.7 : isInactive ? 0.7 : 1,
        },
      ]}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[styles.avatarText, { color: avatarTextColor }]}>{student.initials}</Text>
        </View>
        <View
          style={[styles.statusDot, { backgroundColor: dotColor, borderColor: colors.background }]}
        />
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <View style={styles.rowNameRow}>
          <Text
            style={[
              styles.rowName,
              { color: isInactive ? colors.textSecondary : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {student.name}
          </Text>
          {student.streak > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: alpha(colors.streak, 10) }]}>
              <Flame size={iconSize.xs} color={colors.streak} />
              <Text style={[styles.streakText, { color: colors.warningText }]}>
                {student.streak}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rowMetaRow}>
          <Text style={[styles.rowMeta, { color: student.lastActivityColor }]}>
            {student.lastActivity}
          </Text>
          {student.todayCards > 0 && (
            <View style={[styles.cardsBadge, { backgroundColor: alpha(colors.success, 10) }]}>
              <Text style={[styles.cardsBadgeText, { color: colors.successText }]}>
                {student.todayCards}{' '}
                {pluralize(student.todayCards, 'карточка', 'карточки', 'карточек')}
              </Text>
            </View>
          )}
          {student.waitingReviews > 0 && (
            <View style={[styles.cardsBadge, { backgroundColor: alpha(colors.warning, 10) }]}>
              <Text style={[styles.cardsBadgeText, { color: colors.warningText }]}>
                {student.waitingReviews} ждут повторения
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Remove button */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Удалить ученика"
        onPress={onRemove}
        activeOpacity={0.6}
        hitSlop={8}
        style={[styles.removeBtn, { backgroundColor: alpha(colors.error, 10) }]}
      >
        <Trash2 size={16} color={colors.error} />
      </TouchableOpacity>
    </Pressable>
  );
}
