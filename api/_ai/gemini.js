import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GROQ_MODELS, groqGenerate, isGroqEnabled } from './groq.js';

/**
 * Общий клиент Gemini для AI-эндпоинтов (Google AI Studio, ключ GEMINI_API_KEY).
 * Раньше был Vertex AI — у него нет бесплатного уровня; модели gemini-2.0-* Google отключил.
 *
 * Для каждой задачи — список моделей по порядку: если модель перегружена (503) или упёрлась
 * в квоту (429), пробуем следующую. У каждой модели своя бесплатная квота, так что запасная
 * модель ещё и добавляет запросов в день. Переопределяются env (через запятую):
 *   GEMINI_MODEL_VISION — фото и PDF (распознавание);
 *   GEMINI_MODEL_TEXT   — перевод, примеры, дистракторы.
 */

function modelList(envValue, fallback) {
  const list = (envValue || '').split(',').map(m => m.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

// Порядок — по замерам на бесплатном ключе (13.10.2026): самые новые (3.7, 3.8, *-latest)
// почти всегда 503, 2.5 отключены. Первой — стабильная 3.1 Flash-Lite: медленнее (5–14 с),
// зато почти не отказывает и даёт одинаковое качество; быстрые модели — запасные.
export const MODELS = {
  vision: modelList(process.env.GEMINI_MODEL_VISION, [
    'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash',
  ]),
  text: modelList(process.env.GEMINI_MODEL_TEXT, [
    'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3-flash-preview',
  ]),
};

// Общий бюджет на все попытки — с запасом до maxDuration функции (vercel.json, 300 с)
const TIMEOUT_MS = 90_000;
// Модель иногда зависает — не отдаём ей весь бюджет (последней модели достаётся остаток)
const ATTEMPT_MS = 35_000;
// Меньше этого на следующую модель не остаётся смысла пробовать
const MIN_ATTEMPT_MS = 5_000;
// Сколько оставить резерву Groq (текстовые задачи): он быстрый, 1–3 с на ответ
const GROQ_RESERVE_MS = 20_000;
const GROQ_ATTEMPT_MS = 15_000;

let client = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function errorStatus(error) {
  return error?.status ?? error?.code;
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

/** Перегрузка или квота — стоит попробовать другую модель */
function isRetryable(error) {
  const status = errorStatus(error);
  return status === 429 || status === 503;
}

/**
 * Запрос к ИИ с ответом в JSON. Возвращает текст ответа.
 * models — модели Gemini по приоритету (MODELS.vision / MODELS.text);
 * prompt — строка; files — необязательные [{ mimeType, data(base64) }] перед текстом.
 * Все модели Gemini перегружены и файлов нет → резерв Groq (если задан GROQ_API_KEY).
 */
export async function generateJson({ models, prompt, files = [], temperature, maxOutputTokens }) {
  const parts = [
    ...files.map(f => ({ inlineData: { mimeType: f.mimeType, data: f.data } })),
    { text: prompt },
  ];
  const deadline = Date.now() + TIMEOUT_MS;
  // Фото и PDF Groq не принимает — резерв только для текста
  const useGroq = files.length === 0 && isGroqEnabled();
  const geminiDeadline = useGroq ? deadline - GROQ_RESERVE_MS : deadline;

  let lastError = null;
  for (const [index, model] of models.entries()) {
    const remaining = geminiDeadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    const isLast = index === models.length - 1;
    const attemptMs = isLast ? remaining : Math.min(remaining, ATTEMPT_MS);
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          temperature,
          maxOutputTokens,
          responseMimeType: 'application/json',
          // Размышления в 2–3 раза удлиняют ответ, для извлечения слов и примеров они не нужны
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: AbortSignal.timeout(attemptMs),
        },
      });
      return response.text || '';
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) && !isTimeout(error)) throw error;
      console.warn(`[gemini] ${model} → ${isTimeout(error) ? 'timeout' : errorStatus(error)}, пробуем следующую модель`);
    }
  }

  if (useGroq) {
    for (const model of GROQ_MODELS) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) break;
      try {
        const text = await groqGenerate({
          model, prompt, temperature, maxOutputTokens, timeoutMs: Math.min(remaining, GROQ_ATTEMPT_MS),
        });
        console.warn(`[gemini] все модели заняты — ответил резерв Groq ${model}`);
        return text;
      } catch (error) {
        // Последний резерв: любая ошибка (квота, 413 «больше поминутного лимита токенов»,
        // снятая с поддержки модель) — пробуем следующую; в ответ уйдёт ошибка Gemini
        console.warn(`[groq] ${model} → ${isTimeout(error) ? 'timeout' : errorStatus(error)}, пробуем следующую модель`);
      }
    }
  }

  throw lastError || Object.assign(new Error('timeout'), { name: 'TimeoutError' });
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

/** Достаёт JSON-объект из ответа; {} если не удалось. */
export function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // см. parseJsonArray
  }
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch {
    console.error('Failed to parse Gemini response:', text);
    return {};
  }
}

/**
 * Ответ на ошибку Gemini: 429/503 — квота/перегрузка → 429 ai_busy, тайм-аут → 504, иначе 500.
 * Поле error старые клиенты показывают как есть или заменяют своим текстом.
 */
export function sendAiError(res, error, fallbackMessage) {
  if (isRetryable(error)) {
    return res.status(429).json({ error: 'ai_busy', retryAfter: 30 });
  }
  if (isTimeout(error)) {
    return res.status(504).json({ error: 'ai_timeout' });
  }
  console.error(`${fallbackMessage}:`, error?.message || error);
  return res.status(500).json({ error: `${fallbackMessage}: ${error?.message || 'Unknown error'}` });
}
