/**
 * Storage Service
 * @description Быстрое локальное хранилище с использованием MMKV
 */
import { MMKV } from 'react-native-mmkv';

// Инициализация MMKV
// Webpack автоматически заменит react-native-mmkv на веб-полифилл при сборке для веба
const storage = new MMKV({
  id: 'flashcards-app',
  encryptionKey: undefined,
});

/**
 * Интерфейс для работы с хранилищем
 */
export const StorageService = {
  // ==================== STRING ====================
  
  getString: (key: string): string | undefined => {
    return storage.getString(key);
  },

  setString: (key: string, value: string): void => {
    storage.set(key, value);
  },

  // ==================== NUMBER ====================
  
  getNumber: (key: string): number | undefined => {
    return storage.getNumber(key);
  },

  setNumber: (key: string, value: number): void => {
    storage.set(key, value);
  },

  // ==================== BOOLEAN ====================
  
  getBoolean: (key: string): boolean | undefined => {
    return storage.getBoolean(key);
  },

  setBoolean: (key: string, value: boolean): void => {
    storage.set(key, value);
  },

  // ==================== OBJECT/JSON ====================
  
  getObject: <T>(key: string): T | undefined => {
    const json = storage.getString(key);
    if (!json) return undefined;
    
    try {
      return JSON.parse(json) as T;
    } catch {
      console.error(`Failed to parse JSON for key: ${key}`);
      return undefined;
    }
  },

  setObject: <T>(key: string, value: T): void => {
    try {
      const json = JSON.stringify(value);
      storage.set(key, json);
    } catch (error) {
      console.error(`Failed to stringify object for key: ${key}`, error);
    }
  },

  // ==================== UTILITY ====================
  
  delete: (key: string): void => {
    storage.delete(key);
  },

  contains: (key: string): boolean => {
    return storage.contains(key);
  },

  getAllKeys: (): string[] => {
    return storage.getAllKeys();
  },

  clearAll: (): void => {
    storage.clearAll();
  },

  // ==================== BATCH OPERATIONS ====================
  
  /**
   * Сохранить несколько объектов за один раз
   */
  setMultiple: <T>(items: Array<{ key: string; value: T }>): void => {
    for (const item of items) {
      StorageService.setObject(item.key, item.value);
    }
  },

  /**
   * Получить несколько объектов за один раз
   */
  getMultiple: <T>(keys: string[]): Array<T | undefined> => {
    return keys.map((key) => StorageService.getObject<T>(key));
  },

  /**
   * Удалить несколько ключей
   */
  deleteMultiple: (keys: string[]): void => {
    for (const key of keys) {
      storage.delete(key);
    }
  },
};

// ==================== КЛЮЧИ ХРАНИЛИЩА ====================

export const STORAGE_KEYS = {
  // Данные
  CARDS: 'cards',
  SETS: 'sets',
  REVIEW_LOGS: 'review_logs',
  
  // Настройки
  SETTINGS: 'settings',
  THEME: 'theme',
  
  // Пользователь
  USER: 'user',
  AUTH_TOKEN: 'auth_token',
  
  // Статистика
  DAILY_STATS: 'daily_stats',
  STREAK: 'streak',
  
  // Синхронизация
  LAST_SYNC: 'last_sync',
  SYNC_QUEUE: 'sync_queue',
  
  // Кеш
  IMAGE_CACHE: 'image_cache',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
