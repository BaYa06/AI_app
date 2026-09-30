/**
 * Отправка событий аналитики в веб-версии (Firebase JS SDK).
 *
 * В нативном приложении Metro берёт analyticsTransport.native.ts с тем же API.
 */
import { logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { analytics } from './firebase';

type Params = Record<string, string | number | boolean>;

export function sendEvent(event: string, params?: Params) {
  if (!analytics) {
    if (__DEV__) console.log(`[Analytics] ${event}`, params);
    return;
  }
  try {
    logEvent(analytics, event, params);
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] logEvent error:', e);
  }
}

export function sendUserProperties(props: Record<string, string>) {
  if (!analytics) return;
  try {
    setUserProperties(analytics, props);
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] setUserProperties error:', e);
  }
}

/**
 * user_id для аналитики — UUID пользователя (не email!). null — сброс при выходе.
 */
export function setAnalyticsUserId(userId: string | null) {
  if (!analytics) return;
  try {
    setUserId(analytics, userId);
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] setUserId error:', e);
  }
}
