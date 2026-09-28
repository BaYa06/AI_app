/**
 * Рейтинг курса за неделю (план, этап 4)
 * @description Места учеников курса по очкам недели: пьедестал, список, своё место, награды,
 * правила начисления. Очки и места считает сервер (api/progress.js?action=leaderboard).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Switch, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Trophy } from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing } from '@/constants';
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

const PODIUM = [
  { bg: '#FEF3C7', fg: '#92400E' }, // 1 — золото
  { bg: '#E5E7EB', fg: '#374151' }, // 2 — серебро
  { bg: '#FDE7D3', fg: '#9A3412' }, // 3 — бронза
];

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
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
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

  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const mutedBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F1F6';

  const toggleHidden = useCallback(async (hidden: boolean) => {
    if (savingToggle) return;
    setSavingToggle(true);
    const ok = await NeonService.setHiddenFromRating(courseId, hidden);
    setSavingToggle(false);
    if (ok) setRetryTick((t) => t + 1);
  }, [courseId, savingToggle]);

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
        r.isMe && { backgroundColor: colors.primary + '14', borderRadius: 12, borderBottomWidth: 0 },
      ]}
    >
      <Text style={[styles.rowPlace, { color: r.isMe ? colors.primary : colors.textSecondary }]}>
        {r.place ?? '–'}
      </Text>
      <View style={[styles.avatar, { backgroundColor: r.isMe ? colors.primary : mutedBg }]}>
        <Text style={[styles.avatarText, { color: r.isMe ? '#FFFFFF' : colors.textPrimary }]}>{initial(r.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: colors.textPrimary, fontWeight: r.isMe ? '700' : '500' }]} numberOfLines={1}>
          {r.isMe ? 'Ты' : r.name}
        </Text>
        {r.place === null && (
          <Text style={[styles.rowHint, { color: colors.textTertiary }]}>скрыт из рейтинга</Text>
        )}
        {r.reward > 0 && (
          <Text style={[styles.rowHint, { color: colors.warning }]}>+{r.reward} алмазов</Text>
        )}
      </View>
      <Text style={[styles.rowPoints, { color: r.isMe ? colors.primary : colors.textPrimary }]}>{r.points}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Назад">
          <ArrowLeft size={22} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Рейтинг недели</Text>
          {!!courseTitle && (
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{courseTitle}</Text>
          )}
        </View>
      </View>

      {/* Эта / прошлая неделя */}
      <View style={[styles.segmented, { backgroundColor: mutedBg }]}>
        {(['current', 'previous'] as Week[]).map((w) => {
          const active = week === w;
          return (
            <Pressable
              key={w}
              onPress={() => { triggerHaptic('selection'); setWeek(w); }}
              style={[styles.segment, active && { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
            >
              <Text style={[styles.segmentText, { color: active ? colors.textPrimary : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>
                {w === 'current' ? 'Эта неделя' : 'Прошлая'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <AlertTriangle size={32} color={colors.textSecondary} />
          <Text style={[styles.centerText, { color: colors.textPrimary }]}>Не удалось загрузить рейтинг</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => setRetryTick((t) => t + 1)}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Trophy size={36} color={colors.textTertiary} />
          <Text style={[styles.centerText, { color: colors.textPrimary }]}>Учитель выключил рейтинг в этом курсе</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.caption, { color: colors.textSecondary }]}>
              {data.week === 'current'
                ? timeLeft(data.endsAt)
                : data.frozen ? 'Итоги прошлой недели' : 'Итоги подводятся — загляни чуть позже'}
            </Text>

            {data.isTeacher && !data.enabled && (
              <Text style={[styles.caption, { color: colors.warning }]}>Ученики сейчас не видят рейтинг</Text>
            )}

            {/* Пьедестал: 2 — 1 — 3 */}
            {podium.length > 0 && (
              <View style={styles.podium}>
                {[1, 0, 2].map((i) => {
                  const r = podium[i];
                  if (!r) return <View key={i} style={styles.podiumCol} />;
                  const heights = [104, 76, 60];
                  return (
                    <View key={r.userId} style={styles.podiumCol}>
                      {i === 0 && <Ionicons name="trophy" size={24} color="#F59E0B" style={{ marginBottom: 4 }} />}
                      <View style={[styles.podiumAvatar, { backgroundColor: r.isMe ? colors.primary : PODIUM[i].bg }, i === 0 && styles.podiumAvatarFirst]}>
                        <Text style={[styles.podiumAvatarText, { color: r.isMe ? '#FFFFFF' : PODIUM[i].fg }]}>{initial(r.name)}</Text>
                      </View>
                      <Text style={[styles.podiumName, { color: colors.textPrimary }]} numberOfLines={1}>{r.isMe ? 'Ты' : r.name}</Text>
                      <View style={[styles.podiumBase, { height: heights[i], backgroundColor: r.isMe ? colors.primary + '22' : PODIUM[i].bg }]}>
                        <Text style={[styles.podiumPlace, { color: r.isMe ? colors.primary : PODIUM[i].fg }]}>{i + 1}</Text>
                        <Text style={[styles.podiumPoints, { color: r.isMe ? colors.primary : PODIUM[i].fg }]}>
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
                <Ionicons name="diamond" size={18} color={colors.primary} />
                <Text style={[styles.noteText, { color: colors.textPrimary }]}>
                  Топ-3 в конце недели: +{data.rewards.join(' / +')} алмазов (от 20 очков)
                </Text>
              </View>
            )}

            {/* Список */}
            <View style={[styles.list, { backgroundColor: cardBg }]}>
              {!hasPoints && (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
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
              style={[styles.rulesHeader, { backgroundColor: cardBg }]}
            >
              <Text style={[styles.rulesTitle, { color: colors.textPrimary }]}>Как считаются очки</Text>
              {showRules ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
            </Pressable>
            {showRules && (
              <View style={[styles.rules, { backgroundColor: cardBg }]}>
                {[
                  ['+1', 'новое слово — первый правильный ответ'],
                  ['+2', 'повторение вовремя — когда слову пришло время'],
                  ['+3', 'слово выучено (уровень «знаю»)'],
                  ['+5', 'слово выучено надолго'],
                ].map(([pts, text]) => (
                  <View key={pts} style={styles.ruleRow}>
                    <Text style={[styles.rulePts, { color: colors.primary }]}>{pts}</Text>
                    <Text style={[styles.ruleText, { color: colors.textPrimary }]}>{text}</Text>
                  </View>
                ))}
                <Text style={[styles.ruleFoot, { color: colors.textSecondary }]}>
                  Очки дают «Тест» и «Собери слово» по наборам курса. Повтор раньше срока очков не даёт —
                  возвращайся к словам, когда им пришло время. В день — не больше 300 очков.
                </Text>
              </View>
            )}

            {/* Настройки */}
            {data.isTeacher ? (
              <View style={[styles.settingRow, { backgroundColor: cardBg }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>Рейтинг для учеников</Text>
                  <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Ученики видят места и соревнуются за награды</Text>
                </View>
                <Switch value={data.enabled} onValueChange={toggleEnabled} disabled={savingToggle} accessibilityLabel="Рейтинг для учеников" />
              </View>
            ) : data.me && data.week === 'current' ? (
              <View style={[styles.settingRow, { backgroundColor: cardBg }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingTitle, { color: colors.textPrimary }]}>Скрыть меня из рейтинга</Text>
                  <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Ты видишь таблицу, другие ученики тебя — нет</Text>
                </View>
                <Switch value={data.me.hidden} onValueChange={toggleHidden} disabled={savingToggle} accessibilityLabel="Скрыть меня из рейтинга" />
              </View>
            ) : null}
          </ScrollView>

          {/* Моё место — закреплено внизу */}
          {data.me && !data.isTeacher && (
            <View style={[styles.me, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + spacing.s }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.meTitle, { color: colors.textPrimary }]}>
                  {data.me.hidden
                    ? 'Ты скрыт из рейтинга'
                    : data.me.points === 0
                      ? 'Набери первые очки, чтобы занять место'
                      : data.me.place === 1
                        ? 'Ты на 1-м месте — удержи до конца недели'
                        : `Ты на ${data.me.place}-м месте${data.me.gapToNext != null ? ` · до ${data.me.place! - 1}-го — ${data.me.gapToNext} ${pointsWord(data.me.gapToNext)}` : ''}`}
                </Text>
                {data.me.learnedTotal != null && (
                  <Text style={[styles.meHint, { color: colors.textSecondary }]}>Всего выучено в курсе: {data.me.learnedTotal}</Text>
                )}
              </View>
              <Text style={[styles.mePoints, { color: colors.primary }]}>{data.me.points}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 13, marginTop: 1 },
  segmented: { flexDirection: 'row', margin: spacing.m, marginBottom: 0, padding: 4, borderRadius: 12 },
  segment: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.s },
  centerText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  retryBtn: { marginTop: spacing.s, minHeight: 44, paddingHorizontal: 20, borderRadius: 999, justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  caption: { fontSize: 13, textAlign: 'center', marginTop: spacing.m },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10, marginTop: spacing.l, paddingHorizontal: spacing.m },
  podiumCol: { flex: 1, maxWidth: 116, alignItems: 'center' },
  podiumAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  podiumAvatarFirst: { width: 58, height: 58, borderRadius: 29 },
  podiumAvatarText: { fontSize: 18, fontWeight: '800' },
  podiumName: { fontSize: 13, fontWeight: '600', marginTop: 6, marginBottom: 6 },
  podiumBase: { width: '100%', borderTopLeftRadius: 14, borderTopRightRadius: 14, alignItems: 'center', justifyContent: 'center' },
  podiumPlace: { fontSize: 24, fontWeight: '800' },
  podiumPoints: { fontSize: 12, fontWeight: '600' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.m, marginTop: spacing.m, padding: 12, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 13 },
  list: { marginHorizontal: spacing.m, marginTop: spacing.m, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 4 },
  emptyText: { fontSize: 14, textAlign: 'center', padding: spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPlace: { width: 24, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700' },
  rowName: { fontSize: 15 },
  rowHint: { fontSize: 12, marginTop: 1 },
  rowPoints: { fontSize: 16, fontWeight: '700' },
  rulesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: spacing.m, marginTop: spacing.m, minHeight: 48, paddingHorizontal: 16, borderRadius: 14 },
  rulesTitle: { fontSize: 15, fontWeight: '600' },
  rules: { marginHorizontal: spacing.m, marginTop: 2, paddingHorizontal: 16, paddingBottom: 14, borderRadius: 14, gap: 8 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rulePts: { width: 28, fontSize: 15, fontWeight: '800' },
  ruleText: { flex: 1, fontSize: 14 },
  ruleFoot: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.m, marginTop: spacing.m, padding: 14, borderRadius: 14 },
  settingTitle: { fontSize: 15, fontWeight: '600' },
  settingHint: { fontSize: 12, marginTop: 2 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.m, paddingTop: spacing.m, borderTopWidth: 1 },
  meTitle: { fontSize: 14, fontWeight: '600' },
  meHint: { fontSize: 12, marginTop: 2 },
  mePoints: { fontSize: 22, fontWeight: '800' },
});
