/**
 * Отправка событий аналитики в веб-версии через общий клиент PostHog.
 *
 * В нативном приложении Metro берёт analyticsTransport.native.ts с тем же API.
 */
import { posthog } from '@/config/posthog';
import { log } from '@/utils/logger';

type Params = Record<string, string | number | boolean>;

export function sendEvent(event: string, params?: Params) {
  try {
    posthog?.capture(event, params);
  } catch (e) {
    log.debug('Analytics', 'PostHog capture error', e);
  }
}

export function sendUserProperties(props: Record<string, string>) {
  try {
    posthog?.setPersonProperties(props);
  } catch (e) {
    log.debug('Analytics', 'PostHog person-property error', e);
  }
}

/**
 * Identity is established once at the shared Supabase session boundary in App.tsx.
 * This legacy abstraction remains a no-op so existing callers do not re-identify users.
 */
export function setAnalyticsUserId(_userId: string | null) {}
