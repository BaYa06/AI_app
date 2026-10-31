/**
 * Push Notifications Service (FCM Web Push)
 * @description Регистрация FCM, получение токена, foreground-сообщения, подписка/отписка.
 *
 * ВАЖНО: Инициализация только на клиенте (Platform.OS === 'web').
 * VAPID key должен быть в .env.local как FIREBASE_VAPID_KEY.
 */
import { Platform } from 'react-native';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { app as firebaseApp } from './firebase';
import { supabase } from './supabaseClient';
import { version as APP_VERSION } from '../../package.json';

// ==================== TYPES ====================

export interface PushStatus {
  /** Текущее разрешение: granted / denied / default */
  permission: NotificationPermission | 'unsupported';
  /** FCM token (null если не получен) */
  token: string | null;
  /** Поддерживается ли FCM в текущем браузере */
  isSupported: boolean;
  /** Ошибка, если была */
  error?: string;
  /** Тихие уведомления iOS (4.3) — только в нативном приложении */
  provisional?: boolean;
}

export type ForegroundMessageHandler = (payload: {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}) => void;

// ==================== STATE ====================

let messagingInstance: Messaging | null = null;
let currentToken: string | null = null;
let foregroundUnsubscribe: (() => void) | null = null;

const VAPID_KEY = process.env.FIREBASE_VAPID_KEY || '';
const TOKEN_STORAGE_KEY = 'flashly_fcm_token';

// Debug: проверка VAPID ключа при загрузке модуля
if (Platform.OS === 'web') {
  console.log('[Push] Module loaded. VAPID_KEY present:', !!VAPID_KEY);
  if (VAPID_KEY) {
    console.log('[Push] VAPID key (first 15 chars):', VAPID_KEY.substring(0, 15) + '...');
  } else {
    console.error('[Push] ❌ VAPID_KEY is empty! Check webpack.config.cjs and .env.local');
  }
}

// ==================== HELPERS ====================

/** localStorage-обёртка для хранения последнего отправленного токена */
/** Версия, с которой токен последний раз ушёл на сервер: обновилось приложение — отправляем заново */
const TOKEN_VERSION_STORAGE_KEY = 'fcm_token_app_version';

function tokenNeedsSync(token: string, storedToken: string | null): boolean {
  if (token !== storedToken) return true;
  try {
    return localStorage.getItem(TOKEN_VERSION_STORAGE_KEY) !== APP_VERSION;
  } catch {
    return false;
  }
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Safari private mode
  }
}

// ==================== CORE ====================

/**
 * Проверяет, поддерживается ли FCM Messaging в текущем окружении
 */
export async function isPushSupported(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (!('serviceWorker' in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * Инициализирует Firebase Messaging (ленивая инициализация).
 * FCM обработка встроена в основной sw.js.
 */
async function getMessagingInstance(): Promise<Messaging> {
  if (messagingInstance) return messagingInstance;
  messagingInstance = getMessaging(firebaseApp);
  return messagingInstance;
}

/**
 * Получает регистрацию основного Service Worker (sw.js).
 * Теперь FCM встроен прямо в sw.js — отдельный firebase-messaging-sw.js НЕ нужен.
 */
async function getMainSWRegistration(): Promise<ServiceWorkerRegistration> {
  // Удаляем старые отдельные FCM-регистрации, если остались
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    const sw = reg.installing || reg.waiting || reg.active;
    if (sw?.scriptURL.includes('firebase-messaging-sw.js')) {
      console.log('[Push] Removing legacy firebase-messaging-sw.js registration');
      await reg.unregister();
    }
  }

  // Ищем уже активную регистрацию sw.js
  const allRegs = await navigator.serviceWorker.getRegistrations();
  for (const reg of allRegs) {
    if (reg.active?.scriptURL.includes('sw.js') && !reg.active.scriptURL.includes('firebase-messaging-sw.js')) {
      console.log('[Push] Found active main SW:', reg.scope);
      return reg;
    }
  }

  // Если sw.js ещё не зарегистрирован (маловероятно), регистрируем
  console.log('[Push] Main SW not found, registering sw.js...');
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

  // Ждём активации
  await new Promise<void>((resolve, reject) => {
    const sw = registration.installing || registration.waiting;
    if (registration.active) { resolve(); return; }
    if (!sw) { reject(new Error('No service worker after registration')); return; }
    sw.addEventListener('statechange', function handler() {
      if (sw.state === 'activated') { sw.removeEventListener('statechange', handler); resolve(); }
      else if (sw.state === 'redundant') { sw.removeEventListener('statechange', handler); reject(new Error('SW became redundant')); }
    });
  });

  console.log('[Push] Main SW registered and active');
  return registration;
}

/**
 * Запрашивает разрешение на уведомления и получает FCM token.
 *
 * @param userId — необязательный userId Supabase для привязки токена к пользователю.
 * @returns PushStatus
 */
export async function requestPushPermission(userId?: string | null): Promise<PushStatus> {
  // 1. Проверка поддержки
  const supported = await isPushSupported();
  if (!supported) {
    return { permission: 'unsupported', token: null, isSupported: false, error: 'Push notifications not supported' };
  }

  try {
    // 2. Запрос разрешения
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { permission, token: null, isSupported: true, error: 'Permission denied' };
    }

    // 3. Регистрация — используем основной SW (sw.js содержит FCM)
    const swRegistration = await getMainSWRegistration();

    // 4. Получение токена
    const messaging = await getMessagingInstance();

    if (!VAPID_KEY) {
      console.error('[Push] FIREBASE_VAPID_KEY not set! Add it to .env.local');
      console.error('[Push] Current VAPID_KEY value:', VAPID_KEY, 'Type:', typeof VAPID_KEY);
      console.error('[Push] process.env.FIREBASE_VAPID_KEY:', process.env.FIREBASE_VAPID_KEY);
      return { permission, token: null, isSupported: true, error: 'VAPID key not configured' };
    }

    console.log('[Push] Using VAPID key:', VAPID_KEY.substring(0, 10) + '...');

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      return { permission, token: null, isSupported: true, error: 'Failed to get FCM token' };
    }

    currentToken = token;
    console.log('[Push] FCM token:', token);

    // 5. Сохраняем локально + отправляем на backend (не блокируя)
    const storedToken = getStoredToken();
    storeToken(token);
    if (tokenNeedsSync(token, storedToken)) {
      sendTokenToBackend(token, userId); // fire-and-forget
    }

    return { permission, token, isSupported: true };
  } catch (error: any) {
    console.error('[Push] Error requesting permission:', error);
    return {
      permission: Notification.permission || 'default',
      token: null,
      isSupported: true,
      error: error?.message || 'Unknown error',
    };
  }
}

/**
 * Обновляет FCM token при старте приложения (если разрешение уже дано).
 * Если токен изменился — отправляет новый на backend.
 */
export async function refreshPushToken(userId?: string | null): Promise<string | null> {
  const supported = await isPushSupported();
  if (!supported) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    if (!VAPID_KEY) {
      console.warn('[Push] VAPID key not set, skipping token refresh');
      return null;
    }

    const swRegistration = await getMainSWRegistration();
    const messaging = await getMessagingInstance();

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) return null;

    currentToken = token;

    // Отправляем на backend только если токен изменился
    const storedToken = getStoredToken();
    storeToken(token);
    if (tokenNeedsSync(token, storedToken)) {
      sendTokenToBackend(token, userId); // fire-and-forget
    }

    return token;
  } catch (error) {
    console.error('[Push] Error refreshing token:', error);
    return null;
  }
}

/**
 * Подписка на foreground-сообщения (пока вкладка активна).
 */
export async function subscribeForegroundMessages(handler: ForegroundMessageHandler): Promise<void> {
  const supported = await isPushSupported();
  if (!supported) return;

  try {
    const messaging = await getMessagingInstance();

    // Отписываемся от предыдущего listener
    if (foregroundUnsubscribe) {
      foregroundUnsubscribe();
    }

    foregroundUnsubscribe = onMessage(messaging, (payload) => {
      console.log('[Push] Foreground message:', payload);
      handler({
        title: payload.notification?.title || payload.data?.title,
        body: payload.notification?.body || payload.data?.body,
        data: payload.data as Record<string, string>,
      });
    });
  } catch (error) {
    console.error('[Push] Error subscribing to foreground messages:', error);
  }
}

/**
 * Отписка от push-уведомлений: удаляет токен с backend.
 */
/**
 * Тап по пушу в вебе: sw.js открывает страницу с ?push_id=…&push_type=… (план, шаг 0.5).
 * Параметры забираем один раз и убираем из адресной строки.
 */
export async function getInitialPushData(): Promise<Record<string, string> | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const pushId = params.get('push_id');
  if (!pushId) return null;
  const type = params.get('push_type') || 'unknown';
  params.delete('push_id');
  params.delete('push_type');
  const query = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  return { push_id: pushId, type };
}

/** Тихих уведомлений (provisional) в вебе нет — эксперимент 4.3 только для iOS */
export async function requestProvisionalPermission(_userId?: string | null): Promise<PushStatus> {
  return getPushStatus();
}

/** В вебе отозванное разрешение делает токен недействительным — сервер удалит его при отправке */
export async function syncPushPermission(): Promise<void> {}

/** В вебе тап по пушу перезагружает вкладку (sw.js → client.navigate), его ловит getInitialPushData */
export function onPushOpened(_handler: (data: Record<string, string>) => void): () => void {
  return () => {};
}

export async function unsubscribePush(): Promise<boolean> {
  try {
    const token = currentToken || getStoredToken();
    if (token) {
      await removeTokenFromBackend(token);
    }
    storeToken(null);
    currentToken = null;
    return true;
  } catch (error) {
    console.error('[Push] Error unsubscribing:', error);
    return false;
  }
}

/**
 * Возвращает текущий статус push-уведомлений.
 */
export async function getPushStatus(): Promise<PushStatus> {
  const supported = await isPushSupported();
  if (!supported) {
    return { permission: 'unsupported', token: null, isSupported: false };
  }
  return {
    permission: Notification.permission,
    token: currentToken || getStoredToken(),
    isSupported: true,
  };
}

// ==================== BACKEND API ====================

// Намеренно относительный путь, не как в src/config/apiBase.ts — этот модуль целиком web-only
// (FCM Web Push, см. шапку файла; platform: 'web' ниже захардкожен), а в браузере fetch()
// корректно резолвит относительные URL сам, в отличие от нативного React Native. Абсолютный
// URL здесь был бы наоборот регрессией — привязал бы веб-версию к одному конкретному домену
// вместо текущего origin (сломался бы на превью-деплоях/другом домене). См. план, пункт 55.
const API_BASE = '/api/push';

/** JWT входа: сервер привязывает токен к пользователю только по нему (userId из тела игнорирует). */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/**
 * POST /api/push?action=subscribe — отправляет токен на backend.
 * Защита от дублей — backend делает upsert + выше проверяем tokenNeedsSync (новый токен или новая версия).
 */
async function sendTokenToBackend(token: string, userId?: string | null): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}?action=subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ token, platform: 'web', userId: userId || null, appVersion: APP_VERSION }),
    });
    if (!res.ok) {
      console.warn('[Push] Backend subscribe failed:', res.status);
    } else {
      try {
        localStorage.setItem(TOKEN_VERSION_STORAGE_KEY, APP_VERSION);
      } catch {
        // не страшно — отправим ещё раз при следующем запуске
      }
    }
  } catch (error) {
    console.error('[Push] Failed to send token to backend:', error);
  }
}

/**
 * POST /api/push?action=unsubscribe — удаляет токен с backend.
 */
async function removeTokenFromBackend(token: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}?action=unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      console.warn('[Push] Backend unsubscribe failed:', res.status);
    }
  } catch (error) {
    console.error('[Push] Failed to remove token from backend:', error);
  }
}
