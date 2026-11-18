/**
 * Форматы вопросов экзамена (plan/new/live_exam.md, LiveExam 12, 15–17): выбор, письмо,
 * «собери слово», «соедини пары» (2 раскладки), «вставь слово». Правильных ответов здесь нет —
 * сервер их ученику не отдаёт. Каждый формат получает текущий ответ и сообщает новый.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, alpha, iconSize, typography } from '@/constants';
import type { ExamQuestion, MatchQuestion } from '@/services/exam';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];
const POS_LABEL: Record<string, string> = {
  verb: 'глагол',
  noun: 'существительное',
  adj: 'прилагательное',
};

/** Размер текста вопроса по длине: короткое слово крупно, определение — обычным текстом */
export function promptVariant(text: string) {
  const n = text.length;
  if (n <= 18) return 'h1' as const;
  if (n <= 40) return 'h2' as const;
  if (n <= 90) return 'h3' as const;
  return 'bodyLarge' as const;
}

function PromptCard({ title, text, pos }: { title: string; text: string; pos?: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.promptCard, { backgroundColor: colors.primaryFill }]}>
      <View style={styles.promptTop}>
        <Text variant="overline" style={{ color: colors.onPrimary }}>
          {title}
        </Text>
        {pos && POS_LABEL[pos] ? (
          <View style={[styles.posTag, { backgroundColor: alpha(colors.onPrimary, 20) }]}>
            <Text variant="caption" style={{ color: colors.onPrimary }}>
              {POS_LABEL[pos]}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant={promptVariant(text)} style={{ color: colors.onPrimary }}>
        {text}
      </Text>
    </View>
  );
}

// ─── Выбор ──────────────────────────────────────────────────

function OptionList({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" style={styles.list}>
      {options.map((option, idx) => {
        const selected = value === option;
        return (
          <Pressable
            key={`${idx}:${option}`}
            accessibilityRole="radio"
            accessibilityLabel={`${OPTION_LABELS[idx]}. ${option}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? '' : option)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected ? alpha(colors.primary, 10) : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.optionLabel,
                { backgroundColor: selected ? colors.primaryFill : colors.surfaceMuted },
              ]}
            >
              <Text
                variant="label"
                style={{ color: selected ? colors.onPrimary : colors.textSecondary }}
              >
                {OPTION_LABELS[idx]}
              </Text>
            </View>
            <Text
              style={[
                styles.flex,
                {
                  color: selected ? colors.primary : colors.textPrimary,
                  fontWeight: selected ? '600' : '400',
                },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceQuestion({
  q,
  number,
  value,
  onChange,
}: {
  q: ExamQuestion;
  number: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const title =
    q.direction === 'back'
      ? 'Выберите слово'
      : q.direction === 'reverse'
        ? 'Выберите слово'
        : 'Выберите перевод';
  return (
    <View style={styles.block}>
      <PromptCard title={`${number}. ${title}`} text={q.prompt} pos={q.pos} />
      <OptionList options={q.options || []} value={value} onChange={onChange} />
    </View>
  );
}

// ─── Письмо ─────────────────────────────────────────────────

export function WriteQuestion({
  q,
  number,
  value,
  onChange,
  onDone,
}: {
  q: ExamQuestion;
  number: number;
  value: string;
  onChange: (v: string) => void;
  onDone?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.block}>
      <PromptCard title={`${number}. Напишите слово`} text={q.prompt} pos={q.pos} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onDone}
        placeholder="Ваш ответ"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        maxLength={q.maxLength || 60}
        returnKeyType="next"
        accessibilityLabel="Ваш ответ"
        style={[
          styles.input,
          { borderColor: value ? colors.primary : colors.border, color: colors.textPrimary },
        ]}
      />
      <Text variant="caption" style={{ color: colors.textSecondary }}>
        Подсказок нет — это экзамен. Ответ можно поменять до сдачи.
      </Text>
    </View>
  );
}

// ─── Собери слово ───────────────────────────────────────────

/**
 * Ответ — строка из выбранных плиток; пробел между словами ставим по wordLengths.
 * Индексы выбранных плиток храним в ответе неявно: восстанавливаем по буквам слева направо.
 */
function tilesFromValue(letters: string[], value: string): number[] {
  const used: number[] = [];
  const taken = new Set<number>();
  for (const ch of value.replace(/\s/g, '')) {
    const i = letters.findIndex(
      (l, idx) => !taken.has(idx) && l.toLowerCase() === ch.toLowerCase()
    );
    if (i < 0) break;
    taken.add(i);
    used.push(i);
  }
  return used;
}

function withSpaces(chars: string[], lengths: number[]) {
  const out: string[] = [];
  let i = 0;
  for (const len of lengths) {
    if (i >= chars.length) break;
    out.push(chars.slice(i, i + len).join(''));
    i += len;
  }
  return out.join(' ');
}

export function ScrambleQuestion({
  q,
  number,
  value,
  onChange,
}: {
  q: ExamQuestion;
  number: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useThemeColors();
  const letters = q.letters || [];
  const lengths = q.wordLengths?.length ? q.wordLengths : [letters.length];
  const used = useMemo(() => tilesFromValue(letters, value), [letters, value]);
  const usedSet = new Set(used);
  const chars = used.map((i) => letters[i]);
  const set = (next: number[]) =>
    onChange(
      withSpaces(
        next.map((i) => letters[i]),
        lengths
      )
    );

  // Слоты по словам
  let k = 0;
  const words = lengths.map((len) => {
    const slots = Array.from({ length: len }, () => chars[k++] ?? '');
    return slots;
  });

  return (
    <View style={styles.block}>
      <PromptCard title={`${number}. Соберите слово`} text={q.prompt} pos={q.pos} />
      <View style={styles.slotsWrap} accessibilityLabel={`Собрано: ${chars.join('') || 'пусто'}`}>
        {words.map((slots, w) => (
          <View key={w} style={styles.slotWord}>
            {slots.map((ch, i) => (
              <View
                key={i}
                style={[
                  styles.slot,
                  {
                    borderColor: ch ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Text variant="h3" style={{ color: colors.textPrimary }}>
                  {ch.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.tiles}>
        {letters.map((l, i) => {
          const isUsed = usedSet.has(i);
          return (
            <Pressable
              key={i}
              disabled={isUsed}
              onPress={() => set([...used, i])}
              accessibilityRole="button"
              accessibilityLabel={`Буква ${l}`}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: isUsed ? colors.surfaceMuted : alpha(colors.primary, 10),
                  borderColor: isUsed ? colors.border : colors.primary,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text variant="h3" style={{ color: isUsed ? colors.textTertiary : colors.primary }}>
                {l.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={() => set(used.slice(0, -1))}
          disabled={used.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Убрать последнюю букву"
          style={[styles.smallBtn, { borderColor: colors.border, opacity: used.length ? 1 : 0.5 }]}
        >
          <Delete size={iconSize.s} color={colors.textPrimary} />
          <Text variant="label" style={{ color: colors.textPrimary }}>
            Убрать букву
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange('')}
          disabled={used.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Начать заново"
          style={[styles.smallBtn, { borderColor: colors.border, opacity: used.length ? 1 : 0.5 }]}
        >
          <Text variant="label" style={{ color: colors.textPrimary }}>
            Заново
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Вставь слово ───────────────────────────────────────────

export function GapQuestion({
  q,
  number,
  value,
  onChange,
}: {
  q: ExamQuestion;
  number: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useThemeColors();
  const parts = q.prompt.split('_____');
  return (
    <View style={styles.block}>
      <View style={[styles.sentenceCard, { backgroundColor: colors.surfaceMuted }]}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          {number}. Вставьте слово
        </Text>
        <Text variant="bodyLarge" style={{ color: colors.textPrimary }}>
          {parts.map((p, i) => (
            <Text key={i} variant="bodyLarge">
              {p}
              {i < parts.length - 1 ? (
                <Text
                  variant="bodyLarge"
                  style={{ color: value ? colors.primary : colors.textTertiary, fontWeight: '700' }}
                >
                  {value ? ` ${value} ` : ' ______ '}
                </Text>
              ) : null}
            </Text>
          ))}
        </Text>
      </View>
      <OptionList options={q.options || []} value={value} onChange={onChange} />
    </View>
  );
}

// ─── Пары ───────────────────────────────────────────────────

/**
 * Один экран — одна механика: нажать слово слева (или сверху), потом пару справа (или ниже).
 * Нажатие на уже соединённое слово снимает пару. Ответ каждого слова — текст выбранной пары.
 */
export function MatchBlock({
  q,
  numbers,
  values,
  onChange,
}: {
  q: MatchQuestion;
  numbers: number[];
  values: Record<string, string>;
  onChange: (itemId: string, v: string) => void;
}) {
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string | null>(null);
  const usedBy = new Map<string, string>();
  for (const l of q.left) if (values[l.itemId]) usedBy.set(values[l.itemId], l.itemId);
  const stacked = q.layout === 'stacked';
  const pairNo = new Map(q.left.map((l, i) => [l.itemId, i + 1]));

  const pickLeft = (itemId: string) => {
    if (values[itemId]) {
      onChange(itemId, '');
      setSelected(itemId);
      return;
    }
    setSelected(selected === itemId ? null : itemId);
  };
  const pickRight = (text: string) => {
    const owner = usedBy.get(text);
    if (owner) {
      onChange(owner, '');
      if (!selected) setSelected(owner);
      return;
    }
    if (!selected) return;
    onChange(selected, text);
    const next = q.left.find((l) => l.itemId !== selected && !values[l.itemId]);
    setSelected(next ? next.itemId : null);
  };

  const leftItem = (l: { itemId: string; text: string }) => {
    const isSel = selected === l.itemId;
    const done = Boolean(values[l.itemId]);
    return (
      <Pressable
        key={l.itemId}
        onPress={() => pickLeft(l.itemId)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSel }}
        accessibilityLabel={`${l.text}${done ? `, соединено с «${values[l.itemId]}»` : ''}`}
        style={({ pressed }) => [
          stacked ? styles.wordChip : styles.matchCell,
          {
            backgroundColor: isSel
              ? alpha(colors.warning, 40)
              : done
                ? alpha(colors.primary, 10)
                : colors.surface,
            borderColor: isSel ? colors.warning : done ? colors.primary : colors.border,
          },
          pressed && styles.pressed,
        ]}
      >
        {done ? (
          <View style={[styles.pairBadge, { backgroundColor: colors.primaryFill }]}>
            <Text variant="caption" style={{ color: colors.onPrimary }}>
              {pairNo.get(l.itemId)}
            </Text>
          </View>
        ) : null}
        <Text variant="label" style={[styles.flexShrink, { color: colors.textPrimary }]}>
          {l.text}
        </Text>
      </Pressable>
    );
  };

  const rightItem = (text: string, i: number) => {
    const owner = usedBy.get(text);
    return (
      <Pressable
        key={`${i}:${text}`}
        onPress={() => pickRight(text)}
        accessibilityRole="button"
        accessibilityLabel={`${text}${owner ? ', уже соединено' : ''}`}
        style={({ pressed }) => [
          styles.matchCell,
          stacked && styles.fullWidth,
          {
            backgroundColor: owner ? alpha(colors.primary, 10) : colors.surface,
            borderColor: owner ? colors.primary : colors.border,
          },
          pressed && styles.pressed,
        ]}
      >
        {owner ? (
          <View style={[styles.pairBadge, { backgroundColor: colors.primaryFill }]}>
            <Text variant="caption" style={{ color: colors.onPrimary }}>
              {pairNo.get(owner)}
            </Text>
          </View>
        ) : null}
        <Text variant="bodySmall" style={[styles.flexShrink, { color: colors.textPrimary }]}>
          {text}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.block}>
      <View style={[styles.sentenceCard, { backgroundColor: colors.surfaceMuted }]}>
        <Text variant="overline" style={{ color: colors.textSecondary }}>
          {numbers[0]}–{numbers[numbers.length - 1]}. Соедините пары
        </Text>
        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
          Нажмите слово, потом его пару. Нажмите ещё раз, чтобы разъединить.
        </Text>
      </View>
      {stacked ? (
        <>
          <View style={styles.chips}>{q.left.map(leftItem)}</View>
          <View style={styles.list}>{q.right.map(rightItem)}</View>
        </>
      ) : (
        <View style={styles.columns}>
          <View style={styles.column}>{q.left.map(leftItem)}</View>
          <View style={styles.column}>{q.right.map(rightItem)}</View>
        </View>
      )}
    </View>
  );
}

const TILE = heights.touch;

const styles = StyleSheet.create({
  block: { gap: spacing.m },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  pressed: { opacity: 0.85 },
  promptCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    minHeight: 132,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  promptTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  posTag: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: borderRadius.full },
  list: { gap: spacing.s },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    minHeight: heights.listRow,
  },
  optionLabel: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: heights.input + spacing.xs,
    borderWidth: 2,
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    fontSize: typography.h3.fontSize,
  },
  slotsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, justifyContent: 'center' },
  slotWord: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs, justifyContent: 'center' },
  slot: {
    width: TILE - 8,
    height: TILE,
    borderBottomWidth: 2,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: spacing.s, justifyContent: 'center' },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: heights.touch,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  sentenceCard: { borderRadius: borderRadius.l, padding: spacing.m, gap: spacing.xs },
  columns: { flexDirection: 'row', gap: spacing.s },
  column: { flex: 1, gap: spacing.s },
  matchCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: heights.listRow,
    padding: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: 2,
  },
  fullWidth: { alignSelf: 'stretch' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  wordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: heights.touch,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  pairBadge: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
