import { VertexAI } from '@google-cloud/vertexai';

/**
 * API для извлечения карточек из PDF через Gemini (Vertex AI)
 * Endpoint: /api/extract-pdf
 *
 * POST body: { base64: string }
 * Response:  { cards: [{ front: string, back: string }] }
 */

function getVertexClient() {
  const saKey = process.env.VERTEX_SA_KEY;
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || 'flashly-485417';
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  const options = { project, location };

  if (saKey) {
    try {
      const credentials = JSON.parse(saKey);
      options.googleAuthOptions = { credentials };
    } catch {
      console.error('Failed to parse VERTEX_SA_KEY');
    }
  }

  return new VertexAI(options);
}

// ~10MB base64 limit (~7.5MB raw file)
const MAX_BASE64_LENGTH = 14_000_000;

// Vercel: increase body size limit for PDF uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

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

  const { base64 } = req.body;

  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'base64 string is required' });
  }

  if (base64.length > MAX_BASE64_LENGTH) {
    return res.status(400).json({ error: 'File too large. Maximum 10MB.' });
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

    const prompt = `You are a vocabulary list parser. The user uploaded a PDF with a vocabulary list for language learning.

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

    const result = await generativeModel.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
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

    // Validate and clean cards
    const validCards = cards
      .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim() && c.back.trim())
      .map(c => ({ front: c.front.trim(), back: c.back.trim() }));

    return res.status(200).json({ cards: validCards });
  } catch (error) {
    console.error('Gemini PDF extraction error:', error);
    return res.status(500).json({ error: 'Failed to extract cards from PDF: ' + error.message });
  }
}
