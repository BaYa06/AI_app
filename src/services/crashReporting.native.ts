/**
 * Отчёты о падениях в нативном приложении (Firebase Crashlytics). plan/new/release_safety.md, Release 4.
 *
 * Нативные падения и необработанные JS-ошибки Crashlytics ловит сам; здесь — то, что он сам
 * не видит: ошибки, пойманные ErrorBoundary, и кто/где упал (UUID пользователя, сервер).
 * Тот же API, что у веб-заглушки crashReporting.ts: Metro берёт этот файл на iOS/Android.
 *
 * Пока только iOS: на Android нет google-services.json (как и у аналитики/push).
 * В режиме разработки отчёты не собираются (firebase.json: crashlytics_debug_enabled=false).
 */
import { Platform } from 'react-native';
import {
  getCrashlytics,
  recordError,
  setAttribute,
  setUserId,
} from '@react-native-firebase/crashlytics';
import { IS_STAGING } from '@/config/apiBase';

const enabled = Platform.OS === 'ios';

/** Один раз при запуске: метка сервера, чтобы падения тестовых сборок не смешивались с рабочими. */
export function initCrashReporting() {
  if (!enabled) return;
  setAttribute(getCrashlytics(), 'app_env', IS_STAGING ? 'staging' : 'production').catch(() => {});
}

/** UUID пользователя (не email!). null — выход из аккаунта. */
export function setCrashUserId(userId: string | null) {
  if (!enabled) return;
  setUserId(getCrashlytics(), userId ?? '').catch(() => {});
}

/** Ошибка, которую поймали и показали пользователю (ErrorBoundary) — приложение не упало. */
export function reportError(error: Error, context?: string) {
  if (!enabled) return;
  recordError(getCrashlytics(), error, context);
}
