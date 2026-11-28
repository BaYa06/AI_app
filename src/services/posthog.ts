/**
 * PostHog в вебе (posthog-js): веб-приложение и веб-кабинет учителя. Телефон — posthog.native.ts.
 *
 * initPostHog вызывают точки входа (index.web.jsx, index.teach.jsx). Переходы по страницам
 * (history API) PostHog ловит сам. Записи сессий: поля ввода скрыты всегда, в кабинете учителя
 * скрыт и весь текст — там имена и ответы учеников.
 */
import posthog from 'posthog-js';
import { APP_ENV_LABEL, POSTHOG_ENABLED, POSTHOG_HOST, POSTHOG_KEY } from '@/config/posthog';
import { log } from '@/utils/logger';

type Props = Record<string, string | number | boolean>;

let ready = false;

export function initPostHog(opts: { maskAllText?: boolean } = {}) {
  if (ready || !POSTHOG_ENABLED || typeof window === 'undefined') return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: '2025-05-24',
      person_profiles: 'identified_only',
      capture_exceptions: true,
      // Кабинет: в автоматических кликах тоже без текста кнопок и ссылок (там бывают имена учеников)
      ...(opts.maskAllText ? { mask_all_text: true, mask_all_element_attributes: true } : {}),
      session_recording: {
        maskAllInputs: true,
        ...(opts.maskAllText ? { maskTextSelector: '*' } : {}),
      },
    });
    posthog.register({ app_env: APP_ENV_LABEL });
    ready = true;
  } catch (e) {
    log.debug('PostHog', 'init error', e);
  }
}

export function phCapture(event: string, props?: Props) {
  if (ready) posthog.capture(event, props);
}

export function phIdentify(userId: string | null) {
  if (!ready) return;
  if (userId) {
    if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
  } else {
    posthog.reset();
    posthog.register({ app_env: APP_ENV_LABEL });
  }
}

export function phSetPersonProps(props: Record<string, string | number | boolean>) {
  if (ready) posthog.setPersonProperties(props);
}

export function phScreen(name: string) {
  if (ready) posthog.capture('$screen', { $screen_name: name });
}
