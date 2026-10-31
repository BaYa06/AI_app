/**
 * Общее для главной и экрана «Что нового» (plan/new/whats_new.md): кто смотрит новости
 * куда ведёт «Попробовать» и события аналитики.
 */
import { Platform } from 'react-native';
import { version as APP_VERSION } from '../../../package.json';
import { localDay } from '@/store/challengeStore';
import { Analytics } from '@/services/analytics';
import { pageItemIds, type WhatsNewContext } from '@/services/whatsNew';
import type { WhatsNewItem, WhatsNewPage, WhatsNewPlatform } from '@/types/whatsNew';

export { APP_VERSION };

export function newsContext(isTeacher: boolean): Omit<WhatsNewContext, 'seen'> {
  return {
    appVersion: APP_VERSION,
    role: isTeacher ? 'teacher' : 'student',
    platform: Platform.OS as WhatsNewPlatform,
    // На Android Platform.Version — уровень API, а не версия ОС; minOs пока только у iOS-новостей
    osVersion: Platform.OS === 'ios' ? String(Platform.Version) : null,
    today: localDay(),
  };
}

/** Куда ведёт «Попробовать»: только вкладки, чтобы новость с сервера не открыла неизвестный экран */
const TAB_ROUTES = ['Home', 'Library', 'TestTab', 'Statistics', 'Study', 'Profile'];

/** Открыть экран новости — и с вкладки, и с экрана в стеке */
export function openNewsAction(navigation: any, item: WhatsNewItem | undefined): void {
  const route = item?.action?.route;
  if (route && TAB_ROUTES.includes(route)) navigation?.navigate('Main', { screen: route });
}

// ==================== Аналитика (News 6) ====================

type Place = 'home' | 'history';

const pageId = (pages: WhatsNewPage[], index: number): string => {
  const page = pages[index];
  return page?.kind === 'item' ? page.item.id : 'more';
};

/** События окна для одного показа: shown сразу, остальные — из onPage / onClose */
export function trackWhatsNew(place: Place, pages: WhatsNewPage[]) {
  Analytics.whatsNewShown({ place, count: pages.length, news: pageItemIds(pages).length, version: APP_VERSION });
  return {
    page: (index: number) => Analytics.whatsNewPage({ place, id: pageId(pages, index), index }),
    close: (index: number, tryItem?: WhatsNewItem) => {
      if (tryItem) Analytics.whatsNewTry({ place, id: tryItem.id, index });
      Analytics.whatsNewClosed({ place, index, count: pages.length, tried: !!tryItem });
    },
  };
}
