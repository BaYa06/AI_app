/**
 * ScreenTemplate — шаблон нового экрана по брендбуку (plan/brandbook.md, шаг 8.2 плана).
 *
 * Создать экран: `npm run new:screen -- Имя` → src/screens/ИмяScreen.tsx.
 * Шаблон проверяют TypeScript и `npm run brand:check` — он всегда рабочий.
 *
 * Чек-лист экрана (подробно — README, «Как делать экран»):
 *  1. Каркас — Screen + ScreenHeader (назад 44×44, заголовок по центру 16/600).
 *  2. Кнопки, поля, списки, окна — только компоненты из '@/components/ui'.
 *  3. Цвета — только токены useThemeColors(): ни '#…', ни rgba, ни `isDark ?`.
 *  4. Текст — <Text variant="…">: размеры шкалы, ≥ 12, веса 400/600/700.
 *  5. Отступы и скругления — spacing / borderRadius.
 *  6. Иконки — lucide, без эмодзи (кроме флагов языков).
 *  7. Загрузка — Skeleton, ошибка — ErrorState, пусто — EmptyState (что сделать дальше).
 *  8. Успех — toast, подтверждение опасного — confirmDialog. Не системный Alert.
 *  9. Иконка-кнопка — с accessibilityLabel; тексты — на «ты»; числа — через pluralize.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { BookOpen, Layers, Plus } from 'lucide-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '@/components/common';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SkeletonList,
  toast,
} from '@/components/ui';
import { spacing } from '@/constants';
import { useThemeColors } from '@/store';
import { pluralize } from '@/utils';
import type { RootStackParamList } from '@/types/navigation';

// Замени на RootStackScreenProps<'ИмяЭкрана'>, когда добавишь экран в навигатор
type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

type Item = { id: string; title: string; count: number };

type LoadState = 'loading' | 'error' | 'ready';

export function ScreenTemplate({ navigation }: Props) {
  const colors = useThemeColors();
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      // Загрузка данных экрана
      setItems([]);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = useCallback(() => {
    // Действие экрана; успех без выбора — toast, не Alert
    toast.success('Сохранено');
  }, []);

  const header = <ScreenHeader title="Заголовок" onBack={() => navigation.goBack()} />;

  if (state === 'loading') {
    return (
      <Screen header={header}>
        <SkeletonList rows={4} />
      </Screen>
    );
  }

  if (state === 'error') {
    return (
      <Screen header={header} scroll={false}>
        <ErrorState onRetry={load} />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen header={header} scroll={false}>
        <EmptyState
          icon={Layers}
          title="Здесь пока пусто"
          description="Создай первый элемент — он появится в этом списке."
          action={{ label: 'Создать', icon: Plus, onPress: handleCreate }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      footer={<Button title="Создать" icon={Plus} fullWidth onPress={handleCreate} />}
    >
      <Card style={styles.section}>
        <Text variant="h3" style={{ color: colors.textPrimary }}>
          Раздел
        </Text>
        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
          Одно предложение о том, что здесь происходит.
        </Text>
      </Card>

      <ListGroup title="Список" style={styles.section}>
        {items.map((item) => (
          <ListRow
            key={item.id}
            icon={BookOpen}
            title={item.title}
            value={`${item.count} ${pluralize(item.count, 'карточка', 'карточки', 'карточек')}`}
            onPress={() => {}}
          />
        ))}
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.l,
    gap: spacing.xs,
  },
});
