/**
 * Push-уведомления в нативном приложении (FCM через @react-native-firebase/messaging).
 *
 * Тот же API, что у веб-версии в pushNotifications.ts: Metro подхватывает этот файл на
 * iOS/Android вместо веб-модуля, webpack — наоборот, берёт pushNotifications.ts.
 *
 * Пока только iOS: на Android нет google-services.json, и вызов Firebase там упадёт,
 * поэтому Android честно отвечает «не поддерживается».
 */
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  requestPermission,
  hasPermission,
  onMessage,
  onTokenRefresh,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import { API_BASE as APP_API_BASE } from '@/config/apiBase';
import { supabase } from './supabaseClient';

export interface PushStatus {
  /** Текущее разрешение: granted / denied / default */
  permission: NotificationPermission | 'unsupported';
  /** FCM token (null если не получен) */
  token: string | null;
  /** Поддерживаются ли push на этом устройстве */
  isSupported: boolean;
  /** Ошибка, если была */
  error?: string;
}

export type ForegroundMessageHandler = (payload: {
  title?: string;
  body?: string;
  data?: Record<string, string>;
}) => void;

const IS_SUPPORTED = Platform.OS === 'ios';
const API_BASE = `${APP_API_BASE}/push`;

let currentToken: string | null = null;
let currentUserId: string | null = null;
let tokenRefreshUnsubscribe: (() => void) | null = null;
let foregroundUnsubscribe: (() => void) | null = null;

function messaging() {
  return getMessaging(getApp());
}

function toPermission(status: number): NotificationPermission {
  if (status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  if (status === AuthorizationStatus.DENIED) return 'denied';
  return 'default';
}

export async function isPushSupported(): Promise<boolean> {
  return IS_SUPPORTED;
}

/** Получает FCM-токен, отправляет его на backend и следит за его обновлением. */
async function registerToken(userId?: string | null): Promise<string> {
  const token = await getToken(messaging());
  currentToken = token;
  currentUserId = userId ?? currentUserId;
  await sendTokenToBackend(token);

  if (!tokenRefreshUnsubscribe) {
    tokenRefreshUnsubscribe = onTokenRefresh(messaging(), (newToken) => {
      currentToken = newToken;
      sendTokenToBackend(newToken).catch(() => {});
    });
  }
  return token;
}

/**
 * Запрашивает разрешение (системный диалог iOS показывается только один раз — пока
 * пользователь не ответил) и регистрирует токен.
 */
export async function requestPushPermission(userId?: string | null): Promise<PushStatus> {
  if (!IS_SUPPORTED) {
    return { permission: 'unsupported', token: null, isSupported: false, error: 'Push notifications not supported' };
  }
  try {
    const permission = toPermission(await requestPermission(messaging()));
    if (permission !== 'granted') {
      return { permission, token: null, isSupported: true, error: 'Permission denied' };
    }
    const token = await registerToken(userId);
    return { permission, token, isSupported: true };
  } catch (error: any) {
    console.error('[Push] requestPushPermission failed:', error);
    return { permission: 'default', token: null, isSupported: true, error: error?.message || 'Unknown error' };
  }
}

/** Тихо обновляет токен при входе, если разрешение уже выдано (без диалога). */
export async function refreshPushToken(userId?: string | null): Promise<string | null> {
  if (!IS_SUPPORTED) return null;
  try {
    const permission = toPermission(await hasPermission(messaging()));
    if (permission !== 'granted') return null;
    return await registerToken(userId);
  } catch (error) {
    console.error('[Push] refreshPushToken failed:', error);
    return null;
  }
}

/**
 * Сообщения, пришедшие при открытом приложении. Баннер iOS показывает сам
 * (см. firebase.json → messaging_ios_foreground_presentation_options), здесь — только колбэк.
 */
export async function subscribeForegroundMessages(handler: ForegroundMessageHandler): Promise<void> {
  if (!IS_SUPPORTED) return;
  foregroundUnsubscribe?.();
  foregroundUnsubscribe = onMessage(messaging(), (message) => {
    handler({
      title: message.notification?.title,
      body: message.notification?.body,
      data: message.data as Record<string, string> | undefined,
    });
  });
}

export async function unsubscribePush(): Promise<boolean> {
  if (!IS_SUPPORTED) return false;
  try {
    const token = currentToken ?? (await getToken(messaging()));
    await removeTokenFromBackend(token);
    await deleteToken(messaging());
    currentToken = null;
    return true;
  } catch (error) {
    console.error('[Push] unsubscribePush failed:', error);
    return false;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!IS_SUPPORTED) {
    return { permission: 'unsupported', token: null, isSupported: false };
  }
  try {
    const permission = toPermission(await hasPermission(messaging()));
    const token = permission === 'granted' ? currentToken ?? (await getToken(messaging())) : null;
    return { permission, token, isSupported: true };
  } catch {
    return { permission: 'default', token: null, isSupported: true };
  }
}

// ==================== BACKEND API ====================

/** Заголовок с JWT: backend берёт userId из токена входа, а не из тела запроса. */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function sendTokenToBackend(token: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}?action=subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ token, platform: Platform.OS, userId: currentUserId }),
    });
    if (!res.ok) console.warn('[Push] Backend subscribe failed:', res.status);
  } catch (error) {
    console.error('[Push] Failed to send token to backend:', error);
  }
}

async function removeTokenFromBackend(token: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}?action=unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) console.warn('[Push] Backend unsubscribe failed:', res.status);
  } catch (error) {
    console.error('[Push] Failed to remove token from backend:', error);
  }
}
