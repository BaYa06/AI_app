/**
 * appleSignInName
 * @description Sign in with Apple вне экрана входа.
 * - Имя: Apple отдаёт его только при первом входе, а Supabase из identityToken его не берёт —
 *   передаём из WelcomeScreen в App (создание профиля), чтобы не спрашивать имя повторно
 *   (App Review, Guideline 4).
 * - Код для удаления аккаунта: сервер отзывает по нему токен Apple (api/_apple.js, 5.1.1(v)).
 */
import { Platform } from 'react-native';
import appleAuth from '@invertase/react-native-apple-authentication';

let pendingName: string | null = null;

export function setAppleSignInName(name: string | null): void {
  pendingName = name;
}

/** Забирает имя один раз */
export function takeAppleSignInName(): string | null {
  const name = pendingName;
  pendingName = null;
  return name;
}

export function isAppleUser(user: { app_metadata?: any }): boolean {
  const meta = user.app_metadata ?? {};
  return meta.provider === 'apple' || (Array.isArray(meta.providers) && meta.providers.includes('apple'));
}

export type AppleCodeResult =
  | { status: 'ok'; code: string }
  | { status: 'canceled' }
  | { status: 'unsupported' }
  | { status: 'failed' };

/** Повторный вход через Apple — свежий authorizationCode (живёт 5 минут) для удаления аккаунта */
export async function requestAppleAuthorizationCode(): Promise<AppleCodeResult> {
  if (Platform.OS !== 'ios' || !appleAuth.isSupported) return { status: 'unsupported' };
  try {
    const response = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [],
    });
    return response.authorizationCode ? { status: 'ok', code: response.authorizationCode } : { status: 'failed' };
  } catch (e: any) {
    if (e?.code === appleAuth.Error.CANCELED) return { status: 'canceled' };
    console.error('[auth] Apple re-auth for account deletion failed:', e);
    return { status: 'failed' };
  }
}
