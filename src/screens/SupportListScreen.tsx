/**
 * SupportListScreen — «Профиль → Мои обращения» (plan/new/support_threads.md, Support 4)
 * @description История «Написать нам» и окна оценки: статус у каждого обращения, новые ответы выделены.
 * Список обновляется при каждом возврате на экран — после открытия переписки статус уже другой.
 */
import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Bug, HelpCircle, Lightbulb, MessageSquare, Meh, ThumbsDown, ThumbsUp, Plus } from 'lucide-react-native';
import { Text } from '@/components/common';
import {
  Badge, Button, Card, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList,
  type BadgeTone, type IconComponent,
} from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, iconSize } from '@/constants';
import {
  FEEDBACK_CATEGORY_LABELS, loadSupportTickets, satisfactionLabel,
  type SupportStatus, type SupportTicket,
} from '@/services/feedback';

const STATUS: Record<SupportStatus, { label: string; tone: BadgeTone }> = {
  sent: { label: 'Отправлено', tone: 'neutral' },
  read: { label: 'Прочитано', tone: 'success' },
  answered: { label: 'Есть ответ', tone: 'primary' },
};

const CATEGORY_ICON: Record<string, IconComponent> = { problem: Bug, idea: Lightbulb, question: HelpCircle };

function ticketIcon(t: SupportTicket): IconComponent {
  if (t.kind === 'message') return CATEGORY_ICON[t.category || ''] || MessageSquare;
  if (!t.rating) return MessageSquare;
  return t.rating >= 4 ? ThumbsUp : t.rating === 3 ? Meh : ThumbsDown;
}

export function ticketTitle(t: { kind: string; category: string | null; rating: number | null }): string {
  if (t.kind === 'rating') return `Отзыв: «${satisfactionLabel(t.rating)}»`;
  return FEEDBACK_CATEGORY_LABELS[t.category as keyof typeof FEEDBACK_CATEGORY_LABELS] || 'Сообщение';
}

export function formatSupportDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? null : { year: 'numeric' }),
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : null),
  });
}

/** Превью оценки без текста: что ответили в окне */
function ratingPreview(t: SupportTicket): string {
  if (t.hasProblem === true) return 'Были проблемы';
  if (t.hasProblem === false) return 'Проблем не было';
  return 'Ответ в окне «Как тебе Flashly?»';
}

export function SupportListScreen({ navigation }: any) {
  const colors = useThemeColors();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setTickets(await loadSupportTickets());
    } catch {
      // Список уже на экране — оставляем его, ошибку показываем только при первой загрузке
      setTickets((prev) => {
        if (!prev) setLoadFailed(true);
        return prev;
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const writeButton = (
    <Button title="Написать нам" icon={Plus} onPress={() => navigation.navigate('Feedback')} fullWidth />
  );

  return (
    <Screen
      header={
        <ScreenHeader
          title="Мои обращения"
          // Пришли из переписки, открытой push-уведомлением, — возвращаемся в профиль
          onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Profile' }))}
          bordered
        />
      }
      contentStyle={st.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {loadFailed ? (
        <ErrorState onRetry={load} />
      ) : !tickets ? (
        <SkeletonList rows={4} />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Пока пусто"
          description="Здесь будут твои сообщения и наши ответы. Нашёл ошибку или есть идея — напиши, мы ответим здесь."
          action={{ label: 'Написать нам', onPress: () => navigation.navigate('Feedback') }}
        />
      ) : (
        <>
          {writeButton}
          <View style={st.list}>
            {tickets.map((t) => {
              const Icon = ticketIcon(t);
              const status = STATUS[t.status];
              const unread = t.status === 'answered';
              const preview = t.preview
                ? (t.previewAuthor === 'admin' ? 'Команда: ' : '') + t.preview
                : ratingPreview(t);
              return (
                <Card
                  key={t.id}
                  tone={unread ? 'selected' : 'default'}
                  padding="s"
                  onPress={() => navigation.navigate('SupportThread', { id: t.id })}
                  accessibilityLabel={`${ticketTitle(t)}, ${status.label}`}
                  style={st.ticket}
                >
                  <View style={st.ticketTop}>
                    <Icon size={iconSize.xs} color={colors.textSecondary} />
                    <Text variant="label" style={[st.flex, { color: colors.textPrimary }]} numberOfLines={1}>
                      {ticketTitle(t)}
                      <Text variant="caption" color="secondary">{'  ·  ' + formatSupportDate(t.lastMessageAt)}</Text>
                    </Text>
                    <Badge label={t.closed && !unread ? 'Закрыто' : status.label} tone={t.closed && !unread ? 'neutral' : status.tone} />
                  </View>
                  <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                    {preview}
                  </Text>
                </Card>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.l,
    gap: spacing.m,
  },
  list: {
    gap: spacing.xs,
  },
  ticket: {
    gap: spacing.xxs,
  },
  ticketTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});
