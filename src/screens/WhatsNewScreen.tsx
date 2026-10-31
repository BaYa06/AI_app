/**
 * WhatsNewScreen — «Профиль → Что нового» (plan/new/whats_new.md, News 4)
 * @description Все новости про этого человека по версиям, новые сверху — в том числе уже
 * просмотренные и те, что окно больше не показывает. Нажатие открывает то же окно с одной новостью.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Badge, EmptyState, ListGroup, ListRow, Screen, ScreenHeader } from '@/components/ui';
import { spacing } from '@/constants';
import { WHATS_NEW_FALLBACK } from '@/constants/whatsNew';
import { useSettingsStore } from '@/store';
import { knownArt, loadWhatsNewState, markSeen, newsHistory, saveWhatsNewState } from '@/services/whatsNew';
import { WhatsNewSheet } from '@/components/whatsNew/WhatsNewSheet';
import { APP_VERSION, newsContext, openNewsAction } from '@/components/whatsNew/newsContext';
import type { WhatsNewItem, WhatsNewPage } from '@/types/whatsNew';

export function WhatsNewScreen({ navigation }: any) {
  const isTeacher = useSettingsStore((s) => s.isTeacher) === true;
  const groups = useMemo(() => newsHistory(WHATS_NEW_FALLBACK, newsContext(isTeacher)), [isTeacher]);
  const [seen, setSeen] = useState<string[]>(() => loadWhatsNewState()?.seen ?? []);
  // Новость остаётся в окне, пока оно уезжает после закрытия
  const [open, setOpen] = useState<WhatsNewItem | null>(null);
  const [visible, setVisible] = useState(false);
  const pages = useMemo<WhatsNewPage[]>(
    () => (open ? [{ kind: 'item', item: open, art: knownArt(open.art) }] : []),
    [open],
  );

  const handleOpen = useCallback((item: WhatsNewItem) => {
    setOpen(item);
    setVisible(true);
    const state = loadWhatsNewState() ?? { seen: [] };
    const next = markSeen(state.seen, [item.id]);
    if (next !== state.seen) saveWhatsNewState({ ...state, seen: next });
    setSeen(next);
  }, []);

  const handleClose = useCallback(
    ({ tryItem }: { tryItem?: WhatsNewItem }) => {
      setVisible(false);
      openNewsAction(navigation, tryItem);
    },
    [navigation],
  );

  return (
    <Screen header={<ScreenHeader title="Что нового" onBack={() => navigation.goBack()} bordered />} contentStyle={st.content}>
      {groups.length === 0 ? (
        <EmptyState icon={Sparkles} title="Пока пусто" description="Здесь появятся новости о том, что изменилось в приложении." />
      ) : (
        groups.map((group) => (
          <ListGroup key={group.version} title={`Версия ${group.version}`} style={st.group}>
            {group.items.map((item) => (
              <ListRow
                key={item.id}
                title={item.title}
                subtitle={item.tag}
                right={seen.includes(item.id) ? undefined : <Badge label="Новое" />}
                chevron
                onPress={() => handleOpen(item)}
              />
            ))}
          </ListGroup>
        ))
      )}
      <WhatsNewSheet visible={visible} version={open?.minVersion ?? APP_VERSION} pages={pages} onClose={handleClose} />
    </Screen>
  );
}

const st = StyleSheet.create({
  content: {
    gap: spacing.l,
  },
  group: {
    marginTop: 0,
  },
});
