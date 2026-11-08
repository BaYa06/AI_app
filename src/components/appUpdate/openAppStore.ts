/**
 * Открыть приложение в App Store (plan/new/app_update_prompt.md, Update 4)
 */
import { Linking } from 'react-native';
import { version } from '../../../package.json';
import { markStoreOpened, type AppVersionInfo } from '@/services/appUpdate';
import { log } from '@/utils/logger';

export const APP_VERSION: string = version;

/** Если сервер ссылку не прислал — та же, что в api/_share-page.js */
export const FALLBACK_STORE_URL = 'https://apps.apple.com/app/id6808731151';

/** Запоминает «Обновить» (6 часов тишины мягкого окна) и открывает страницу в App Store */
export function openAppStore(config: AppVersionInfo | undefined): void {
  markStoreOpened();
  Linking.openURL(config?.storeUrl ?? FALLBACK_STORE_URL).catch((e) =>
    log.warn('AppUpdate', 'Не удалось открыть App Store', e)
  );
}
