import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';
import { WORD_FORMAT_RULES, languageName } from './prompts.js';

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
  // Языки приходят кодами набора ('de', 'ru'…)
  const langFrom = languageName(languageFrom, 'the language of the words (detect it)');
  const langTo = languageName(languageTo, "the user's native language");

  try {
    const wordList = batch.map((w, i) => `${i + 1}. ${w}`).join('\n');

    const prompt = `You translate flashcard words for a language learning app: from ${langFrom} into ${langTo}.

Words:
${wordList}

${WORD_FORMAT_RULES}

Translate each word as a dictionary entry, not as part of a sentence. Ignore grammar notes after the word ("der Hund, -e" → translate "Hund").
Return EXACTLY ${batch.length} items in the SAME order.
Reply ONLY with a JSON array: [{"front": "<word exactly as given>", "back": "<translation>"}]
Example (German → Russian): [{"front": "der Hund, -e", "back": "собака"}, {"front": "sich freuen auf", "back": "радоваться (чему-либо)"}]`;

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
