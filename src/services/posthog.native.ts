/**
 * PostHog в нативном приложении (posthog-react-native). Веб — posthog.ts с тем же API.
 *
 * Сюда приходят все события из analyticsTransport (тот же каталог Analytics, что и в Firebase),
 * плюс экраны навигации, события жизненного цикла (установка, обновление, открытие, уход в фон)
 * и необработанные JS-ошибки. Нативные падения по-прежнему собирает Crashlytics.
 * Записи сессий на телефоне не включены — для них нужен отдельный нативный модуль.
 */
import PostHog from 'posthog-react-native';
import { APP_ENV_LABEL, POSTHOG_ENABLED, POSTHOG_HOST, POSTHOG_KEY } from '@/config/posthog';
import { log } from '@/utils/logger';

type Props = Record<string, string | number | boolean>;

let client: PostHog | null = null;

if (POSTHOG_ENABLED) {
  try {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: true,
      // Профиль создаётся только у вошедших (identify), анонимные события дешевле
      personProfiles: 'identified_only',
      errorTracking: { autocapture: { uncaughtExceptions: true, unhandledRejections: true } },
    });
    client.register({ app_env: APP_ENV_LABEL });
  } catch (e) {
    log.debug('PostHog', 'init error', e);
    client = null;
  }
}

/** Веб инициализируется из точки входа; на телефоне клиент создаётся при импорте модуля */
export function initPostHog(_opts?: { maskAllText?: boolean }) {}

export function phCapture(event: string, props?: Props) {
  client?.capture(event, props);
}

export function phIdentify(userId: string | null) {
  if (!client) return;
  if (userId) {
    if (client.getDistinctId() !== userId) client.identify(userId);
  } else {
    client.reset();
    client.register({ app_env: APP_ENV_LABEL });
  }
}

export function phSetPersonProps(props: Record<string, string | number | boolean>) {
  client?.capture('$set', { $set: props });
}

export function phScreen(name: string) {
  client?.screen(name);
}
