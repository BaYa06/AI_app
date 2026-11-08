/**
 * Какая версия приложения последняя (plan/new/app_update_prompt.md, Update 1).
 *
 * Читает приложение — GET /api/data?action=app-version&platform=ios, без входа и с кэшем на CDN:
 * ответ одинаков для всех. Решает, показывать ли окно «Вышла новая версия», само приложение
 * (src/services/appUpdate.ts, Update 2).
 *
 * Ответ: { latest, releasedAt, minVersion, storeUrl }.
 * - latest / releasedAt — из iTunes lookup (страна APP_STORE_COUNTRY, по умолчанию kg), кэш в памяти
 *   функции на час. Apple недоступен — последний удачный ответ; его нет — null (окно не показываем).
 * - APP_LATEST_VERSION_IOS — ручная поправка latest, если lookup врёт (или проверка на staging: 9.9.9).
 *   Дата выхода такой версии неизвестна → releasedAt: null, приложение не ждёт 3 дня тишины.
 * - APP_MIN_VERSION_IOS — ниже неё окно обязательное. Пусто — нет. Ставить только когда
 *   совместимость API действительно сломана (plan/new/release_safety.md, Release 2 и 5).
 * Apple сам кэширует lookup до суток, поэтому новая версия появляется здесь не сразу — это
 * закрывают 3 дня тишины на стороне приложения.
 */
import { HttpError } from './_access.js';
import { APP_STORE_ID } from './_share-page.js';

export const PLATFORMS = ['ios', 'android', 'web'];

const CACHE_MS = 60 * 60 * 1000;
/** После неудачи спрашиваем Apple снова не раньше чем через 5 минут — не долбим его на каждый запрос */
const RETRY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;

const STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** «1.8.1» → «1.8.1»; мусор, пустая строка, не строка → null */
export function normVersion(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
}

/** Ответ iTunes lookup → { version, releasedAt } или null, если приложения в ответе нет */
export function parseLookup(json) {
  const app = Array.isArray(json?.results)
    ? json.results.find((r) => String(r?.trackId) === APP_STORE_ID) || json.results[0]
    : null;
  const version = normVersion(app?.version);
  if (!version) return null;
  const time = Date.parse(app.currentVersionReleaseDate);
  return { version, releasedAt: Number.isNaN(time) ? null : new Date(time).toISOString() };
}

/** Последний удачный ответ Apple и когда спрашивать снова */
let cache = { value: null, nextAt: 0 };

/** Для тестов */
export function resetAppVersionCache() {
  cache = { value: null, nextAt: 0 };
}

async function lookup({ env, fetchImpl, now }) {
  if (now < cache.nextAt) return cache.value;
  const country = /^[a-z]{2}$/i.test(env.APP_STORE_COUNTRY || '') ? env.APP_STORE_COUNTRY : 'kg';
  try {
    const res = await fetchImpl(
      `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=${country.toLowerCase()}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) throw new Error(`lookup HTTP ${res.status}`);
    const value = parseLookup(await res.json());
    if (!value) throw new Error(`lookup: приложения нет в магазине ${country}`);
    cache = { value, nextAt: now + CACHE_MS };
  } catch (e) {
    cache = { value: cache.value, nextAt: now + RETRY_MS };
    throw Object.assign(e, { stale: cache.value });
  }
  return cache.value;
}

/**
 * @param {{ platform: string, env?: Record<string, string | undefined>,
 *           fetchImpl?: typeof fetch, now?: number, onError?: (e: Error) => void }} p
 */
export async function getAppVersion({
  platform,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
  onError = () => {},
}) {
  if (!PLATFORMS.includes(platform)) throw new HttpError(400, 'Invalid platform');
  // Android пока не в Google Play, веб всегда свежий
  if (platform !== 'ios') {
    return { latest: null, releasedAt: null, minVersion: null, storeUrl: null };
  }

  let store = null;
  try {
    store = await lookup({ env, fetchImpl, now });
  } catch (e) {
    onError(e);
    store = e.stale ?? null;
  }

  const override = normVersion(env.APP_LATEST_VERSION_IOS);
  const latest = override ?? store?.version ?? null;
  return {
    latest,
    releasedAt: store && store.version === latest ? store.releasedAt : null,
    minVersion: normVersion(env.APP_MIN_VERSION_IOS),
    storeUrl: STORE_URL,
  };
}
