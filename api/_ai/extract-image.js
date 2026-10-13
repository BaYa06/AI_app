import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';
import { languageName, vocabExtractionRules } from './prompts.js';

/**
 * API для извлечения карточек из фото через Gemini (Google AI Studio)
 * Endpoint: /api/extract-image
 *
 * POST body: { base64: string, mimeType: string, languageFrom?: string, languageTo?: string }
 * Response:  { cards: [{ front: string, back: string }] }
 */

// ~4MB base64 limit (~3MB raw file) — Vercel body limit is 4.5MB
const MAX_BASE64_LENGTH = 5_500_000;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

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
  // Выбор фото на iOS отдаёт нестандартный 'image/jpg'
  const rawMime = typeof req.body?.mimeType === 'string' ? req.body.mimeType.toLowerCase() : '';
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;

  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'base64 string is required' });
  }

  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: 'Valid image mimeType is required (jpeg, png, webp, heic)' });
  }

  if (base64.length > MAX_BASE64_LENGTH) {
    return res.status(400).json({ error: 'File too large. Maximum ~4MB.' });
  }

  try {
    // Языки приходят кодами набора ('de', 'ru'…)
    const langFrom = languageName(languageFrom, 'the language being learned');
    const langTo = languageName(languageTo, "the user's native language");

    const prompt = `You extract vocabulary for flashcards from a photo of a textbook page, notebook or vocabulary list.
Card set: learning ${langFrom}, translations in ${langTo}.

${vocabExtractionRules(langFrom, langTo)}

Handwriting or blurry text: extract only what you can read confidently.
If the photo has no vocabulary (continuous text, exercises, pictures), return [].

Reply ONLY with a JSON array: [{"front": "...", "back": "..."}]
Example: [{"front": "der Abschnitt, -e", "back": "раздел"}, {"front": "sterben", "back": "умирать"}]`;

    const text = await generateJson({
      models: MODELS.vision,
      prompt,
      files: [{ mimeType, data: base64 }],
      temperature: 0.2,
      maxOutputTokens: 8192,
    });
    const cards = parseJsonArray(text);

    // Validate and clean cards — back can be empty for image imports
    const validCards = cards
      .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim())
      .map(c => ({ front: c.front.trim(), back: c.back.trim() }));

    return res.status(200).json({ cards: validCards });
  } catch (error) {
    return sendAiError(res, error, 'Failed to extract cards from image');
  }
}
