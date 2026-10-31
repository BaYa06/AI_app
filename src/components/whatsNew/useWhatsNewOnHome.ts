/**
 * Когда показать «Что нового» на главной (plan/new/whats_new.md, шаг News 3)
 * @description Проверки по порядку:
 * 1. главная на экране и загрузилась (роль известна), на ней не открыто своё окно;
 * 2. приложение открыли обычным способом, а не по ссылке, пушу или виджету (modalGate);
 * 3. не открыто окно важнее — приглашение в курс или набор по ссылке;
 * 4. спустя секунду (человек успел увидеть свою главную) есть подходящие новости.
 * Хук решает, когда показать; само окно главная рисует через <WhatsNewSheet {...whatsNew} />.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { WHATS_NEW_FALLBACK } from '@/constants/whatsNew';
import { localDay } from '@/store/challengeStore';
import {
  canShowNews,
  loadWhatsNewState,
  markShown,
  pageItemIds,
  saveWhatsNewState,
  selectNews,
  shouldShowProfileHint,
  toPages,
} from '@/services/whatsNew';
import {
  clearLaunchInterrupted,
  isBlockedFor,
  isLaunchInterrupted,
  markLaunchInterrupted,
  setGateOpen,
  subscribeGate,
} from '@/services/modalGate';
import { toast } from '@/components/ui';
import type { WhatsNewPage } from '@/types/whatsNew';
import type { WhatsNewSheetProps } from './nativeWhatsNewSheet';
import { APP_VERSION, newsContext, openNewsAction } from './newsContext';

/** Пауза после загрузки главной, чтобы окно не выскакивало вместе с ней */
const SHOW_DELAY_MS = 1000;

interface Options {
  navigation: any;
  /** null — роль ещё не известна, главная грузится */
  isTeacher: boolean | null;
  /** На главной открыто своё окно (поиск, меню, шторка) */
  blocked: boolean;
  /** route.params.from: 'widget' | 'push' — главную открыли виджетом или пушем */
  openedFrom?: string;
}

export function useWhatsNewOnHome({ navigation, isTeacher, blocked, openedFrom }: Options): WhatsNewSheetProps {
  const isFocused = useIsFocused();
  const [pages, setPages] = useState<WhatsNewPage[]>([]);
  const [visible, setVisible] = useState(false);
  const [gateTick, setGateTick] = useState(0);

  useEffect(() => subscribeGate(() => setGateTick((t) => t + 1)), []);

  useEffect(() => {
    if (openedFrom) markLaunchInterrupted();
  }, [openedFrom]);

  // Ушёл с главной — следующий заход на неё обычный, даже если этот начался со ссылки или пуша
  useFocusEffect(useCallback(() => () => clearLaunchInterrupted(), []));

  useEffect(() => {
    if (visible || !isFocused || isTeacher === null || blocked) return;
    if (isLaunchInterrupted() || isBlockedFor('whatsNew')) return;
    const timer = setTimeout(() => {
      if (isLaunchInterrupted() || isBlockedFor('whatsNew')) return;
      const state = loadWhatsNewState();
      if (!state || !canShowNews(state)) return;
      const items = selectNews(WHATS_NEW_FALLBACK, { ...newsContext(isTeacher), seen: state.seen });
      if (items.length === 0) return;
      const next = toPages(items);
      saveWhatsNewState(markShown(state, pageItemIds(next), localDay()));
      setPages(next);
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible, isFocused, isTeacher, blocked, gateTick]);

  useEffect(() => {
    setGateOpen('whatsNew', visible);
  }, [visible]);

  // Пришло приглашение в курс или набор по ссылке — они важнее, «Что нового» закрываем
  useEffect(() => {
    if (visible && isBlockedFor('whatsNew')) setVisible(false);
  }, [visible, gateTick]);

  useEffect(() => () => setGateOpen('whatsNew', false), []);

  const onClose = useCallback<WhatsNewSheetProps['onClose']>(
    ({ index, tryItem }) => {
      setVisible(false);
      if (tryItem) {
        openNewsAction(navigation, tryItem);
        return;
      }
      // Закрыл, не дочитав, — один раз подсказываем, где найти новости потом
      const state = loadWhatsNewState();
      if (state && shouldShowProfileHint(state, { index, pageCount: pages.length, tried: false })) {
        saveWhatsNewState({ ...state, profileHintShown: true });
        toast.info('Что нового — всегда в Профиле');
      }
    },
    [navigation, pages.length],
  );

  return { visible, version: APP_VERSION, pages, onClose };
}
