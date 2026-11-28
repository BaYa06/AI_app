/**
 * PostHog — продуктовая аналитика (события, воронки, удержание, записи сессий в вебе).
 *
 * Ключ проекта (phc_…) публичный: PostHog рассчитан на то, что он лежит в коде клиента, им можно
 * только отправлять события, читать данные нельзя. Можно переопределить через POSTHOG_KEY в .env
 * (babel.config.cjs / webpack.config.cjs), иначе берётся ключ ниже.
 *
 * В разработке (__DEV__) ничего не отправляем, чтобы не засорять данные. Тестовые сборки
 * (APP_ENV=staging, Preview на Vercel) отправляют с app_env=staging — их фильтруем в отчётах.
 */
import { Platform } from 'react-native';
import { IS_STAGING } from './apiBase';

export const POSTHOG_KEY =
  process.env.POSTHOG_KEY || 'phc_AXY9W7RgtYSWPJkcRNjyd8ehGtMbQ8Fn5SKWuM4LUGss';

/** Регион US */
export const POSTHOG_HOST = 'https://us.i.posthog.com';

export const POSTHOG_ENABLED = !__DEV__ && POSTHOG_KEY.startsWith('phc_');

/** Рабочие домены веба; всё остальное (Preview ветки dev, другие превью Vercel) — staging */
const PRODUCTION_HOSTS = ['ai-app-seven-zeta.vercel.app'];

function webIsProduction(host: string): boolean {
  return (
    host === 'flashlycards.app' ||
    host.endsWith('.flashlycards.app') ||
    PRODUCTION_HOSTS.includes(host)
  );
}

/** Телефон — по APP_ENV сборки; веб — по домену (в веб-сборку APP_ENV не попадает) */
export const APP_ENV_LABEL: 'staging' | 'production' =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? webIsProduction(window.location.hostname)
      ? 'production'
      : 'staging'
    : IS_STAGING
      ? 'staging'
      : 'production';
