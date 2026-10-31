/**
 * Общее для главной и экрана «Что нового» (plan/new/whats_new.md): кто смотрит новости
 * и куда ведёт «Попробовать».
 */
import { Platform } from 'react-native';
import { version as APP_VERSION } from '../../../package.json';
import { localDay } from '@/store/challengeStore';
import type { WhatsNewContext } from '@/services/whatsNew';
import type { WhatsNewItem, WhatsNewPlatform } from '@/types/whatsNew';

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
