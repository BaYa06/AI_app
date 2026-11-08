/**
 * Отправка событий аналитики в нативном приложении (@react-native-firebase/analytics).
 *
 * Тот же API, что у веб-версии в analyticsTransport.ts: Metro подхватывает этот файл на
 * iOS/Android вместо веб-модуля, webpack — наоборот, берёт analyticsTransport.ts.
 *
 * Пока только iOS: на Android нет google-services.json, и вызов Firebase там упадёт,
 * поэтому на Android события только пишутся в консоль в режиме разработки.
 * Рекламный идентификатор (IDFA) не собирается — $RNFirebaseAnalyticsWithoutAdIdSupport в Podfile.
 */
import { Platform } from 'react-native';
import {
  getAnalytics,
  logEvent as fbLogEvent,
  setUserId as fbSetUserId,
  setUserProperties as fbSetUserProperties,
} from '@react-native-firebase/analytics';
import { log } from '@/utils/logger';

type Params = Record<string, string | number | boolean>;

const enabled = Platform.OS === 'ios';

export function sendEvent(event: string, params?: Params) {
  log.debug('Analytics', `${event}`, params);
  if (!enabled) return;
  fbLogEvent(getAnalytics(), event, params).catch((e: unknown) => {
    log.debug('Analytics', 'logEvent error', e);
  });
}

export function sendUserProperties(props: Record<string, string>) {
  if (!enabled) return;
  fbSetUserProperties(getAnalytics(), props).catch((e: unknown) => {
    log.debug('Analytics', 'setUserProperties error', e);
  });
}

/**
 * user_id для аналитики — UUID пользователя (не email!). null — сброс при выходе.
 */
export function setAnalyticsUserId(userId: string | null) {
  if (!enabled) return;
  fbSetUserId(getAnalytics(), userId).catch((e: unknown) => {
    log.debug('Analytics', 'setUserId error', e);
  });
}
