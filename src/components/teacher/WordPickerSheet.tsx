/**
 * Окно «Слова для задания» (plan/new/teacher_cabinet.md, Teacher 19; макет 11а). RN — Android и веб;
 * iOS — Swift (Teacher 20). Правила — wordPicker.ts.
 *
 * Поиск, наборы курса с галочкой (все / часть / ни одного), раскрытие набора со словами,
 * итог «Выбрано N слов · ≈ сессий · ≈ мин», больше 30 слов — плашка «Много к сроку… Взять 25».
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Minus } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Sheet, TextField } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import { HOMEWORK_PART_WORDS } from '@/services/homework';
import type { HomeworkWords } from './newHomework';
import { useCoursePickerSets } from './useCoursePickerSets';
import {
  WORD_PICKER_TEXTS as T,
  filterWords,
  selectedCount,
  selectedTitle,
  selectedVolume,
  selectionFromWords,
  setCheck,
  setSubtitle,
  takeFirst,
  toHomeworkWords,
  toggleSet,
  toggleWord,
  tooManyText,
  type SetCheck,
  type WordSelection,
} from './wordPicker';

export interface WordPickerSheetProps {
  visible: boolean;
  courseId: string;
  words: HomeworkWords | null;
  due: Date;
  onClose: () => void;
  onDone: (words: HomeworkWords) => void;
}

function CheckBox({ state, size = 24 }: { state: SetCheck | 'on' | 'off'; size?: number }) {
  const colors = useThemeColors();
  const filled = state === 'all' || state === 'some' || state === 'on';
  return (
    <View
      style={[
        st.box,
        {
          width: size,
          height: size,
          borderColor: filled ? colors.primaryFill : colors.border,
          backgroundColor: filled ? colors.primaryFill : colors.surface,
        },
      ]}
    >
      {state === 'some' ? (
        <Minus size={size - 10} color={colors.onPrimary} strokeWidth={3.5} />
      ) : filled ? (
        <Check size={size - 10} color={colors.onPrimary} strokeWidth={3.5} />
      ) : null}
    </View>
  );
}

export function WordPickerSheetRN({
  visible,
  courseId,
  words,
  due,
  onClose,
  onDone,
}: WordPickerSheetProps) {
  const colors = useThemeColors();
  const sets = useCoursePickerSets(courseId, visible);
  const [sel, setSel] = useState<WordSelection>({});
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Открытие — выбор из текущего задания; раскрыт первый выбранный набор
  useEffect(() => {
    if (!visible || !sets) return;
    const initial = selectionFromWords(sets, words);
    setSel(initial);
    setQuery('');
    setOpen(sets.find((s) => (initial[s.id]?.size ?? 0) > 0)?.id ?? null);
  }, [visible, sets === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = selectedCount(sel);
  const many = tooManyText(total, due);
  const searching = query.trim().length > 0;
  const shown = useMemo(
    () =>
      (sets || [])
        .map((s) => ({ set: s, words: filterWords(s.words, query) }))
        .filter((x) => !searching || x.words.length > 0),
    [sets, query, searching]
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={T.title}
      footer={
        <View style={st.footer}>
          {many ? (
            <View style={[st.many, { backgroundColor: alpha(colors.homework, 10) }]}>
              <Text variant="caption" style={st.manyText}>
                <Text variant="caption" style={{ color: colors.homeworkText, fontWeight: '600' }}>
                  {T.manyTitle}
                </Text>{' '}
                {many}
              </Text>
              <Button
                title={T.takePart}
                variant="secondary"
                size="s"
                onPress={() => sets && setSel(takeFirst(sets, sel, HOMEWORK_PART_WORDS))}
              />
            </View>
          ) : null}
          <View style={st.totalRow}>
            <View style={st.flex}>
              <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                {selectedTitle(total)}
              </Text>
              <Text variant="caption" color="secondary">
                {selectedVolume(total)}
              </Text>
            </View>
            <Button
              title={T.done}
              disabled={total === 0 || !sets}
              onPress={() => sets && onDone(toHomeworkWords(sets, sel))}
            />
          </View>
        </View>
      }
    >
      <View style={st.body}>
        <TextField variant="search" placeholder={T.search} value={query} onChangeText={setQuery} />
        <Text variant="label" color="secondary">
          {T.setsLabel}
        </Text>
        {sets === null ? (
          <ActivityIndicator color={colors.primary} style={st.loading} />
        ) : sets.length === 0 ? (
          <Text color="secondary">{T.empty}</Text>
        ) : shown.length === 0 ? (
          <Text color="secondary">{T.nothingFound}</Text>
        ) : (
          shown.map(({ set, words: list }) => {
            const check = setCheck(set, sel);
            const expanded = searching || open === set.id;
            const Chevron = expanded ? ChevronUp : ChevronDown;
            return (
              <View
                key={set.id}
                style={[
                  st.setCard,
                  {
                    borderColor: check === 'none' ? colors.border : colors.primary,
                    borderWidth: check === 'none' ? StyleSheet.hairlineWidth : 2,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <View style={st.setRow}>
                  <Pressable
                    onPress={() => setSel(toggleSet(set, sel))}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: check === 'all' ? true : check === 'some' ? 'mixed' : false,
                    }}
                    accessibilityLabel={
                      check === 'all' ? `${T.clearAll} ${set.title}` : `${T.selectAll} ${set.title}`
                    }
                    hitSlop={8}
                    style={st.boxHit}
                  >
                    <CheckBox state={check} />
                  </Pressable>
                  <Pressable
                    onPress={() => setOpen(open === set.id ? null : set.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    style={st.setTitle}
                  >
                    <View style={st.flex}>
                      <Text variant="bodyLarge" style={{ fontWeight: '600' }}>
                        {set.title}
                      </Text>
                      <Text
                        variant="caption"
                        style={{ color: check === 'none' ? colors.textSecondary : colors.primary }}
                      >
                        {setSubtitle(set, sel)}
                      </Text>
                    </View>
                    <Chevron size={20} color={colors.textTertiary} />
                  </Pressable>
                </View>
                {expanded && (
                  <View style={[st.words, { borderTopColor: colors.border }]}>
                    {list.map((w) => {
                      const on = sel[set.id]?.has(w.id) ?? false;
                      return (
                        <Pressable
                          key={w.id}
                          onPress={() => setSel(toggleWord(set.id, w.id, sel))}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          style={[st.wordRow, { borderBottomColor: colors.borderLight }]}
                        >
                          <CheckBox state={on ? 'on' : 'off'} size={22} />
                          <Text style={st.flex} numberOfLines={2}>
                            <Text style={{ fontWeight: '600' }}>{w.front}</Text>
                            <Text color="secondary">{` — ${w.back}`}</Text>
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
        <Text variant="caption" color="secondary">
          {T.footnote}
        </Text>
      </View>
    </Sheet>
  );
}

/** На iOS выбор слов — второй лист Swift-окна «Новое задание» (NewHomeworkSheet.swift) */
export function WordPickerSheet(props: WordPickerSheetProps) {
  return <WordPickerSheetRN {...props} />;
}

const st = StyleSheet.create({
  body: { gap: spacing.s },
  footer: { gap: spacing.s },
  flex: { flex: 1 },
  loading: { marginVertical: spacing.l },
  many: {
    borderRadius: borderRadius.l,
    padding: spacing.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  manyText: { flex: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  setCard: { borderRadius: borderRadius.l, overflow: 'hidden' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xs },
  boxHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  setTitle: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.s,
  },
  words: { borderTopWidth: StyleSheet.hairlineWidth },
  wordRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  box: {
    borderRadius: borderRadius.s,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
