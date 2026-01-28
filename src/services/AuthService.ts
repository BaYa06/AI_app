/**
 * AuthService
 * @description Временная обвязка для проверки наличия аккаунта/сессии.
 * Сейчас использует локальное хранилище (MMKV), позже будет заменена
 * на Supabase client с верификацией access_token.
 */
import { StorageService, STORAGE_KEYS } from './StorageService';

export type AuthSession = {
  accessToken: string;
  userId?: string;
  email?: string;
};

const MOCK_TOKEN = 'dev-mock-token';

export const AuthService = {
  /**
   * Проверяет, есть ли сохраненная сессия (замена реальной проверки Supabase).
   */
  async hasSession(): Promise<boolean> {
    const token = StorageService.getString(STORAGE_KEYS.AUTH_TOKEN);
    return Boolean(token);
  },

  /**
   * Возвращает сохраненную сессию (если есть).
   */
  async getSession(): Promise<AuthSession | null> {
    const accessToken = StorageService.getString(STORAGE_KEYS.AUTH_TOKEN);
    if (!accessToken) return null;

    const profile = StorageService.getObject<Partial<AuthSession>>(STORAGE_KEYS.USER);
    return {
      accessToken,
      userId: profile?.userId,
      email: profile?.email,
    };
  },

  /**
   * Сохранить заглушечную сессию (можно дергать из онбординга, пока нет Supabase).
   */
  async saveMockSession(email?: string): Promise<void> {
    StorageService.setString(STORAGE_KEYS.AUTH_TOKEN, MOCK_TOKEN);
    if (email) {
      StorageService.setObject(STORAGE_KEYS.USER, { email });
    }
  },

  /**
   * Очистить локальные данные авторизации.
   */
  async signOut(): Promise<void> {
    StorageService.delete(STORAGE_KEYS.AUTH_TOKEN);
    StorageService.delete(STORAGE_KEYS.USER);
  },
};
