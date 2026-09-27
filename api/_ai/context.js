import { VertexAI } from '@google-cloud/vertexai';

/**
 * API для режима "Слово в контексте"
 *
 * POST /api/context?action=distractors
 *   Body: { word, translation, wordType, count }
 *   Генерирует слова-дистракторы через Gemini когда карточек в наборе не хватает
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
    const vertexAI = getVertexClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash-001';

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: { temperature: 0.8, maxOutputTokens: 256 },
    });

    const prompt = `You are a language learning assistant.

Given the word "${word}" (translation: "${translation}", part of speech: ${wordType}), generate ${safeCount} DISTRACTOR words in the same language as "${word}" that:
- Are the same part of speech as "${word}"
- Are similar in topic or difficulty
- Are clearly DIFFERENT in meaning from "${word}"
- Would plausibly appear in the same type of sentence

Return ONLY a JSON array of strings (the words themselves, no translations, no explanations).
Example: ["schlafen", "kaufen", "schreiben"]`;

    const result = await generativeModel.generateContent(prompt);
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    let distractors = [];
    try {
      const match = text.match(/\[[\s\S]*?\]/);
      const parsed = match ? JSON.parse(match[0]) : [];
      distractors = parsed
        .filter(w => typeof w === 'string' && w.trim().toLowerCase() !== word.toLowerCase())
        .slice(0, safeCount);
    } catch {
      console.error('Failed to parse distractor response:', text);
    }

    return res.status(200).json({ distractors });
  } catch (error) {
    console.error('Distractor generation error:', error);
    return res.status(500).json({ error: 'Failed to generate distractors' });
  }
}
