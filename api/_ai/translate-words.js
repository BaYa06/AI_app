import { VertexAI } from '@google-cloud/vertexai';

/**
 * API для перевода слов через Gemini (Vertex AI)
 * Endpoint: /api/translate-words
 *
 * POST body: { words: string[], languageFrom: string, languageTo: string }
 * Response:  { translations: [{ front: string, back: string }] }
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
    const vertexAI = getVertexClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash-001';

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

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

    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    let translations;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      translations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      console.error('Failed to parse Gemini response:', text);
      translations = [];
    }

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
    console.error('Gemini translation error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to translate words: ' + (error?.message || 'Unknown error') });
  }
}
