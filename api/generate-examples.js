import { VertexAI } from '@google-cloud/vertexai';

/**
 * API для генерации примеров через Gemini (Vertex AI)
 * Endpoint: /api/generate-examples
 *
 * POST body: { words: [{ front: string, back: string }] }
 * Response:  { examples: [{ front, back, example }] }
 */

function getVertexClient() {
  // Для Vercel: credentials через env-переменную (JSON-строка)
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
  // Локально: подхватит GOOGLE_APPLICATION_CREDENTIALS автоматически

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

  const { words } = req.body;

  if (!words || !Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array is required' });
  }

  // Ограничение: макс 100 слов за раз
  const batch = words.slice(0, 100);

  try {
    const vertexAI = getVertexClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash-001';

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    // Формируем список слов для промпта
    const wordList = batch
      .map((w, i) => `${i + 1}. ${w.front} — ${w.back}`)
      .join('\n');

    const prompt = `You are a language learning assistant. Below is a numbered list of words the user is studying. The LEFT side is the word in the language being learned, the RIGHT side is the translation in the user's native language.

For each word, write ONE short example sentence (max 10 words) that uses the LEFT-side word in context. The example MUST be written in the same language as the LEFT side (the language being learned), NOT in the native language.

Words:
${wordList}

IMPORTANT: Return EXACTLY ${batch.length} examples, one for each word, in the SAME order as the numbered list above.
Reply ONLY with a JSON array of objects. Each object must have "word" (the exact LEFT-side word from the list) and "example" (the sentence). No extra text.
Example format:
[{"word": "dog", "example": "I saw a big dog in the park."}, {"word": "coffee", "example": "She drinks coffee every morning."}]`;

    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // Извлекаем JSON из ответа (Gemini иногда оборачивает в ```json ... ```)
    let examples;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      examples = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      console.error('Failed to parse Gemini response:', text);
      examples = [];
    }

    // Собираем результат — сопоставляем по слову, а не по индексу
    const result_words = batch.map((w, i) => {
      let example = '';

      if (Array.isArray(examples) && examples.length > 0) {
        if (typeof examples[0] === 'object' && examples[0] !== null) {
          // Новый формат: массив объектов {word, example}
          // Сначала ищем точное совпадение по слову
          const frontLower = w.front.toLowerCase().trim();
          const match = examples.find(
            e => e.word && e.word.toLowerCase().trim() === frontLower
          );
          if (match) {
            example = match.example || '';
          } else {
            // Фоллбэк: по индексу
            example = examples[i]?.example || '';
          }
        } else {
          // Старый формат: массив строк — по индексу
          example = examples[i] || '';
        }
      }

      return {
        front: w.front,
        back: w.back,
        example,
      };
    });

    return res.status(200).json({ examples: result_words });
  } catch (error) {
    console.error('Gemini API error:', error);
    return res.status(500).json({ error: 'Failed to generate examples: ' + error.message });
  }
}
