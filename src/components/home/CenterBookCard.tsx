/**
 * Карточка книги учебного центра на главной (plan/new/center_books.md, Center 6): логотип центра,
 * книга, текущий юнит, сколько слов юнита начато, «Учить / Продолжить Unit N», «Мои книги».
 * За 7 дней до конца — плашка «возьми новый код» (скрывается до завтра); доступ кончился —
 * «Доступ к книгам закончился» и «Ввести новый код», прогресс сохранён (Center 7).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Clock, Library, Lock, X } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button, Card, ProgressBar } from '@/components/ui';
import { useCardsStore, useThemeColors } from '@/store';
import { useCenterStore } from '@/store/centerStore';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import {
  activeBookEntry,
  CENTER_WARN_DAYS,
  isCenterOpen,
  myBookEntries,
} from '@/services/centerBooks';
import { daysLeft, formatAccessDate } from '@/utils/centerCode';
import { StorageService } from '@/services/StorageService';
import { localDay } from '@/store/challengeStore';
import { Analytics } from '@/services/analytics';
import { CenterLogo } from '@/screens/courseJoin/CenterFoundScreen';
import type { StyleProp, ViewStyle } from 'react-native';

/** День, до конца которого скрыта плашка «осталось N дней» */
const WARN_HIDDEN_KEY = 'center_warn_hidden_day';

type Props = {
  onStudy: (setId: string) => void;
  onMyBooks: () => void;
  /** «Ввести новый код» — окно ввода кода */
  onEnterCode: () => void;
  style?: StyleProp<ViewStyle>;
};

export function CenterBookCard({ onStudy, onMyBooks, onEnterCode, style }: Props) {
  const colors = useThemeColors();
  const data = useCenterStore((s) => s.data);
  const entry = activeBookEntry(data);
  const unit = entry?.mine.currentUnit ?? null;
  const setId = unit?.setId ?? null;
  // Начатые слова юнита — по картам в сторе (официальный набор приходит с личным прогрессом)
  const started = useCardsStore((s) => {
    if (!setId) return 0;
    return (s.cardsBySet[setId] || []).filter((id) => (s.cards[id]?.learningStep || 0) >= 1).length;
  });

  const [warnHidden, setWarnHidden] = useState(
    () => StorageService.getString(WARN_HIDDEN_KEY) === localDay()
  );
  const open = !!entry && isCenterOpen(entry.center);
  const lockedSeen = React.useRef(false);

  if (!entry) return null;

  // Доступ закончился: книга закрыта, прогресс сохранён — новый код у менеджера курса
  if (!open) {
    if (!lockedSeen.current) {
      lockedSeen.current = true;
      Analytics.orgAccessExpiredSeen();
    }
    return (
      <Card tone="muted" style={style}>
        <View style={styles.head}>
          <Lock size={iconSize.s} color={colors.textSecondary} />
          <Text variant="overline" style={[styles.flex, { color: colors.textSecondary }]}>
            {entry.center.name}
          </Text>
        </View>
        <Text variant="h3" style={{ color: colors.textPrimary }}>
          Доступ к книгам закончился
        </Text>
        <Text variant="bodySmall" style={[styles.text, { color: colors.textSecondary }]}>
          Возьми актуальный код у менеджера курса. Прогресс сохранён: {entry.book.title}
          {unit ? `, Unit ${unit.number}` : ''}.
          {entry.center.contact ? ` ${entry.center.contact}` : ''}
        </Text>
        <Button title="Ввести новый код" onPress={onEnterCode} fullWidth style={styles.button} />
      </Card>
    );
  }

  if (!unit || !setId) return null;
  const left = daysLeft(entry.center.accessUntil);
  const warn = left <= CENTER_WARN_DAYS && !warnHidden;
  const total = unit.totalCards;
  const done = Math.min(started, total);
  const booksCount = myBookEntries(data).length;

  return (
    <Card style={style}>
      {warn ? (
        <View style={[styles.warn, { backgroundColor: alpha(colors.warning, 10) }]}>
          <Clock size={iconSize.s} color={colors.warningText} />
          <View style={styles.flex}>
            <Text variant="bodySmall" style={[styles.bold, { color: colors.textPrimary }]}>
              Доступ к книгам до {formatAccessDate(entry.center.accessUntil)} · осталось {left}{' '}
              {pluralize(left, 'день', 'дня', 'дней')}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              Возьми новый код у менеджера курса — дни прибавятся.
            </Text>
            <Button
              title="Ввести код"
              variant="quiet"
              size="s"
              onPress={onEnterCode}
              style={styles.warnButton}
            />
          </View>
          <Button
            variant="icon"
            icon={X}
            background="none"
            iconSize={iconSize.s}
            iconColor={colors.textSecondary}
            accessibilityLabel="Скрыть до завтра"
            onPress={() => {
              StorageService.setString(WARN_HIDDEN_KEY, localDay());
              setWarnHidden(true);
            }}
          />
        </View>
      ) : null}
      <View style={styles.head}>
        <CenterLogo org={entry.center} size={24} />
        <Text
          variant="overline"
          numberOfLines={1}
          style={[styles.flex, { color: colors.textSecondary }]}
        >
          {entry.book.title}
        </Text>
      </View>
      <Text variant="h3" style={{ color: colors.textPrimary }}>
        Unit {unit.number} · {unit.title}
      </Text>
      <ProgressBar
        progress={total > 0 ? (done / total) * 100 : 0}
        accessibilityLabel={`${done} из ${total} слов юнита`}
        style={styles.bar}
      />
      <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
        {done} из {total} {pluralize(total, 'слова', 'слов', 'слов')} юнита
      </Text>
      <Button
        title={`${done > 0 ? 'Продолжить' : 'Учить'} Unit ${unit.number}`}
        onPress={() => onStudy(setId)}
        fullWidth
        style={styles.button}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onMyBooks}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Library size={iconSize.s} color={colors.primary} />
        <Text variant="body" style={[styles.flex, { color: colors.primary }]}>
          Мои книги · {booksCount} {pluralize(booksCount, 'книга', 'книги', 'книг')}
        </Text>
        <ChevronRight size={iconSize.s} color={colors.textTertiary} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  warn: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    borderRadius: borderRadius.m,
    padding: spacing.s,
    marginBottom: spacing.s,
  },
  warnButton: { alignSelf: 'flex-start', marginLeft: -spacing.xs },
  text: { marginTop: spacing.xxs },
  bold: { fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  bar: { marginTop: spacing.s, marginBottom: spacing.xxs },
  button: { marginTop: spacing.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.xs,
  },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
});
