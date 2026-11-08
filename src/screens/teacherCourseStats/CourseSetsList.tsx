/**
 * Наборы курса: прогресс учеников по каждому
 * (Clean 8 — вынесено из TeacherCourseStatsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { styles } from './styles';
import { type CourseMember } from './helpers';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  cardBg: string;
  cardBorder: string;
  members: CourseMember[];
  setRetryTick: React.Dispatch<React.SetStateAction<number>>;
  setsError: boolean;
  setsLoading: boolean;
  setsStats: Awaited<ReturnType<typeof NeonService.loadCourseSetStats>>;
};

export function CourseSetsList({
  colors,
  cardBg,
  cardBorder,
  members,
  setRetryTick,
  setsError,
  setsLoading,
  setsStats,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        Наборы{setsStats.length > 0 ? ` (${setsStats.length})` : ''}
      </Text>
      {setsLoading ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={{ marginVertical: spacing.m }}
        />
      ) : setsError ? (
        <View style={{ alignItems: 'flex-start', gap: 6, marginVertical: spacing.s }}>
          <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
            Не удалось загрузить наборы
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setRetryTick((t) => t + 1)}>
            <Text style={[styles.viewAll, { color: colors.primary }]}>Повторить</Text>
          </Pressable>
        </View>
      ) : setsStats.length === 0 ? (
        <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
          Нет данных — ученики ещё не начали учить
        </Text>
      ) : (
        <View style={styles.setsList}>
          {setsStats.map((set) => (
            <View
              key={set.setId}
              style={[styles.setCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            >
              {set.isOfficial && (
                <View style={styles.unitTag}>
                  <BookOpen size={12} color={colors.primary} />
                  <Text style={[styles.unitTagText, { color: colors.primary }]} numberOfLines={1}>
                    {[set.bookTitle, set.unitOpen === false ? 'закрыт' : 'открыт']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              )}
              <View style={styles.setCardHeader}>
                <Text
                  style={[styles.setCardTitle, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {set.title}
                </Text>
                <Text style={[styles.setCardWords, { color: colors.textSecondary }]}>
                  {set.totalCards} слов
                </Text>
              </View>

              {/* Progress bar */}
              <View style={[styles.progressBg, { backgroundColor: colors.surfaceMuted }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(set.progressPct, 100)}%` as any,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>

              <View style={styles.setCardMeta}>
                <Text style={[styles.setCardMetaText, { color: colors.textSecondary }]}>
                  {set.studentsStarted} из {members.length} начали
                  {members.length > set.studentsStarted
                    ? ` · ${members.length - set.studentsStarted} не начинали`
                    : ''}
                  {` · ${set.studentsCompleted} завершили`}
                </Text>
                <Text style={[styles.setCardAccuracy, { color: colors.primary }]}>
                  {set.progressPct}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
