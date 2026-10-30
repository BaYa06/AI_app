/**
 * «Поделиться набором» (plan/new/share_set.md, Share 3): ссылка → системное меню.
 * Кнопка — в редакторе набора, блок «Доступ по ссылке».
 */
import { useCallback, useState } from 'react';
import { toast } from '@/components/ui';
import { Analytics, ShareApiError, ShareService, buildShareMessage } from '@/services';
import type { CardSet } from '@/types';
import { describeError } from '@/utils/userErrors';

/** Поделиться можно только своим набором — не набором учителя у ученика и не юнитом учебника. */
export function canShareSet(set: CardSet | undefined): set is CardSet {
  return !!set && !set.isReadOnly && !set.isOfficial;
}

export function useShareSet(onShared?: () => void) {
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(async (set: CardSet) => {
    if (isSharing) return;
    if (set.cardCount === 0) {
      toast.info('Добавь карточки, чтобы поделиться набором');
      return;
    }
    setIsSharing(true);
    try {
      const link = await ShareService.createLink(set.id);
      Analytics.shareLinkCreated(set.cardCount);
      onShared?.();
      const result = await ShareService.openShareSheet(buildShareMessage(set.title, set.cardCount, link.url));
      if (result.kind === 'copied') {
        toast.success('Ссылка скопирована');
        Analytics.shareLinkSent('clipboard');
      } else if (result.kind === 'shared') {
        Analytics.shareLinkSent(result.app);
      }
    } catch (e) {
      if (e instanceof ShareApiError) {
        // 404 — набор ещё не дошёл до сервера (создан только что, синхронизация в очереди)
        if (e.status === 404) toast.error('Набор ещё сохраняется — попробуй через пару секунд');
        else if (e.code === 'empty_set') toast.info('Добавь карточки, чтобы поделиться набором');
        else if (e.code === 'too_many_cards') toast.error('По ссылке можно отправить набор до 2000 карточек');
        else if (e.status === 401) toast.error('Войди в аккаунт, чтобы поделиться набором');
        else toast.error('Не удалось создать ссылку');
      } else {
        toast.error(describeError(e, 'Не удалось поделиться'));
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, onShared]);

  return { share, isSharing };
}
