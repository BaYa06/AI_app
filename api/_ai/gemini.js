import { GoogleGenAI, ThinkingLevel } from '@google/genai';

/**
 * Общий клиент Gemini для AI-эндпоинтов (Google AI Studio, ключ GEMINI_API_KEY).
 * Раньше был Vertex AI — у него нет бесплатного уровня; модели gemini-2.0-* Google отключил.
 *
 * Модели — алиасы, которые Google сам переводит на актуальную версию; переопределяются env:
 *   GEMINI_MODEL_VISION — фото и PDF (распознавание);
 *   GEMINI_MODEL_TEXT   — перевод, примеры, дистракторы (у Flash-Lite своя бесплатная квота).
 */

export const MODELS = {
  vision: process.env.GEMINI_MODEL_VISION || 'gemini-flash-latest',
  text: process.env.GEMINI_MODEL_TEXT || 'gemini-flash-lite-latest',
};

// Запас до maxDuration функции (vercel.json), чтобы ответить ошибкой, а не быть оборванными
const TIMEOUT_MS = 50_000;

let client = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * Запрос к Gemini с ответом в JSON. Возвращает текст ответа.
 * prompt — строка; files — необязательные [{ mimeType, data(base64) }] перед текстом.
 */
export async function generateJson({ model, prompt, files = [], temperature, maxOutputTokens }) {
  const parts = [
    ...files.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })),
    { text: prompt },
  ];

  const response = await getClient().models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      // Размышления в 2–3 раза удлиняют ответ, для извлечения слов и примеров они не нужны
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    },
  });

  return response.text || '';
}

/** Достаёт JSON-массив из ответа; [] если не удалось. */
export function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Модель иногда оборачивает ответ в ```json … ``` — ищем массив в тексте
  }
  try {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    console.error('Failed to parse Gemini response:', text);
    return [];
  }
}

/**
 * Ответ на ошибку Gemini: 429 — квота/перегрузка, 504 — тайм-аут, иначе 500.
 * Поле error старые клиенты показывают как есть или заменяют своим текстом.
 */
export function sendAiError(res, error, fallbackMessage) {
  const status = error?.status ?? error?.code;
  if (status === 429) {
    return res.status(429).json({ error: 'ai_busy', retryAfter: 30 });
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return res.status(504).json({ error: 'ai_timeout' });
  }
  console.error(`${fallbackMessage}:`, error?.message || error);
  return res.status(500).json({ error: `${fallbackMessage}: ${error?.message || 'Unknown error'}` });
}
