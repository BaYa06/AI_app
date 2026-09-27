import { VertexAI } from '@google-cloud/vertexai';

/**
 * API для извлечения карточек из фото через Gemini (Vertex AI)
 * Endpoint: /api/extract-image
 *
 * POST body: { base64: string, mimeType: string, languageFrom?: string, languageTo?: string }
 * Response:  { cards: [{ front: string, back: string }] }
 */

function getVertexClient() {
  const saKey = process.env.VERTEX_SA_KEY;
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || 'flashly-485417';
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  if (!saKey) {
    throw new Error('VERTEX_SA_KEY environment variable is not set');
  }

  const options = { project, location };

  try {
    const credentials = JSON.parse(saKey);
    options.googleAuthOptions = { credentials };
  } catch {
    throw new Error('Failed to parse VERTEX_SA_KEY as JSON');
  }

  return new VertexAI(options);
}

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

  const { base64, mimeType, languageFrom, languageTo } = req.body || {};

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
    const vertexAI = getVertexClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash-001';

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });

    const langFrom = languageFrom || 'the language being learned';
    const langTo = languageTo || 'the translation language';

    const prompt = `You are a vocabulary extractor. The user uploaded a photo of a textbook page or vocabulary list for language learning.

The card set languages:
- Language being learned (front of card): ${langFrom}
- Translation language (back of card): ${langTo}

Extract ALL words and phrases from this image that are relevant for language learning.

Rules:
- "front" = the word/phrase in ${langFrom}, including article if present (e.g. "der Hund", "la maison")
- "back" = the translation in ${langTo}. If no translation is visible on the image, set "back" to an empty string ""
- Skip any lines that are headers, page numbers, exercise instructions, or don't contain vocabulary
- Do NOT add any words that are not in the image
- If words are in a table format, extract each row as a pair
- If the image contains numbered lists, ignore the numbers

Return ONLY a valid JSON array of objects with "front" and "back" fields. No explanations, no markdown.
Example: [{"front": "der Abschnitt", "back": "раздел"}, {"front": "sterben", "back": "умирать"}]
Example with no translations: [{"front": "der Abschnitt", "back": ""}, {"front": "sterben", "back": ""}]`;

    const result = await generativeModel.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          { text: prompt },
        ],
      }],
    });

    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    let cards;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      cards = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      console.error('Failed to parse Gemini response:', text);
      cards = [];
    }

    // Validate and clean cards — back can be empty for image imports
    const validCards = cards
      .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim())
      .map(c => ({ front: c.front.trim(), back: c.back.trim() }));

    return res.status(200).json({ cards: validCards });
  } catch (error) {
    console.error('Gemini image extraction error:', error?.message || error);
    const message = error?.message || 'Unknown error';
    return res.status(500).json({ error: 'Failed to extract cards from image: ' + message });
  }
}
