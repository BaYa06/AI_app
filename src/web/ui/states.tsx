/**
 * Общие состояния страниц веб-кабинета (plan/new/web_cabinet.md, Web 4):
 * загрузка, ошибка, «не найдено», баннер «нет связи». Тексты на «ты», без технических слов.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SearchX } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { Text } from '@/components/common/Text';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { navigate } from '../router';
import { describeApiError } from '../api';

export function LoadingPage() {
  return (
    <View style={styles.loading} accessibilityLabel="Загружаем">
      <Skeleton width={240} height={32} />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

export function ErrorPage({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  return (
    <ErrorState
      title="Не получилось загрузить"
      description={describeApiError(error)}
      onRetry={onRetry}
    />
  );
}

export function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title="Страница не найдена"
      description="Возможно, ссылка устарела."
      action={{ label: 'На главную', onPress: () => navigate('/') }}
    />
  );
}

/** Полоса сверху: нет связи / сессия закончилась. Не сбрасывает страницу. */
export function Banner({ text, tone = 'warning' }: { text: string; tone?: 'warning' | 'error' }) {
  const colors = useThemeColors();
  const color = tone === 'error' ? colors.errorText : colors.warningText;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { borderColor: color, backgroundColor: colors.surfaceMuted }]}
    >
      <Text variant="bodySmall" style={{ color }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: spacing.m, paddingVertical: spacing.l },
  banner: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
});
