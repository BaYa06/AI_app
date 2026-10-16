/**
 * API Client для работы с Neon PostgreSQL через Vercel Functions
 */

import { API_BASE } from '@/config/apiBase';
import { hasAiConsent } from './aiConsent';

// Раньше был отдельный относительный '/api' — не резолвится в fetch() на нативном React
// Native (в отличие от веба), см. plan/teacher_access_fix_plan.md, пункт 55.
// Распознавание фото/PDF и перевод — в AiImportService (plan/done/ai_import.md).
const API_BASE_URL = API_BASE;

// Раньше '/ai' проксировался на GCP VM (http://34.9.20.41:3001), которая без оплаты не работает.
// ИИ теперь — Vercel-функция api/ai (plan/done/ai_import.md); старые сборки по-прежнему ходят на
// /ai/*, vercel.json перенаправляет их туда же.
const AI_BASE_URL = API_BASE;

function requireAiConsent(): void {
  if (!hasAiConsent()) throw new Error('AI consent required');
}

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
  // Без согласия на передачу данных ИИ запрос не уходит (App Review 5.1.2(i), services/aiConsent.ts).
  // Окно согласия показывают экраны до действия — здесь только страховка.

  /**
   * Сгенерировать примеры для слов через Gemini
   */
  async generateExamples(
    words: Array<{ front: string; back: string }>,
    languageFrom?: string,
    languageTo?: string,
  ): Promise<Array<{ front: string; back: string; example: string; wordForm?: string; wordType?: string }>> {
    requireAiConsent();
    const response = await fetch(`${AI_BASE_URL}/generate-examples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words, languageFrom, languageTo }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to generate examples');
    }
    const data = await response.json();
    return data.examples || [];
  }
}

export const apiService = new ApiService();
