import { createPrivateKey, sign } from 'node:crypto';

/**
 * Sign in with Apple: отзыв токенов при удалении аккаунта (App Review 5.1.1(v),
 * https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens).
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 *
 * Токены Apple мы не храним: перед удалением приложение заново спрашивает вход через Apple
 * и присылает свежий authorizationCode (живёт 5 минут, одноразовый). Здесь он меняется на
 * refresh-токен, который сразу отзывается.
 *
 * Переменные Vercel (ключ — Apple Developer → Keys, с включённым Sign in with Apple):
 *   APPLE_TEAM_ID     — Team ID
 *   APPLE_KEY_ID      — Key ID ключа
 *   APPLE_PRIVATE_KEY — содержимое .p8 (переводы строк можно заменить на \n)
 *   APPLE_CLIENT_ID   — Bundle ID приложения (по умолчанию com.baiirbek.flashly)
 */

const APPLE_AUTH_URL = 'https://appleid.apple.com';
const DEFAULT_CLIENT_ID = 'com.baiirbek.flashly';

export function isAppleUser(user) {
  const meta = user?.app_metadata ?? {};
  return meta.provider === 'apple' || (Array.isArray(meta.providers) && meta.providers.includes('apple'));
}

export function isAppleRevokeConfigured() {
  return Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

function clientId() {
  return process.env.APPLE_CLIENT_ID || DEFAULT_CLIENT_ID;
}

/** client_secret для Apple — JWT ES256, подписанный ключом .p8 */
function createClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: process.env.APPLE_KEY_ID };
  const payload = {
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 300,
    aud: APPLE_AUTH_URL,
    sub: clientId(),
  };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const key = createPrivateKey(process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'));
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

async function postForm(path, fields) {
  const resp = await fetch(`${APPLE_AUTH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const text = await resp.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* revoke отвечает пустым телом */ }
  return { ok: resp.ok, status: resp.status, json };
}

/**
 * Меняет authorizationCode на токен и отзывает его. Бросает ошибку, если Apple не подтвердил.
 */
export async function revokeAppleAuthorization(authorizationCode) {
  const clientSecret = createClientSecret();
  const common = { client_id: clientId(), client_secret: clientSecret };

  const tokenResp = await postForm('/auth/token', {
    ...common,
    code: authorizationCode,
    grant_type: 'authorization_code',
  });
  if (!tokenResp.ok) {
    throw new Error(`Apple token exchange failed: ${tokenResp.status} ${tokenResp.json?.error ?? ''}`);
  }

  const { refresh_token: refreshToken, access_token: accessToken } = tokenResp.json ?? {};
  const token = refreshToken || accessToken;
  if (!token) throw new Error('Apple token exchange returned no token');

  const revokeResp = await postForm('/auth/revoke', {
    ...common,
    token,
    token_type_hint: refreshToken ? 'refresh_token' : 'access_token',
  });
  if (!revokeResp.ok) {
    throw new Error(`Apple revoke failed: ${revokeResp.status} ${revokeResp.json?.error ?? ''}`);
  }
}
