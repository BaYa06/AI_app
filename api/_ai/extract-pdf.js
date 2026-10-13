import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';

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
    // Языки набора необязательны: старые клиенты их не присылают
    const languages = languageFrom && languageTo
      ? `\nThe card set languages: front = ${languageFrom}, back = ${languageTo}. Put the ${languageFrom} word in "front" and the ${languageTo} translation in "back".\n`
      : '';

    const prompt = `You are a vocabulary list parser. The user uploaded a PDF with a vocabulary list for language learning.

${languages}
Extract ALL word pairs from this PDF. Each line typically has one of these formats:
- "word/phrase – translation" (separated by dash – with spaces)
- Nouns with article: "der/die/das Wort – translation"
- Verbs: "verb – translation"
- Phrases: "phrase – translation"
- May have numbering (1. 2. etc.) at the start — ignore the numbers
- May have an English translation after a second dash — ignore it, keep only the first translation

Rules:
- "front" = the word/phrase in the language being learned (left side), including article if present
- "back" = the translation (right side, first translation only)
- Skip any lines that are headers, page numbers, or don't contain word pairs
- Do NOT add any words that are not in the PDF

Return ONLY a valid JSON array of objects with "front" and "back" fields. No explanations, no markdown.
Example: [{"front": "der Abschnitt", "back": "раздел"}, {"front": "sterben", "back": "умирать"}]`;

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
