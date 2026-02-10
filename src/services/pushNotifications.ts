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
    if (token !== storedToken) {
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
    const storedToken = getStoredToken();

    storeToken(token);
    if (token !== storedToken) {
      console.log('[Push] Token changed, updating backend');
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

const API_BASE = '/api/push';

/**
 * POST /api/push/subscribe — отправляет токен на backend.
 * Защита от дублей — backend должен делать upsert.
 */
async function sendTokenToBackend(token: string, userId?: string | null): Promise<void> {
  const url = `${API_BASE}/subscribe`;
  const payload = {
    token,
    platform: 'web',
    userId: userId || null,
  };
  
  console.log('[Push] Sending token to backend...');
  console.log('[Push] URL:', url);
  console.log('[Push] Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    console.log('[Push] Response status:', res.status);
    console.log('[Push] Response headers:', Object.fromEntries(res.headers.entries()));
    
    const text = await res.text();
    console.log('[Push] Response body:', text);
    
    if (!res.ok) {
      console.warn('[Push] Backend subscribe failed:', res.status, text);
    } else {
      console.log('[Push] ✅ Token sent to backend successfully');
    }
  } catch (error) {
    console.error('[Push] ❌ Failed to send token to backend:', error);
  }
}

/**
 * POST /api/push/unsubscribe — удаляет токен с backend.
 */
async function removeTokenFromBackend(token: string): Promise<void> {
  const url = `${API_BASE}/unsubscribe`;
  const payload = { token };
  
  console.log('[Push] Removing token from backend...');
  console.log('[Push] URL:', url);
  console.log('[Push] Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    console.log('[Push] Response status:', res.status);
    const text = await res.text();
    console.log('[Push] Response body:', text);
    
    if (!res.ok) {
      console.warn('[Push] Backend unsubscribe failed:', res.status, text);
    } else {
      console.log('[Push] ✅ Token removed from backend successfully');
    }
  } catch (error) {
    console.error('[Push] ❌ Failed to remove token from backend:', error);
  }
}
