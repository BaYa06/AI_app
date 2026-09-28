/**
 * Кэш последних ответов сервера на устройстве (stale-while-revalidate).
 * Экраны сразу показывают сохранённое значение, а свежее подменяют, когда придёт; без сети —
 * остаётся сохранённое. Ключ привязан к пользователю, чьи данные на устройстве (CACHE_OWNER_KEY),
 * поэтому после выхода и входа другим аккаунтом чужие значения не показываются.
 */
import { StorageService } from './StorageService';

/** Чьи данные сохранены на устройстве (id пользователя последней полной загрузки) */
export const CACHE_OWNER_KEY = 'cache_owner_user_id';

const fullKey = (name: string): string | null => {
  const owner = StorageService.getString(CACHE_OWNER_KEY);
  return owner ? `cache:${owner}:${name}` : null;
};

export function readCache<T>(name: string): T | undefined {
  const key = fullKey(name);
  if (!key) return undefined;
  try {
    return StorageService.getObject<{ v: T }>(key)?.v;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(name: string, value: T): void {
  const key = fullKey(name);
  if (!key || value === undefined) return;
  try {
    StorageService.setObject(key, { v: value, at: Date.now() });
  } catch {
    // переполнение/ошибка хранилища — не страшно, это только кэш
  }
}
