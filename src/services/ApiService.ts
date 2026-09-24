/**
 * API Client для работы с Neon PostgreSQL через Vercel Functions
 */

import { API_BASE } from '@/config/apiBase';

// Раньше был отдельный относительный '/api' — не резолвится в fetch() на нативном React
// Native (в отличие от веба), см. plan/teacher_access_fix_plan.md, пункт 55. Затрагивало как
// минимум extractImageCards (единственный реально используемый метод ниже помимо AI_BASE_URL).
const API_BASE_URL = API_BASE;

// '/ai' — не опечатка: vercel.json намеренно проксирует /ai/:path* на внешний сервер
// (http://34.9.20.41:3001), отдельно от Vercel-функций под /api. Сохраняем тот же путь и в
// проде — просто делаем его абсолютным (та же проблема с относительным URL на нативном RN,
// что и у API_BASE_URL), не меняя, какой бэкенд реально обслуживает эти вызовы.
const AI_BASE_URL = __DEV__
  ? 'http://localhost:3000/api'
  : 'https://ai-app-seven-zeta.vercel.app/ai';

class ApiService {
  /**
   * Проверить статус БД (автоматически создаст таблицы если их нет)
   */
  async checkDatabase() {
    const response = await fetch(`${API_BASE_URL}/db`);
    if (!response.ok) throw new Error('Failed to check database');
    return await response.json();
  }

  /**
   * Инициализация базы данных (вызвать один раз)
   */
  async initDatabase() {
    const response = await fetch(`${API_BASE_URL}/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'init' }),
    });
    return await response.json();
  }

  // ==================== AI ====================

  /**
   * Сгенерировать примеры для слов через Gemini
   */
  async generateExamples(words: Array<{ front: string; back: string }>): Promise<Array<{ front: string; back: string; example: string; wordForm?: string; wordType?: string }>> {
    const response = await fetch(`${AI_BASE_URL}/generate-examples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to generate examples');
    }
    const data = await response.json();
    return data.examples || [];
  }
  /**
   * Извлечь карточки из PDF через Gemini
   */
  async extractPdfCards(base64: string): Promise<Array<{ front: string; back: string }>> {
    const response = await fetch(`${AI_BASE_URL}/extract-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to extract cards from PDF');
    }
    const data = await response.json();
    return data.cards || [];
  }

  /**
   * Извлечь карточки из фото через Gemini
   */
  async extractImageCards(
    base64: string,
    mimeType: string,
    languageFrom?: string,
    languageTo?: string,
  ): Promise<Array<{ front: string; back: string }>> {
    const response = await fetch(`${API_BASE_URL}/extract-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, mimeType, languageFrom, languageTo }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to extract cards from image');
    }
    const data = await response.json();
    return data.cards || [];
  }

  /**
   * Перевести слова через Gemini
   */
  async translateWords(
    words: string[],
    languageFrom?: string,
    languageTo?: string,
  ): Promise<Array<{ front: string; back: string }>> {
    const response = await fetch(`${AI_BASE_URL}/translate-words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words, languageFrom, languageTo }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to translate words');
    }
    const data = await response.json();
    return data.translations || [];
  }
}

export const apiService = new ApiService();
