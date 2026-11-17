/**
 * Главная на курсе книги учебного центра (plan/new/center_books.md, этап 7, Center 18).
 * Курс книги выглядит как любой курс: урок дня, разминка, юниты обычными наборами. Здесь только то,
 * что относится к доступу центра:
 *  - CenterCourseLocked — доступ закончился: вместо урока дня «Книги центра закрыты» и «Ввести новый
 *    код»; прогресс сохранён (Center 7);
 *  - CenterCourseNotes — за 7 дней до конца плашка «возьми новый код» (скрывается до завтра) и строка
 *    «Другие книги <центр> · Посмотреть» (крестик скрывает навсегда для этого центра).
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Clock, Library, Lock, X } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button, Card } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { CENTER_WARN_DAYS } from '@/services/centerBooks';
import type { MyCenter } from '@/services/CenterService';
import { daysLeft, formatAccessDate } from '@/utils/centerCode';
import { StorageService } from '@/services/StorageService';
import { localDay } from '@/store/challengeStore';
import { Analytics } from '@/services/analytics';

/** День, до конца которого скрыта плашка «осталось N дней» (тот же ключ, что был у Center 7) */
const WARN_HIDDEN_KEY = 'center_warn_hidden_day';
/** Строка «Другие книги» закрыта крестиком — для этого центра больше не показываем */
const libraryHintKey = (orgId: string) => `center_library_hint_closed_${orgId}`;

export const CenterCourseLocked = memo(function CenterCourseLocked({
  center,
  bookTitle,
  onEnterCode,
  style,
}: {
  center: MyCenter;
  bookTitle: string;
  onEnterCode: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    Analytics.orgAccessExpiredSeen();
  }, []);
  return (
    <Card tone="muted" style={style}>
      <View style={styles.head}>
        <Lock size={iconSize.s} color={colors.textSecondary} />
        <Text
          variant="overline"
          numberOfLines={1}
          style={[styles.flex, { color: colors.textSecondary }]}
        >
          Урок дня
        </Text>
      </View>
      <Text variant="h3" style={{ color: colors.textPrimary }}>
        Книги центра закрыты
      </Text>
      <Text variant="bodySmall" style={[styles.text, { color: colors.textSecondary }]}>
        Возьми актуальный код у менеджера курса. Прогресс сохранён: {bookTitle}.
        {center.contact ? ` ${center.contact}` : ''}
      </Text>
      <Button title="Ввести новый код" onPress={onEnterCode} fullWidth style={styles.button} />
    </Card>
  );
});

export const CenterCourseNotes = memo(function CenterCourseNotes({
  center,
  onEnterCode,
  onOpenLibrary,
  style,
}: {
  center: MyCenter;
  onEnterCode: () => void;
  onOpenLibrary: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const [warnHidden, setWarnHidden] = useState(
    () => StorageService.getString(WARN_HIDDEN_KEY) === localDay()
  );
  const [hintClosed, setHintClosed] = useState(
    () => StorageService.getString(libraryHintKey(center.id)) === '1'
  );
  const left = daysLeft(center.accessUntil);
  const warn = left <= CENTER_WARN_DAYS && !warnHidden;
  // Есть что посмотреть: книги центра, которые ещё не мои курсы
  const others = center.books.some((b) => !b.courseId);
  const hint = others && !hintClosed;
  if (!warn && !hint) return null;

  return (
    <View style={[styles.notes, style]}>
      {warn ? (
        <View style={[styles.row, { backgroundColor: alpha(colors.warning, 10) }]}>
          <Clock size={iconSize.s} color={colors.warningText} />
          <View style={styles.flex}>
            <Text variant="bodySmall" style={[styles.bold, { color: colors.textPrimary }]}>
              Доступ к книгам до {formatAccessDate(center.accessUntil)} · осталось {left}{' '}
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
              style={styles.action}
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
      {hint ? (
        <View
          style={[
            styles.row,
            styles.hint,
            { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 10) },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.primaryFill }]}>
            <Library size={iconSize.s} color={colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <Text variant="body" style={[styles.bold, { color: colors.textPrimary }]}>
              Другие книги {center.name}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              Находятся в «Библиотеке»
            </Text>
            <Button
              title="Посмотреть"
              variant="secondary"
              size="s"
              onPress={() => {
                Analytics.orgLibraryHint('open');
                onOpenLibrary();
              }}
              style={styles.action}
            />
          </View>
          <Button
            variant="icon"
            icon={X}
            background="none"
            iconSize={iconSize.xs}
            iconColor={colors.textSecondary}
            accessibilityLabel="Скрыть"
            onPress={() => {
              Analytics.orgLibraryHint('close');
              StorageService.setString(libraryHintKey(center.id), '1');
              setHintClosed(true);
            }}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  flex: { flex: 1, gap: spacing.xxs },
  text: { marginTop: spacing.xxs },
  button: { marginTop: spacing.m },
  notes: { gap: spacing.s },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  hint: { borderWidth: 1, borderStyle: 'dashed' },
  icon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: { fontWeight: '600' },
  action: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
