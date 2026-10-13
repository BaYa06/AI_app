import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';

/**
 * API для перевода слов через Gemini (Google AI Studio)
 * Endpoint: /api/translate-words
 *
 * POST body: { words: string[], languageFrom: string, languageTo: string }
 * Response:  { translations: [{ front: string, back: string }] }
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { words, languageFrom, languageTo } = req.body || {};

  if (!words || !Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array is required' });
  }

  const batch = words.slice(0, 100);
  const langFrom = languageFrom || 'the source language';
  const langTo = languageTo || 'the target language';

  try {
    const wordList = batch.map((w, i) => `${i + 1}. ${w}`).join('\n');

    const prompt = `You are a language learning translator. Translate the following words/phrases from ${langFrom} to ${langTo}.

Words to translate:
${wordList}

Rules:
- Provide the most common, natural translation for each word
- For nouns, keep the article if present (e.g. "der Hund" → translate just "Hund", keep "der" in front)
- If a word has multiple meanings, pick the most common one
- Return EXACTLY ${batch.length} translations in the SAME order

Return ONLY a valid JSON array of objects with "front" (original word) and "back" (translation). No explanations, no markdown.
Example: [{"front": "der Hund", "back": "собака"}, {"front": "laufen", "back": "бежать"}]`;

    const text = await generateJson({ models: MODELS.text, prompt, temperature: 0.2, maxOutputTokens: 4096 });
    const translations = parseJsonArray(text).filter(t => t && typeof t === 'object');

    // Match translations back to original words by index
    const result_translations = batch.map((word, i) => {
      const frontLower = word.toLowerCase().trim();
      const match = translations.find(
        t => t.front && t.front.toLowerCase().trim() === frontLower
      );
      return {
        front: word,
        back: match ? (match.back || '').trim() : (translations[i]?.back || '').trim(),
      };
    });

    return res.status(200).json({ translations: result_translations });
  } catch (error) {
    return sendAiError(res, error, 'Failed to translate words');
  }
}
