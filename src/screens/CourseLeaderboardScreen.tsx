/**
 * Рейтинг курса за неделю (план, этап 4)
 * @description Места учеников курса по очкам недели: пьедестал, список, своё место, награды,
 * правила начисления. Очки и места считает сервер (api/progress.js?action=leaderboard).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp, Gem, Trophy } from 'lucide-react-native';
import { Text } from '@/components/common';
import { EmptyState, ErrorState, ScreenHeader, Switch } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, alpha, borderRadius, heights, iconSize, screenPadding, type ColorToken } from '@/constants';
import { NeonService, type CourseLeaderboard } from '@/services/NeonService';
import { StorageService } from '@/services/StorageService';
import { triggerHaptic } from '@/utils/haptic';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'CourseLeaderboard'>;
type Week = 'current' | 'previous';
type Board = Extract<CourseLeaderboard, { rows: unknown }>;
type Row = Board['rows'][number];

/** Что пользователь уже видел: место в текущей неделе и просмотренные итоги (для тизера на главной) */
export const leaderboardSeenKey = (courseId: string) => `leaderboard_seen_${courseId}`;
export type LeaderboardSeen = { weekStart?: string; place?: number | null; resultsWeekStart?: string };

// Пьедестал: подложка — цвет медали 20 %, текст — textPrimary (читаемо в обеих темах)
const PODIUM: ColorToken[] = ['star', 'silver', 'bronze'];

function pointsWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return 'очков';
  if (m10 === 1) return 'очко';
  if (m10 >= 2 && m10 <= 4) return 'очка';
  return 'очков';
}

function timeLeft(endsAt: number | null): string | null {
  if (!endsAt) return null;
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'Неделя закрывается';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `Новая неделя через ${days} дн ${hours} ч`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `До конца недели ${hours} ч ${minutes} мин`;
}

function initial(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}

export function CourseLeaderboardScreen({ navigation, route }: Props) {
  const { courseId, courseTitle } = route.params;
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [week, setWeek] = useState<Week>(route.params.week ?? 'current');
  // Сразу — последний сохранённый рейтинг, свежий подменит без индикатора загрузки
  const [board, setBoard] = useState<CourseLeaderboard | null>(() => NeonService.cachedLeaderboard(courseId, route.params.week ?? 'current'));
  const [loading, setLoading] = useState(() => board === null);
  const [error, setError] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const cached = NeonService.cachedLeaderboard(courseId, week);
      if (cached) setBoard(cached);
      setLoading(!cached);
      setError(false);
      NeonService.loadLeaderboard(courseId, week).then((result) => {
        if (!active) return;
        if (result) setBoard(result);
        // Ошибку показываем, только если и сохранённого нет (без сети — последняя таблица)
        setError(result === null && !cached);
        setLoading(false);
      });
      return () => { active = false; };
    }, [courseId, week, retryTick]),
  );

  // Запоминаем увиденное — тизер на главной сравнивает с этим («тебя обогнали», «итоги готовы»)
  useEffect(() => {
    if (!board || !('rows' in board)) return;
    const seen = StorageService.getObject<LeaderboardSeen>(leaderboardSeenKey(courseId)) || {};
    if (board.week === 'current') {
      StorageService.setObject(leaderboardSeenKey(courseId), { ...seen, weekStart: board.weekStart, place: board.me?.place ?? null });
    } else if (board.frozen) {
      StorageService.setObject(leaderboardSeenKey(courseId), { ...seen, resultsWeekStart: board.weekStart });
    }
  }, [board, courseId]);

  const data = board && 'rows' in board ? board : null;
  const ranked = useMemo(() => (data ? data.rows.filter((r) => r.place !== null) : []), [data]);
  const hasPoints = ranked.some((r) => r.points > 0);
  const podium = hasPoints ? ranked.slice(0, 3) : [];
  const rest = hasPoints ? ranked.slice(3) : ranked;
  const hiddenRows = data ? data.rows.filter((r) => r.place === null) : [];

  const cardBg = colors.surface;
  const mutedBg = colors.surfaceMuted;

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    if (savingToggle) return;
    setSavingToggle(true);
    const ok = await NeonService.setCourseRatingEnabled(courseId, enabled);
    setSavingToggle(false);
    if (ok) setRetryTick((t) => t + 1);
  }, [courseId, savingToggle]);

  const renderRow = (r: Row) => (
    <View
      key={r.userId}
      style={[
        styles.row,
        { borderBottomColor: colors.border },
        r.isMe && { backgroundColor: alpha(colors.primary, 10), borderRadius: borderRadius.m, borderBottomWidth: 0 },
      ]}
    >
      <Text variant="body" style={[styles.rowPlace, { color: r.isMe ? colors.primary : colors.textSecondary }]}>
        {r.place ?? '–'}
      </Text>
      <View style={[styles.avatar, { backgroundColor: r.isMe ? colors.primaryFill : mutedBg }]}>
        <Text variant="label" style={[styles.bold, { color: r.isMe ? colors.onPrimary : colors.textPrimary }]}>{initial(r.name)}</Text>
      </View>
      <View style={styles.flex1}>
        <Text variant="body" style={{ color: colors.textPrimary, fontWeight: r.isMe ? '700' : '400' }} numberOfLines={1}>
          {r.isMe ? 'Ты' : r.name}
        </Text>
        {r.place === null && (
          <Text variant="caption" style={{ color: colors.textTertiary }}>скрыт из рейтинга</Text>
        )}
        {r.reward > 0 && (
          <Text variant="caption" style={{ color: colors.warningText }}>+{r.reward} алмазов</Text>
        )}
      </View>
      <Text variant="body" style={[styles.bold, { color: r.isMe ? colors.primary : colors.textPrimary }]}>{r.points}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <ScreenHeader
        onBack={() => navigation.goBack()}
        bordered
        center={
          <View style={styles.headerTitles} accessibilityRole="header">
            <Text variant="button" style={[styles.noLetterSpacing, { color: colors.textPrimary }]}>Рейтинг недели</Text>
            {!!courseTitle && (
              <Text variant="caption" color="secondary" numberOfLines={1}>{courseTitle}</Text>
            )}
          </View>
        }
      />

      {/* Эта / прошлая неделя */}
      <View style={[styles.segmented, { backgroundColor: mutedBg }]}>
        {(['current', 'previous'] as Week[]).map((w) => {
          const active = week === w;
          return (
            <Pressable hitSlop={{ top: spacing.xxs, bottom: spacing.xxs }}
              key={w}
              onPress={() => { triggerHaptic('selection'); setWeek(w); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.segment, active && { backgroundColor: colors.surface }]}
            >
              <Text variant="bodySmall" style={{ color: active ? colors.textPrimary : colors.textSecondary, fontWeight: active ? '700' : '400' }}>
                {w === 'current' ? 'Эта неделя' : 'Прошлая'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <ErrorState title="Не удалось загрузить рейтинг" onRetry={() => setRetryTick((t) => t + 1)} />
      ) : !data ? (
        <EmptyState icon={Trophy} color={colors.textSecondary} title="Учитель выключил рейтинг в этом курсе" />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
            <Text variant="bodySmall" align="center" style={[styles.caption, { color: colors.textSecondary }]}>
              {data.week === 'current'
                ? timeLeft(data.endsAt)
                : data.frozen ? 'Итоги прошлой недели' : 'Итоги подводятся — загляни чуть позже'}
            </Text>

            {data.isTeacher && !data.enabled && (
              <Text variant="bodySmall" align="center" style={[styles.caption, { color: colors.warningText }]}>Ученики сейчас не видят рейтинг</Text>
            )}

            {/* Пьедестал: 2 — 1 — 3 */}
            {podium.length > 0 && (
              <View style={styles.podium}>
                {[1, 0, 2].map((i) => {
                  const r = podium[i];
                  if (!r) return <View key={i} style={styles.podiumCol} />;
                  const podiumHeights = [104, 76, 60];
                  return (
                    <View key={r.userId} style={styles.podiumCol}>
                      {i === 0 && <Trophy size={iconSize.m} color={colors.star} fill={alpha(colors.star, 20)} style={styles.podiumTrophy} />}
                      <View
                        style={[
                          styles.podiumAvatar,
                          { backgroundColor: r.isMe ? colors.primaryFill : alpha(colors[PODIUM[i]], 20) },
                          i === 0 && styles.podiumAvatarFirst,
                        ]}
                      >
                        <Text variant="bodyLarge" style={[styles.bold, { color: r.isMe ? colors.onPrimary : colors.textPrimary }]}>{initial(r.name)}</Text>
                      </View>
                      <Text variant="label" style={[styles.podiumName, { color: colors.textPrimary }]} numberOfLines={1}>{r.isMe ? 'Ты' : r.name}</Text>
                      <View
                        accessible
                        accessibilityLabel={`${i + 1} место: ${r.points} ${pointsWord(r.points)}`}
                        style={[styles.podiumBase, { height: podiumHeights[i], backgroundColor: r.isMe ? alpha(colors.primary, 10) : alpha(colors[PODIUM[i]], 20) }]}
                      >
                        <Text variant="h2" style={{ color: r.isMe ? colors.primary : colors.textPrimary }}>{i + 1}</Text>
                        <Text variant="caption" style={[styles.semibold, { color: r.isMe ? colors.primary : colors.textSecondary }]}>
                          {r.points} {pointsWord(r.points)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Награда */}
            {data.week === 'current' && (
              <View style={[styles.note, { backgroundColor: mutedBg }]}>
                <Gem size={iconSize.s} color={colors.diamond} />
                <Text variant="bodySmall" style={[styles.flex1, { color: colors.textPrimary }]}>
                  Топ-3 в конце недели: +{data.rewards.join(' / +')} алмазов (от 20 очков)
                </Text>
              </View>
            )}

            {/* Список */}
            <View style={[styles.list, { backgroundColor: cardBg, borderColor: colors.border }]}>
              {!hasPoints && (
                <Text variant="bodySmall" align="center" style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {data.week === 'current'
                    ? 'Пока ни у кого нет очков — первое правильное повторение выведет тебя вперёд'
                    : 'На прошлой неделе очков не было'}
                </Text>
              )}
              {rest.map(renderRow)}
              {hiddenRows.map(renderRow)}
            </View>

            {/* Как считаются очки */}
            <Pressable
              onPress={() => setShowRules((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRules }}
              style={[styles.rulesHeader, { backgroundColor: cardBg, borderColor: colors.border }]}
            >
              <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>Как считаются очки</Text>
              {showRules ? <ChevronUp size={iconSize.s} color={colors.textSecondary} /> : <ChevronDown size={iconSize.s} color={colors.textSecondary} />}
            </Pressable>
            {showRules && (
              <View style={[styles.rules, { backgroundColor: cardBg, borderColor: colors.border }]}>
                {[
                  ['+1', 'новое слово — первый правильный ответ'],
                  ['+2', 'повторение вовремя — когда слову пришло время'],
                  ['+3', 'слово выучено (уровень «знаю»)'],
                  ['+5', 'слово выучено надолго'],
                ].map(([pts, text]) => (
                  <View key={pts} style={styles.ruleRow}>
                    <Text variant="body" style={[styles.rulePts, { color: colors.primary }]}>{pts}</Text>
                    <Text variant="bodySmall" style={[styles.flex1, { color: colors.textPrimary }]}>{text}</Text>
                  </View>
                ))}
                <Text variant="caption" style={[styles.ruleFoot, { color: colors.textSecondary }]}>
                  Очки дают «Тест» и «Собери слово» по наборам курса. Повтор раньше срока очков не даёт —
                  возвращайся к словам, когда им пришло время. В день — не больше 300 очков.
                </Text>
              </View>
            )}

            {/* Настройки — только у учителя. Ученик скрыть себя из рейтинга не может */}
            {data.isTeacher ? (
              <View style={[styles.settingRow, { backgroundColor: cardBg, borderColor: colors.border }]}>
                <View style={styles.flex1}>
                  <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>Рейтинг для учеников</Text>
                  <Text variant="caption" color="secondary">Ученики видят места и соревнуются за награды</Text>
                </View>
                <Switch value={data.enabled} onValueChange={toggleEnabled} disabled={savingToggle} accessibilityLabel="Рейтинг для учеников" />
              </View>
            ) : null}
          </ScrollView>

          {/* Моё место — закреплено внизу */}
          {data.me && !data.isTeacher && (
            <View style={[styles.me, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + spacing.s }]}>
              <View style={styles.flex1}>
                <Text variant="bodySmall" style={[styles.semibold, { color: colors.textPrimary }]}>
                  {data.me.points === 0
                      ? 'Набери первые очки, чтобы занять место'
                      : data.me.place === 1
                        ? 'Ты на 1-м месте — удержи до конца недели'
                        : `Ты на ${data.me.place}-м месте${data.me.gapToNext != null ? ` · до ${data.me.place! - 1}-го — ${data.me.gapToNext} ${pointsWord(data.me.gapToNext)}` : ''}`}
                </Text>
                {data.me.learnedTotal != null && (
                  <Text variant="caption" color="secondary">Всего выучено в курсе: {data.me.learnedTotal}</Text>
                )}
              </View>
              <Text variant="h2" style={{ color: colors.primary }}>{data.me.points}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  noLetterSpacing: { letterSpacing: 0 },
  headerTitles: { alignItems: 'center' },
  segmented: { flexDirection: 'row', margin: screenPadding, marginBottom: 0, padding: spacing.xxs, borderRadius: borderRadius.m },
  segment: { flex: 1, minHeight: 36, borderRadius: borderRadius.s, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.s },
  caption: { marginTop: spacing.m, paddingHorizontal: screenPadding },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.s, marginTop: spacing.l, paddingHorizontal: screenPadding },
  podiumCol: { flex: 1, maxWidth: 116, alignItems: 'center' },
  podiumTrophy: { marginBottom: spacing.xxs },
  podiumAvatar: { width: 48, height: 48, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  podiumAvatarFirst: { width: 56, height: 56 },
  podiumName: { marginVertical: spacing.xs },
  podiumBase: { width: '100%', borderTopLeftRadius: borderRadius.m, borderTopRightRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginHorizontal: screenPadding, marginTop: spacing.m, padding: spacing.s, borderRadius: borderRadius.m },
  list: { marginHorizontal: screenPadding, marginTop: spacing.m, borderRadius: borderRadius.l, borderWidth: 1, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  emptyText: { padding: spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, minHeight: 56, paddingHorizontal: spacing.xs, borderBottomWidth: 1 },
  rowPlace: { width: 24, textAlign: 'center', fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  rulesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: screenPadding, marginTop: spacing.m, minHeight: heights.input, paddingHorizontal: spacing.m, borderRadius: borderRadius.m, borderWidth: 1 },
  rules: { marginHorizontal: screenPadding, marginTop: spacing.xxs, paddingHorizontal: spacing.m, paddingVertical: spacing.s, borderRadius: borderRadius.m, borderWidth: 1, gap: spacing.xs },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  rulePts: { width: 28, fontWeight: '700' },
  ruleFoot: { marginTop: spacing.xxs },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginHorizontal: screenPadding, marginTop: spacing.m, padding: spacing.m, borderRadius: borderRadius.m, borderWidth: 1 },
  me: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: screenPadding, paddingTop: spacing.m, borderTopWidth: 1 },
});
