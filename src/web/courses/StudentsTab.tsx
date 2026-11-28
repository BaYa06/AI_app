/**
 * Вкладка «Ученики» курса (plan/new/web_cabinet.md, Web 8): сводка, активность за неделю, трудные слова,
 * таблица с поиском, фильтрами, сортировкой и «Показать ещё».
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowUp, BellRing, ChevronRight, Flame, Users } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/Toast';
import { describeApiError } from '../api';
import { navigate } from '../router';
import { TeacherData, type ActivityDay, type WebCourse } from '../data/teacher';
import { useLoad } from '../useLoad';
import {
  FILTERS,
  PAGE_SIZE,
  courseSummary,
  filterMembers,
  lastActivityLabel,
  sortMembers,
  type FilterKey,
  type Member,
  type SortDir,
  type SortKey,
} from '../teacherLogic';
import { Centered, ErrorPage, LoadingPage } from '../ui/states';
import { Avatar, SectionLabel, StatTile, toneColor } from '../ui/kit';
import { InviteDialog } from './CourseDialogs';

const COLUMNS: { key: SortKey; label: string; width: number; align?: 'right' }[] = [
  { key: 'streak', label: 'Серия', width: 88, align: 'right' },
  { key: 'today', label: 'Сегодня', width: 96, align: 'right' },
  { key: 'waiting', label: 'Ждут повторения', width: 152, align: 'right' },
  { key: 'last', label: 'Был', width: 148 },
];

export function StudentsTab({
  course,
  members,
}: {
  course: WebCourse;
  members: { data: Member[] | null; error: unknown; reload: () => void };
}) {
  const colors = useThemeColors();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [inviting, setInviting] = useState(false);
  const [reminding, setReminding] = useState(false);

  const activity = useLoad(() => TeacherData.activity(course.id, 7), [course.id]);
  const hard = useLoad(() => TeacherData.hardCards(course.id), [course.id]);

  const list = members.data;
  const now = new Date();
  const summary = useMemo(() => (list ? courseSummary(list, now) : null), [list]);
  const rows = useMemo(
    () =>
      list ? sortMembers(filterMembers(list, filter, query, now), sort.key, sort.dir, now) : [],
    [list, filter, query, sort]
  );

  if (!list) {
    return members.error ? (
      <ErrorPage error={members.error} onRetry={members.reload} />
    ) : (
      <LoadingPage />
    );
  }

  if (list.length === 0) {
    return (
      <>
        <Centered>
          <EmptyState
            icon={Users}
            title="В курсе пока никого нет"
            description="Нажми «Пригласить» и отправь ученикам код или ссылку — они появятся здесь, как только подключатся."
          />
        </Centered>
        <InviteDialog visible={inviting} course={course} onClose={() => setInviting(false)} />
      </>
    );
  }

  const remindAll = async () => {
    setReminding(true);
    try {
      const r = await TeacherData.remind(course.id);
      if (r === 'rate_limited')
        toast.info('Уже напомнили: курсу можно напоминать не чаще раза в сутки');
      else toast.success(`Напоминание отправлено: ${r.sent} из ${r.students}`);
    } catch (e) {
      toast.error(describeApiError(e));
    }
    setReminding(false);
  };

  const toggleSort = (key: SortKey) => {
    setShown(PAGE_SIZE);
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );
  };

  return (
    <View style={{ gap: spacing.l }}>
      <View style={styles.tiles}>
        <StatTile value={summary!.total} label="Учеников" />
        <StatTile value={summary!.activeToday} label="Занимались сегодня" tone="success" />
        <StatTile value={summary!.waiting} label="Ждут повторения" />
        <StatTile
          value={summary!.away}
          label="Не заходят 3 дня и дольше"
          tone={summary!.away > 0 ? 'warning' : 'neutral'}
        />
      </View>

      <View style={styles.twoCols}>
        <View style={styles.col}>
          <SectionLabel>Занятия за неделю</SectionLabel>
          <Card>
            {activity.data ? (
              <WeekChart days={activity.data} />
            ) : (
              <Text variant="bodySmall" color="secondary">
                {activity.error ? 'Не удалось загрузить' : 'Загружаем…'}
              </Text>
            )}
          </Card>
        </View>
        <View style={styles.col}>
          <SectionLabel>Трудные слова</SectionLabel>
          <Card padding="none">
            {hard.data && hard.data.length > 0 ? (
              hard.data.slice(0, 5).map((c, i) => (
                <View
                  key={c.cardId}
                  style={[
                    styles.hardRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {c.front}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {c.back}
                    </Text>
                  </View>
                  <Text variant="bodySmall" style={{ color: colors.warningText }}>
                    ошибок {Math.round(c.errorRate * 100)}%
                  </Text>
                </View>
              ))
            ) : (
              <Text variant="bodySmall" color="secondary" style={{ padding: spacing.m }}>
                {hard.error
                  ? 'Не удалось загрузить'
                  : hard.loading
                    ? 'Загружаем…'
                    : 'За две недели трудных слов нет.'}
              </Text>
            )}
          </Card>
        </View>
      </View>

      <View style={{ gap: spacing.s }}>
        <View style={styles.toolbar}>
          <View style={{ width: 320 }}>
            <TextField
              variant="search"
              placeholder="Поиск по ученикам"
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                setShown(PAGE_SIZE);
              }}
              accessibilityLabel="Поиск по ученикам"
            />
          </View>
          <View style={{ flex: 1 }} />
          <Button
            variant="secondary"
            size="s"
            icon={BellRing}
            title="Напомнить повторить"
            onPress={remindAll}
            loading={reminding}
          />
          <Button
            variant="secondary"
            size="s"
            title="Пригласить"
            onPress={() => setInviting(true)}
          />
        </View>
        <View style={styles.chips}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={filter === f.key}
              onPress={() => {
                setFilter(f.key);
                setShown(PAGE_SIZE);
              }}
            />
          ))}
        </View>

        <Card padding="none">
          <View style={[styles.headRow, { borderBottomColor: colors.border }]}>
            <SortHeader
              label="Ученик"
              active={sort.key === 'name'}
              dir={sort.dir}
              onPress={() => toggleSort('name')}
              style={{ flex: 1 }}
            />
            {COLUMNS.map((c) => (
              <SortHeader
                key={c.key}
                label={c.label}
                active={sort.key === c.key}
                dir={sort.dir}
                onPress={() => toggleSort(c.key)}
                style={{ width: c.width }}
                right={c.align === 'right'}
              />
            ))}
            <View style={{ width: 16 }} />
          </View>
          {rows.length === 0 ? (
            <Text variant="body" color="secondary" style={{ padding: spacing.m }}>
              Никого не нашли. Измени поиск или фильтр.
            </Text>
          ) : (
            rows
              .slice(0, shown)
              .map((m, i) => <StudentRow key={m.id} course={course} member={m} first={i === 0} />)
          )}
        </Card>

        <View style={styles.footerRow}>
          <Text variant="bodySmall" color="secondary">
            Показано {Math.min(shown, rows.length)} из {rows.length}
          </Text>
          {rows.length > shown ? (
            <Button
              variant="quiet"
              size="s"
              title={`Показать ещё ${Math.min(PAGE_SIZE, rows.length - shown)}`}
              onPress={() => setShown((n) => n + PAGE_SIZE)}
            />
          ) : null}
        </View>
      </View>
      <InviteDialog visible={inviting} course={course} onClose={() => setInviting(false)} />
    </View>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onPress,
  style,
  right,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onPress: () => void;
  style?: object;
  right?: boolean;
}) {
  const colors = useThemeColors();
  const Arrow = dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Сортировать: ${label}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onPress={onPress}
      style={[styles.sortHead, right && { justifyContent: 'flex-end' }, style]}
    >
      <Text
        variant="caption"
        style={{ color: active ? colors.primary : colors.textSecondary, fontWeight: '600' }}
      >
        {label}
      </Text>
      {active ? <Arrow size={12} color={colors.primary} /> : null}
    </Pressable>
  );
}

function StudentRow({
  course,
  member,
  first,
}: {
  course: WebCourse;
  member: Member;
  first: boolean;
}) {
  const colors = useThemeColors();
  const last = lastActivityLabel(member.lastActiveDate);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${member.displayName}. Открыть карточку ученика`}
      onPress={() => navigate(`/courses/${course.id}/students/${member.id}`)}
      style={(state) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: colors.border },
        (state as { hovered?: boolean }).hovered && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <View style={styles.nameCell}>
        <Avatar name={member.displayName} size={36} />
        <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
          {member.displayName}
        </Text>
      </View>
      <View style={[styles.cell, { width: 88, justifyContent: 'flex-end', gap: spacing.xxs }]}>
        {member.streak > 0 ? <Flame size={14} color={colors.streak} /> : null}
        <Text variant="body">{member.streak}</Text>
      </View>
      <View style={[styles.cell, { width: 96, justifyContent: 'flex-end' }]}>
        <Text variant="body" color={member.todayCards > 0 ? 'primary' : 'tertiary'}>
          {member.todayCards}
        </Text>
      </View>
      <View style={[styles.cell, { width: 152, justifyContent: 'flex-end' }]}>
        <Text variant="body" color={member.waitingReviews > 0 ? 'primary' : 'tertiary'}>
          {member.waitingReviews}
        </Text>
      </View>
      <View style={[styles.cell, { width: 148 }]}>
        <Text variant="bodySmall" style={{ color: toneColor(last.tone, colors) }}>
          {last.text}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

function WeekChart({ days }: { days: ActivityDay[] }) {
  const colors = useThemeColors();
  const max = Math.max(1, ...days.map((d) => d.count));
  const HEIGHT = 96;
  const weekday = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short' });
  return (
    <View style={styles.chart} accessibilityLabel="Сколько учеников занимались по дням за неделю">
      {days.map((d) => (
        <View key={d.date} style={styles.bar}>
          <Text variant="caption" color="secondary">
            {d.count}
          </Text>
          <View
            style={{
              width: '100%',
              maxWidth: 40,
              height: Math.max(4, Math.round((d.count / max) * HEIGHT)),
              borderRadius: borderRadius.s,
              backgroundColor: d.count > 0 ? colors.primary : alpha(colors.primary, 20),
            }}
          />
          <Text variant="caption" color="secondary">
            {weekday(d.date)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  twoCols: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  col: { flex: 1, gap: spacing.s },
  hardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    minHeight: 52,
  },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.m,
    minHeight: 40,
    gap: spacing.s,
  },
  sortHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, minHeight: 40 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
  },
  nameCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s, minWidth: 0 },
  cell: { flexDirection: 'row', alignItems: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  bar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xxs },
});
