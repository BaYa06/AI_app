/**
 * BlockedAuthorsScreen — «Профиль → Заблокированные авторы» (plan/new/share_set.md, Share 6)
 * @description Авторы, чьи наборы по ссылке у пользователя не открываются (App Review 1.2:
 * блокировку можно снять). Разблокировка — сразу, без подтверждения: действие обратимо.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { UserX } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, EmptyState, ErrorState, ListGroup, ListRow, Screen, ScreenHeader, SkeletonList, toast } from '@/components/ui';
import { spacing } from '@/constants';
import { ShareService, type BlockedAuthor } from '@/services';
import { describeError } from '@/utils/userErrors';

export function BlockedAuthorsScreen({ navigation }: any) {
  const [blocks, setBlocks] = useState<BlockedAuthor[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadFailed(false);
    ShareService.listBlocks()
      .then(setBlocks)
      .catch(() => setLoadFailed(true));
  }, []);
  useEffect(load, [load]);

  const handleUnblock = useCallback(async (author: BlockedAuthor) => {
    setUnblocking(author.userId);
    try {
      await ShareService.unblock(author.userId);
      setBlocks((prev) => prev?.filter((b) => b.userId !== author.userId) ?? null);
      toast.success('Автор разблокирован');
    } catch (e) {
      toast.error(describeError(e, 'Не удалось разблокировать'));
    } finally {
      setUnblocking(null);
    }
  }, []);

  return (
    <Screen header={<ScreenHeader title="Заблокированные авторы" onBack={() => navigation.goBack()} bordered />} contentStyle={st.content}>
      {loadFailed ? (
        <ErrorState onRetry={load} />
      ) : !blocks ? (
        <SkeletonList rows={3} />
      ) : blocks.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="Никого нет"
          description="Если заблокировать автора набора по ссылке, его ссылки перестанут у тебя открываться. Снять блокировку можно здесь."
        />
      ) : (
        <>
          <Text variant="bodySmall" color="secondary">
            Наборы этих авторов по ссылке у тебя не открываются.
          </Text>
          <ListGroup style={st.group}>
            {blocks.map((author) => (
              <ListRow
                key={author.userId}
                title={author.name || 'Пользователь Flashly'}
                chevron={false}
                right={
                  <View style={st.action}>
                    <Button
                      variant="quiet"
                      size="s"
                      title="Разблокировать"
                      loading={unblocking === author.userId}
                      onPress={() => handleUnblock(author)}
                    />
                  </View>
                }
              />
            ))}
          </ListGroup>
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
  group: {
    marginTop: spacing.xs,
  },
  action: {
    marginRight: -spacing.s,
  },
});
