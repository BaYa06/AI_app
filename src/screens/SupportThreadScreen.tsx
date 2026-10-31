/**
 * SupportThreadScreen — переписка по одному обращению (plan/new/support_threads.md, Support 4)
 * @description Сообщения пользователя справа, ответы команды слева. Строка «Прочитано командой» стоит там,
 * где команда открыла обращение. Открытие экрана гасит бейдж «Есть ответ» (сервер ставит user_seen_at).
 * Сюда же ведут push «Команда Flashly ответила» и ссылка flashly://support/<id>.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowUp } from 'lucide-react-native';
import { Text } from '@/components/common';
import { ErrorState, Screen, ScreenHeader, SkeletonList, TextField, toast } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, heights, iconSize } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { NetworkLoadError } from '@/services/NeonService';
import {
  feedbackTagLabel, loadSupportThread, satisfactionLabel, sendSupportReply,
  type SupportMessage, type SupportThread,
} from '@/services/feedback';
import { formatSupportDate, ticketTitle } from './SupportListScreen';

const MAX_LENGTH = 4000;

type Item =
  | { type: 'message'; key: string; message: SupportMessage }
  | { type: 'read'; key: string; at: string };

/** Сообщения по времени + отметка «Прочитано командой» на своём месте */
function buildItems(thread: SupportThread): Item[] {
  const items: Item[] = thread.messages.map((m, i) => ({ type: 'message', key: `m${i}`, message: m }));
  if (thread.readAt) {
    const readTime = new Date(thread.readAt).getTime();
    const index = thread.messages.findIndex((m) => new Date(m.createdAt).getTime() > readTime);
    items.splice(index === -1 ? items.length : index, 0, { type: 'read', key: 'read', at: thread.readAt });
  }
  return items;
}

export function SupportThreadScreen({ navigation, route }: any) {
  const colors = useThemeColors();
  const id: string = route?.params?.id;
  const scrollRef = useRef<ScrollView>(null);

  const [thread, setThread] = useState<SupportThread | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setThread(await loadSupportThread(id));
    } catch (e) {
      if (e instanceof NetworkLoadError && (e.status === 404 || e.status === 400)) setNotFound(true);
      else setLoadFailed(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !thread) return;
    setSending(true);
    try {
      const message = await sendSupportReply(thread.id, text);
      triggerHaptic('notificationSuccess');
      setThread((prev) => (prev ? { ...prev, closed: false, messages: [...prev.messages, message] } : prev));
      setDraft('');
      scrollToEnd();
    } catch (e) {
      // Текст не теряем — можно отправить ещё раз
      toast.error(
        e instanceof NetworkLoadError && e.status === 429
          ? 'Сегодня ты уже написал много сообщений. Продолжим завтра'
          : 'Не удалось отправить. Проверь интернет и попробуй ещё раз',
      );
    } finally {
      setSending(false);
    }
  };

  // Открыли из push при холодном старте — под экраном ничего нет: «Назад» ведёт в «Мои обращения»
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Support'));
  const title = thread ? ticketTitle(thread) : 'Обращение';
  const header = <ScreenHeader title={title} onBack={goBack} bordered />;

  if (notFound) {
    return (
      <Screen header={header} scroll={false} contentStyle={st.center}>
        <ErrorState title="Обращение не найдено" description="Возможно, оно было удалено." onRetry={goBack} retryLabel="Назад" />
      </Screen>
    );
  }

  const canSend = draft.trim().length > 0 && !sending;
  const hasAnswer = !!thread?.messages.some((m) => m.author === 'admin');

  const footer = thread ? (
    <View style={st.composer}>
      <TextField
        value={draft}
        onChangeText={setDraft}
        placeholder={thread.kind === 'rating' && thread.messages.length === 0 ? 'Хочешь что-то добавить?' : 'Написать'}
        accessibilityLabel="Сообщение"
        multiline
        maxLength={MAX_LENGTH}
        style={st.flex}
        inputStyle={st.input}
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Отправить"
        accessibilityState={{ disabled: !canSend, busy: sending }}
        style={[st.send, { backgroundColor: canSend ? colors.primaryFill : colors.surfaceMuted }]}
      >
        <ArrowUp size={iconSize.s} color={canSend ? colors.onPrimary : colors.textTertiary} />
      </Pressable>
    </View>
  ) : undefined;

  return (
    <Screen
      header={header}
      footer={footer}
      keyboard
      scrollRef={scrollRef}
      scrollProps={{ onContentSizeChange: () => scrollRef.current?.scrollToEnd({ animated: false }) }}
      contentStyle={st.content}
    >
      {loadFailed ? (
        <ErrorState onRetry={load} />
      ) : !thread ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <Text variant="caption" color="secondary" align="center">
            {formatSupportDate(thread.createdAt, true)}
          </Text>

          {thread.kind === 'rating' && (
            <View style={[st.ratingCard, { borderColor: colors.border }]}>
              <Text variant="caption" color="secondary">Ответ в окне «Как тебе Flashly?»</Text>
              <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
                {`«${satisfactionLabel(thread.rating)}»`}
                {thread.hasProblem === true ? ' · Были проблемы' : thread.hasProblem === false ? ' · Проблем не было' : ''}
                {thread.tags?.length ? `: ${thread.tags.map(feedbackTagLabel).join(', ')}` : ''}
              </Text>
            </View>
          )}

          {buildItems(thread).map((item) =>
            item.type === 'read' ? (
              <Text key={item.key} variant="caption" color="secondary" align="center" style={st.sys}>
                {`Прочитано командой · ${formatSupportDate(item.at, true)}`}
              </Text>
            ) : (
              <Bubble key={item.key} message={item.message} />
            ),
          )}

          {!hasAnswer && (
            <Text variant="caption" color="secondary" align="center" style={st.sys}>
              {thread.readAt
                ? 'Ответ придёт сюда — пришлём уведомление'
                : 'Отправлено. Мы прочитаем и ответим здесь'}
            </Text>
          )}
          {thread.closed && (
            <Text variant="caption" color="secondary" align="center" style={st.sys}>
              Обращение закрыто. Если напишешь, мы увидим
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

function Bubble({ message }: { message: SupportMessage }) {
  const colors = useThemeColors();
  const mine = message.author === 'user';
  return (
    <View
      style={[
        st.bubble,
        mine
          ? [st.mine, { backgroundColor: colors.primaryFill }]
          : [st.theirs, { backgroundColor: colors.surfaceMuted }],
      ]}
    >
      {!mine && (
        <Text variant="caption" style={[st.author, { color: colors.primary }]}>Команда Flashly</Text>
      )}
      <Text variant="body" selectable style={{ color: mine ? colors.onPrimary : colors.textPrimary }}>
        {message.message}
      </Text>
      <Text variant="caption" align="right" style={[st.time, { color: mine ? colors.onPrimary : colors.textSecondary }]}>
        {formatSupportDate(message.createdAt, true)}
      </Text>
    </View>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.m,
    paddingBottom: spacing.m,
    gap: spacing.xs,
  },
  center: {
    justifyContent: 'center',
  },
  ratingCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.m,
    padding: spacing.s,
    gap: spacing.xxs,
  },
  sys: {
    paddingVertical: spacing.xxs,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
  },
  mine: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: borderRadius.s / 2,
  },
  theirs: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: borderRadius.s / 2,
  },
  author: {
    fontWeight: '600',
    marginBottom: 2,
  },
  time: {
    opacity: 0.7,
    marginTop: 2,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  input: {
    maxHeight: 120,
  },
  send: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
