import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';
import { languageName, vocabExtractionRules } from './prompts.js';

/**
 * API для извлечения карточек из PDF через Gemini (Google AI Studio)
 * Endpoint: /api/extract-pdf
 *
 * POST body: { base64: string, languageFrom?: string, languageTo?: string }
 * Response:  { cards: [{ front: string, back: string }] }
 */

// ~4MB base64 limit (~3MB raw file) — Vercel body limit is 4.5MB
const MAX_BASE64_LENGTH = 5_500_000;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { base64, languageFrom, languageTo } = req.body || {};

  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'base64 string is required' });
  }

  if (base64.length > MAX_BASE64_LENGTH) {
    return res.status(400).json({ error: 'File too large. Maximum ~4MB.' });
  }

  try {
    // Языки набора необязательны: старые клиенты их не присылают; приходят кодами ('de', 'ru'…)
    const langFrom = languageName(languageFrom, 'the language being learned (the left side of the list)');
    const langTo = languageName(languageTo, 'the language of the translations in the PDF');

    const prompt = `You extract vocabulary for flashcards from a PDF vocabulary list.
Card set: learning ${langFrom}, translations in ${langTo}.

${vocabExtractionRules(langFrom, langTo)}

Typical line formats: "word – translation", "der/die/das Wort, -e – translation", numbered lines (ignore the numbers), a second translation into another language after another dash (ignore it).

Reply ONLY with a JSON array: [{"front": "...", "back": "..."}]
Example: [{"front": "der Abschnitt, -e", "back": "раздел"}, {"front": "sterben", "back": "умирать"}]`;

    const text = await generateJson({
      models: MODELS.vision,
      prompt,
      files: [{ mimeType: 'application/pdf', data: base64 }],
      temperature: 0.2,
      maxOutputTokens: 8192,
    });
    const cards = parseJsonArray(text);

    // Validate and clean cards
    const validCards = cards
      .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim() && c.back.trim())
      .map(c => ({ front: c.front.trim(), back: c.back.trim() }));

    return res.status(200).json({ cards: validCards });
  } catch (error) {
    return sendAiError(res, error, 'Failed to extract cards from PDF');
  }
}
