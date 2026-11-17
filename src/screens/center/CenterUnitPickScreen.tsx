/**
 * «На каком юните ты сейчас?» — юнит книги учебного центра (plan/new/center_books.md, Center 6).
 * first: «Учить Unit N» сразу запускает сессию «Изучить» по юниту — от кода до первой карточки
 * 4 нажатия. change / add / unit: «Готово» — обратно в «Мои книги».
 * Прошлые юниты не закрываются: юнит — только с чего начать.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button, Card, ErrorState, Screen, ScreenHeader, toast } from '@/components/ui';
import { useThemeColors } from '@/store';
import { useCenterStore } from '@/store/centerStore';
import { borderRadius, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import { BookService } from '@/services/BookService';
import { studyCenterUnit } from '@/components/study/centerSession';
import type { BookDetail, BookUnit } from '@/types/books';
import type { RootStackScreenProps } from '@/types/navigation';

const unitWords = (u: BookUnit) => u.sets.reduce((n, s) => n + s.totalCards, 0);

export function CenterUnitPickScreen({
  navigation,
  route,
}: RootStackScreenProps<'CenterUnitPick'>) {
  const { bookId, mode, replaceBookId } = route.params;
  const colors = useThemeColors();
  const myBook = useCenterStore((s) => s.data?.myBooks.find((m) => m.bookId === bookId));
  const pickBook = useCenterStore((s) => s.pickBook);
  const removeBook = useCenterStore((s) => s.removeBook);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setFailed(false);
    BookService.getBookDetail(bookId).then((d) => {
      if (!d) return setFailed(true);
      setDetail(d);
      setUnitId((prev) => prev ?? myBook?.currentUnitId ?? d.units[0]?.id ?? null);
    });
  };
  useEffect(load, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  const unit = detail?.units.find((u) => u.id === unitId) ?? null;
  const label = unit ? `Unit ${unit.number}` : '';

  const save = async () => {
    if (!unit || saving) return;
    setSaving(true);
    const ok = await pickBook(bookId, { unitId: unit.id, active: true });
    if (ok && replaceBookId && replaceBookId !== bookId) await removeBook(replaceBookId);
    if (!ok) {
      setSaving(false);
      toast.error('Не удалось сохранить книгу. Проверь интернет и попробуй ещё раз');
      return;
    }
    if (mode !== 'first') {
      setSaving(false);
      navigation.navigate('MyBooks');
      return;
    }
    // Сразу после кода центра: стек «главная → сессия по юниту»
    const setId = unit.sets[0]?.id;
    const started = setId ? await studyCenterUnit(navigation, setId, { fromHome: true }) : null;
    if (started !== 'session' && started !== 'set') {
      setSaving(false);
      if (started === 'unavailable') toast.error('Не удалось загрузить юнит. Проверь интернет');
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Home' } }] });
    }
  };

  const header = (
    <ScreenHeader title={detail?.book.title} onBack={() => navigation.goBack()} bordered />
  );

  if (failed) {
    return (
      <Screen header={header}>
        <ErrorState
          title="Не удалось загрузить книгу"
          description="Проверь интернет и попробуй ещё раз."
          onRetry={load}
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      footer={
        <Button
          title={mode === 'first' ? (unit ? `Учить ${label}` : 'Учить') : 'Готово'}
          disabled={!unit}
          loading={saving}
          onPress={save}
          fullWidth
        />
      }
    >
      <View style={styles.head}>
        <Text variant="h1" style={{ color: colors.textPrimary }}>
          На каком юните ты сейчас?
        </Text>
        <Text variant="body" style={{ color: colors.textSecondary }}>
          Начнём с этого юнита. Прошлые тоже останутся открыты.
        </Text>
      </View>

      {!detail ? (
        <ActivityIndicator color={colors.primary} style={styles.spinner} />
      ) : (
        <View style={styles.list}>
          {detail.units.map((u) => {
            const selected = u.id === unitId;
            const words = unitWords(u);
            return (
              <Card
                key={u.id}
                padding="s"
                tone={selected ? 'selected' : 'default'}
                onPress={() => setUnitId(u.id)}
                accessibilityLabel={`Unit ${u.number}, ${u.title}`}
              >
                <View style={styles.row}>
                  <View style={[styles.num, { backgroundColor: colors.surfaceVariant }]}>
                    <Text variant="label" style={{ color: colors.primary }}>
                      {u.number}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="body" style={{ color: colors.textPrimary }}>
                      {u.title}
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                      {words} {pluralize(words, 'слово', 'слова', 'слов')}
                    </Text>
                  </View>
                  {selected ? <Check size={iconSize.m} color={colors.primary} /> : null}
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs, marginBottom: spacing.m },
  spinner: { marginVertical: spacing.xl },
  list: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.m, alignItems: 'center' },
  num: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 2 },
});
