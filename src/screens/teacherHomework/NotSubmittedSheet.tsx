/**
 * Окно «Кто не сдал» (plan/new/teacher_cabinet.md, Teacher 23; макет 12а).
 * RN — Android и веб; iOS — Swift (NotSubmittedSheet.swift через nativeNotSubmittedSheet.ts).
 * Фильтр «Все / В процессе / Не начали», галочки, «Выбрать всех», «Напомнить N ученикам».
 * Кому уже напоминали за 20 часов — галочка недоступна. Нажатие на имя — карточка ученика.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check, Clock, Send } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Sheet } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import type { HomeworkStatusData } from '@/services/homework';
import {
  NOT_SUBMITTED_TEXTS as T,
  defaultPicked,
  filterRows,
  notSubmittedDue,
  notSubmittedRows,
  notSubmittedSubtitle,
  notSubmittedTitle,
  sendLabel,
  tabs as tabsOf,
  type NotSubmittedTab,
} from './notSubmitted';
import { isNativeNotSubmittedSheet, useNativeNotSubmittedSheet } from './nativeNotSubmittedSheet';
import { remindSelected } from './remindHomework';

export interface NotSubmittedSheetProps {
  visible: boolean;
  homeworkId: string;
  courseTitle: string;
  initialTab?: NotSubmittedTab;
  onClose: () => void;
  onOpenStudent: (id: string, name: string) => void;
}

/** Статусы задания для окна: грузит при открытии */
export function useHomeworkStatusData(homeworkId: string, visible: boolean) {
  const [data, setData] = useState<HomeworkStatusData | null>(null);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    const res = await NeonService.loadHomeworkStatus(homeworkId);
    setData(res);
    setFailed(!res);
    return res;
  };
  useEffect(() => {
    if (!visible) return;
    setData(null);
    setFailed(false);
    load();
  }, [visible, homeworkId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, failed, reload: load };
}

export function NotSubmittedSheet(props: NotSubmittedSheetProps) {
  useNativeNotSubmittedSheet(props);
  if (isNativeNotSubmittedSheet) return null;
  return <NotSubmittedSheetRN {...props} />;
}

function NotSubmittedSheetRN({
  visible,
  homeworkId,
  courseTitle,
  initialTab = 'all',
  onClose,
  onOpenStudent,
}: NotSubmittedSheetProps) {
  const colors = useThemeColors();
  const { data, failed, reload } = useHomeworkStatusData(homeworkId, visible);
  const [tab, setTab] = useState<NotSubmittedTab>(initialTab);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  const rows = useMemo(() => (data ? notSubmittedRows(data) : []), [data]);
  const shown = useMemo(() => filterRows(rows, tab), [rows, tab]);
  const pickable = shown.filter((r) => !r.reminded);
  const allOn = pickable.length > 0 && pickable.every((r) => picked.has(r.id));
  const pickedCount = rows.filter((r) => picked.has(r.id)).length;

  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);
  useEffect(() => {
    setPicked(defaultPicked(rows));
    setSent(null);
  }, [rows]);

  const toggle = (id: string) => {
    setSent(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSent(null);
    setPicked((prev) => {
      const next = new Set(prev);
      pickable.forEach((r) => (allOn ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  };

  const send = async () => {
    const ids = rows.filter((r) => picked.has(r.id)).map((r) => r.id);
    if (ids.length === 0 || sending) return;
    setSending(true);
    const n = await remindSelected(homeworkId, ids);
    setSending(false);
    if (n === null) return;
    const fresh = await reload();
    // Обновили список — галочки у напомненных сняты; показываем итог
    if (fresh) setSent(n);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={data ? notSubmittedTitle(rows, data.students.length) : 'Кто не сдал'}
      footer={
        data && rows.length > 0 ? (
          <View style={st.footer}>
            <Button
              title={sendLabel(pickedCount, sent)}
              icon={sent !== null ? Check : Send}
              onPress={send}
              disabled={sent === null && pickedCount === 0}
              loading={sending}
              fullWidth
            />
            <Text variant="caption" color="secondary" style={st.center}>
              {sent !== null ? T.sentHint : T.hint}
            </Text>
          </View>
        ) : undefined
      }
    >
      {!data ? (
        <View style={st.loading}>
          {failed ? (
            <Button title="Повторить" variant="secondary" onPress={reload} />
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      ) : (
        <View style={st.body}>
          <Text variant="caption" color="secondary">
            {notSubmittedSubtitle(data, courseTitle)}
          </Text>
          <View style={st.dueRow}>
            <Clock size={16} color={colors.homeworkText} />
            <Text variant="caption" style={{ color: colors.homeworkText, fontWeight: '600' }}>
              {notSubmittedDue(data)}
            </Text>
          </View>

          {rows.length === 0 ? (
            <Text color="secondary">{T.empty}</Text>
          ) : (
            <>
              <View
                style={[st.segment, { backgroundColor: colors.surfaceMuted }]}
                accessibilityRole="tablist"
              >
                {tabsOf(rows).map((t) => {
                  const on = t.key === tab;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setTab(t.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={[st.segmentItem, on && { backgroundColor: colors.surface }]}
                    >
                      <Text variant="caption" style={st.bold} numberOfLines={1}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {pickable.length > 0 && (
                <Pressable onPress={toggleAll} style={st.toggleAll} accessibilityRole="button">
                  <Text variant="caption" style={[st.bold, { color: colors.primary }]}>
                    {allOn ? T.clearAll : T.selectAll}
                  </Text>
                </Pressable>
              )}

              <View style={[st.list, { borderColor: colors.border }]}>
                {shown.map((r, i) => {
                  const on = picked.has(r.id);
                  const progress = r.kind === 'in_progress';
                  return (
                    <View
                      key={r.id}
                      style={[
                        st.row,
                        i < shown.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.borderLight,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => toggle(r.id)}
                        disabled={r.reminded}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, disabled: r.reminded }}
                        accessibilityLabel={`${on ? 'Не напоминать' : 'Напомнить'}: ${r.name}`}
                        style={st.boxHit}
                      >
                        <View
                          style={[
                            st.box,
                            {
                              borderColor: on ? colors.primaryFill : colors.border,
                              backgroundColor: on ? colors.primaryFill : colors.surface,
                              opacity: r.reminded ? 0.4 : 1,
                            },
                          ]}
                        >
                          {on && <Check size={13} color={colors.onPrimary} strokeWidth={3.5} />}
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => onOpenStudent(r.id, r.name)}
                        accessibilityRole="button"
                        style={st.person}
                      >
                        <View style={[st.avatar, { backgroundColor: colors.surfaceMuted }]}>
                          <Text variant="caption" color="secondary" style={st.bold}>
                            {r.initials}
                          </Text>
                        </View>
                        <View style={st.flex}>
                          <Text numberOfLines={1}>{r.name}</Text>
                          <Text
                            variant="caption"
                            style={{ color: r.seenAlert ? colors.errorText : colors.textSecondary }}
                          >
                            {r.reminded ? `${r.seen} · ${T.remindedToday}` : r.seen}
                          </Text>
                        </View>
                        <View
                          style={[
                            st.badge,
                            {
                              backgroundColor: progress
                                ? alpha(colors.warning, 10)
                                : colors.surfaceMuted,
                            },
                          ]}
                        >
                          <Text
                            variant="caption"
                            style={[
                              st.bold,
                              { color: progress ? colors.warningText : colors.textSecondary },
                            ]}
                          >
                            {r.status}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  body: { gap: spacing.s },
  footer: { gap: spacing.xs },
  center: { textAlign: 'center' },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  segment: { flexDirection: 'row', borderRadius: borderRadius.m, padding: 2, gap: 2 },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
  },
  toggleAll: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: borderRadius.l, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.s },
  boxHit: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.s,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.s, minHeight: 52 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.s,
  },
  bold: { fontWeight: '600' },
});
