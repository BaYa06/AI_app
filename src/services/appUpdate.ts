/**
 * Окно «Вышла новая версия» — когда и какое показывать (plan/new/app_update_prompt.md, Update 2)
 * @description JS только решает, Swift-шторка (Update 3) только рисует.
 *   - Обязательное: версия ниже minVersion. Показываем всегда, кроме идущего теста.
 *   - Мягкое: в магазине версия новее. Раз за «заход» (холодный запуск или возврат после 30+ минут
 *     в фоне), не раньше чем через 3 дня после выхода версии, не в тесте и не в сессии, не при
 *     запуске по ссылке/пушу/виджету, не в течение 6 часов после «Обновить», только по свежим
 *     данным сервера (не старше суток).
 *   Последний ответ сервера живёт на устройстве (не в localCache: тот привязан к пользователю и
 *   пуст до входа) — обязательное окно срабатывает и без сети.
 */
import { API_BASE } from '@/config/apiBase';
import { StorageService } from './StorageService';
import { compareVersions } from './whatsNew';

const STORAGE_KEY = 'app_update';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Столько в фоне — и возврат считается новым заходом */
export const ENTRY_BACKGROUND_MS = 30 * MINUTE;
/** Столько ждём после выхода версии: автообновление и кэш Apple успеют сработать */
export const RELEASE_GRACE_MS = 3 * DAY;
/** После «Обновить» мягкое окно молчит: в его стране обновление могло ещё не появиться */
export const STORE_OPENED_QUIET_MS = 6 * HOUR;
/** Мягкое окно только по данным не старше этого */
export const CONFIG_FRESH_MS = DAY;
/** Дольше ответа сервера не ждём — работаем по кэшу */
export const APP_VERSION_FETCH_TIMEOUT_MS = 3000;

/** Ответ GET /api/data?action=app-version (api/_appVersion.js) */
export interface AppVersionInfo {
  latest: string | null;
  /** ISO-дата выхода latest; null — неизвестна (ручная поправка на сервере), не ждём */
  releasedAt: string | null;
  minVersion: string | null;
  storeUrl: string | null;
}

export interface AppUpdateState {
  /** Последний удачный ответ сервера */
  config?: AppVersionInfo;
  /** Когда он получен, мс */
  fetchedAt?: number;
  /** Когда последний раз показали окно, мс */
  lastShownAt?: number;
  /** Когда последний раз нажали «Обновить», мс */
  storeOpenedAt?: number;
}

export type UpdatePrompt = 'none' | 'soft' | 'force';

export interface UpdateContext {
  appVersion: string;
  state: AppUpdateState | undefined;
  now: number;
  /** Был заход, а мягкое окно за него ещё не показывали */
  entryPending: boolean;
  /** Идёт тест (plan/done/exam_lockdown.md) */
  inTest: boolean;
  /** Идёт сессия «Изучить» или урок */
  inSession: boolean;
  /** Запуск по ссылке, пушу, виджету или Live Activity (modalGate) */
  launchInterrupted: boolean;
}

const VERSION_RE = /^\d+(\.\d+){0,3}$/;

const isVersion = (v: unknown): v is string => typeof v === 'string' && VERSION_RE.test(v);

/** Версия ниже порога. Кривые значения — «нет»: лучше не показать окно, чем запереть приложение */
export function isOlder(version: string, than: string | null | undefined): boolean {
  return isVersion(version) && isVersion(than) && compareVersions(version, than) < 0;
}

export function decideUpdatePrompt(ctx: UpdateContext): UpdatePrompt {
  const config = ctx.state?.config;
  if (!config) return 'none';

  if (isOlder(ctx.appVersion, config.minVersion)) {
    // Тест доводим до конца — окно появится после него
    return ctx.inTest ? 'none' : 'force';
  }

  if (!ctx.entryPending || ctx.inTest || ctx.inSession || ctx.launchInterrupted) return 'none';
  if (!isOlder(ctx.appVersion, config.latest)) return 'none';

  const fetchedAt = ctx.state?.fetchedAt ?? 0;
  if (ctx.now - fetchedAt > CONFIG_FRESH_MS) return 'none';

  const released = config.releasedAt ? Date.parse(config.releasedAt) : NaN;
  if (!Number.isNaN(released) && ctx.now - released < RELEASE_GRACE_MS) return 'none';

  const storeOpenedAt = ctx.state?.storeOpenedAt;
  if (storeOpenedAt != null && ctx.now - storeOpenedAt < STORE_OPENED_QUIET_MS) return 'none';

  return 'soft';
}

// ==================== Заходы ====================

/**
 * Заход = холодный запуск или возврат после 30+ минут в фоне. Ждёт, пока мягкое окно покажут:
 * если человек пришёл по ссылке или сразу ушёл в урок, окно появится, когда он вернётся на главную.
 */
let entryPending = false;
let backgroundAt: number | null = null;

/** Холодный запуск */
export function markColdStart(): void {
  entryPending = true;
  backgroundAt = null;
}

/**
 * Смена AppState: 'background' запоминает время, 'active' после долгого фона — новый заход.
 * @returns true, если с этим 'active' начался новый заход (пора спросить сервер)
 */
export function onAppStateChange(state: string, now: number = Date.now()): boolean {
  if (state === 'background') {
    backgroundAt ??= now;
  } else if (state === 'active') {
    const entry = backgroundAt != null && now - backgroundAt >= ENTRY_BACKGROUND_MS;
    if (entry) entryPending = true;
    backgroundAt = null;
    return entry;
  }
  return false;
}

export function isEntryPending(): boolean {
  return entryPending;
}

/** Мягкое окно показано — до следующего захода больше не надо */
export function consumeEntry(): void {
  entryPending = false;
}

/**
 * Мягкое окно уже показывали в этом запуске — «Что нового» тогда не открываем: не больше одного
 * окна обновления/новостей за запуск (решение 6)
 */
let softShownThisRun = false;

export function markSoftShownThisRun(): void {
  softShownThisRun = true;
}

export function wasSoftShownThisRun(): boolean {
  return softShownThisRun;
}

/** Для тестов */
export function resetEntries(): void {
  entryPending = false;
  backgroundAt = null;
  softShownThisRun = false;
  refreshing = null;
}

// ==================== Состояние на устройстве ====================

export function loadAppUpdateState(): AppUpdateState | undefined {
  const saved = StorageService.getObject<AppUpdateState>(STORAGE_KEY);
  return saved && typeof saved === 'object' ? saved : undefined;
}

function saveAppUpdateState(state: AppUpdateState): void {
  StorageService.setObject(STORAGE_KEY, state);
}

function patchState(patch: Partial<AppUpdateState>): AppUpdateState {
  const next = { ...loadAppUpdateState(), ...patch };
  saveAppUpdateState(next);
  return next;
}

export function markUpdatePromptShown(now: number = Date.now()): void {
  patchState({ lastShownAt: now });
}

/** Нажали «Обновить» */
export function markStoreOpened(now: number = Date.now()): void {
  patchState({ storeOpenedAt: now });
}

// ==================== Ответ сервера ====================

/** Запрос этого захода: главная ждёт его же, а не шлёт свой */
let refreshing: Promise<AppUpdateState | undefined> | null = null;

/** Спросить сервер на заходе (холодный запуск, возврат после долгого фона) */
export function refreshOnEntry(platform: string): Promise<AppUpdateState | undefined> {
  refreshing = refreshAppVersion({ platform });
  return refreshing;
}

/** Ответ этого захода; запроса не было — то, что уже на устройстве */
export function entryRefresh(): Promise<AppUpdateState | undefined> {
  return refreshing ?? Promise.resolve(loadAppUpdateState());
}

const isVersionOrNull = (v: unknown) => v === null || isVersion(v);

/** Ответ сервера → AppVersionInfo. Битый — null (окно не показываем, кэш не трогаем) */
export function parseAppVersion(data: unknown): AppVersionInfo | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  if (!isVersionOrNull(d.latest) || !isVersionOrNull(d.minVersion)) return null;
  const releasedAt =
    typeof d.releasedAt === 'string' && !Number.isNaN(Date.parse(d.releasedAt))
      ? d.releasedAt
      : null;
  const storeUrl =
    typeof d.storeUrl === 'string' && /^https:\/\/apps\.apple\.com\//.test(d.storeUrl)
      ? d.storeUrl
      : null;
  return {
    latest: (d.latest as string | null) ?? null,
    releasedAt,
    minVersion: (d.minVersion as string | null) ?? null,
    storeUrl,
  };
}

/**
 * Свежий ответ сервера (не дольше 3 с). Удачный — сохраняем. Без сети или при ошибке — прежнее
 * состояние: обязательное окно не пропадёт из-за одного неудачного запроса. `latest: null`
 * (Apple не ответил серверу) — обновляем только minVersion. Только iOS (Android пока не в Google Play).
 */
export async function refreshAppVersion(opts: {
  platform: string;
  now?: number;
  timeoutMs?: number;
}): Promise<AppUpdateState | undefined> {
  if (opts.platform !== 'ios') return undefined;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(
    () => controller?.abort(),
    opts.timeoutMs ?? APP_VERSION_FETCH_TIMEOUT_MS
  );
  try {
    const res = await fetch(`${API_BASE}/data?action=app-version&platform=ios`, {
      signal: controller?.signal,
    });
    if (!res.ok) return loadAppUpdateState();
    const config = parseAppVersion((await res.json())?.data);
    if (!config) return loadAppUpdateState();
    if (config.latest === null) {
      // Apple не ответил серверу: порог обязательного обновления берём новый, а версию и дату
      // выхода — прежние, и данные свежими не считаем
      const prev = loadAppUpdateState()?.config;
      return patchState({
        config: prev
          ? { ...prev, minVersion: config.minVersion, storeUrl: config.storeUrl ?? prev.storeUrl }
          : config,
      });
    }
    return patchState({ config, fetchedAt: opts.now ?? Date.now() });
  } catch {
    return loadAppUpdateState();
  } finally {
    clearTimeout(timer);
  }
}
