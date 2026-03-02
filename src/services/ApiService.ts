/**
 * API Client для работы с Neon PostgreSQL через Vercel Functions
 */

const API_BASE_URL = __DEV__
  ? 'http://localhost:3000/api'
  : '/api';

const AI_BASE_URL = __DEV__
  ? 'http://34.9.20.41:3001'
  : '/ai';

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

  // ==================== НАБОРЫ ====================

  /**
   * Получить все наборы пользователя
   */
  async getSets(userId: string) {
    const response = await fetch(`${API_BASE_URL}/sets?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch sets');
    return await response.json();
  }

  /**
   * Создать новый набор
   */
  async createSet(data: {
    userId: string;
    title: string;
    description?: string;
    category?: string;
    languageFrom?: string;
    languageTo?: string;
    isPublic?: boolean;
  }) {
    const response = await fetch(`${API_BASE_URL}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create set');
    return await response.json();
  }

  /**
   * Обновить набор
   */
  async updateSet(id: string, data: {
    title?: string;
    description?: string;
    category?: string;
    isPublic?: boolean;
  }) {
    const response = await fetch(`${API_BASE_URL}/sets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to update set');
    return await response.json();
  }

  /**
   * Удалить набор
   */
  async deleteSet(id: string) {
    const response = await fetch(`${API_BASE_URL}/sets?id=${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete set');
    return await response.json();
  }

  // ==================== КАРТОЧКИ ====================

  /**
   * Получить карточки набора
   */
  async getCards(setId: string, dueOnly = false) {
    const url = `${API_BASE_URL}/cards?setId=${setId}${dueOnly ? '&dueOnly=true' : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch cards');
    return await response.json();
  }

  /**
   * Создать карточку
   */
  async createCard(data: {
    setId: string;
    front: string;
    back: string;
    example?: string;
    imageUrl?: string;
    audioUrl?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create card');
    return await response.json();
  }

  /**
   * Обновить карточку (включая SRS данные)
   */
  async updateCard(id: string, data: {
    front?: string;
    back?: string;
    example?: string;
    learningStep?: number;
    nextReview?: string;
    lastReviewed?: string;
    status?: 'new' | 'learning' | 'young' | 'mature';
  }) {
    const response = await fetch(`${API_BASE_URL}/cards`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    });
    if (!response.ok) throw new Error('Failed to update card');
    return await response.json();
  }

  /**
   * Удалить карточку
   */
  async deleteCard(id: string, setId: string) {
    const response = await fetch(`${API_BASE_URL}/cards?id=${id}&setId=${setId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete card');
    return await response.json();
  }

  // ==================== AI ====================

  /**
   * Сгенерировать примеры для слов через Gemini
   */
  async generateExamples(words: Array<{ front: string; back: string }>): Promise<Array<{ front: string; back: string; example: string }>> {
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
}

export const apiService = new ApiService();
