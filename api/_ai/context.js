import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';

/**
 * API для режима "Слово в контексте"
 *
 * POST /api/context?action=distractors
 *   Body: { word, translation, wordType, count }
 *   Генерирует слова-дистракторы через Gemini когда карточек в наборе не хватает
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  if (action === 'distractors') return generateDistractors(req, res);

  return res.status(400).json({ error: 'Unknown action' });
}

/**
 * POST ?action=distractors
 * Body: { word, translation, wordType, count }
 */
async function generateDistractors(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, translation, wordType = 'other', count = 3 } = req.body;
  if (!word || !translation) {
    return res.status(400).json({ error: 'word and translation are required' });
  }

  const safeCount = Math.min(Math.max(1, Number(count)), 5);

  try {
    const prompt = `You are a language learning assistant.

Given the word "${word}" (translation: "${translation}", part of speech: ${wordType}), generate ${safeCount} DISTRACTOR words in the same language as "${word}" that:
- Are the same part of speech as "${word}"
- Are similar in topic or difficulty
- Are clearly DIFFERENT in meaning from "${word}"
- Would plausibly appear in the same type of sentence

Return ONLY a JSON array of strings (the words themselves, no translations, no explanations).
Example: ["schlafen", "kaufen", "schreiben"]`;

    // Ответ крошечный, но лимит с запасом: размышления модели тоже расходуют токены ответа
    const text = await generateJson({ model: MODELS.text, prompt, temperature: 0.8, maxOutputTokens: 1024 });
    const distractors = parseJsonArray(text)
      .filter(w => typeof w === 'string' && w.trim().toLowerCase() !== word.toLowerCase())
      .slice(0, safeCount);

    return res.status(200).json({ distractors });
  } catch (error) {
    return sendAiError(res, error, 'Failed to generate distractors');
  }
}
