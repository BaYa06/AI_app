import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';

/**
 * API для генерации примеров через Gemini (Google AI Studio)
 * Endpoint: /api/generate-examples
 *
 * POST body: { words: [{ front: string, back: string }] }
 * Response:  { examples: [{ front, back, example }] }
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

  const { words } = req.body;

  if (!words || !Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array is required' });
  }

  // Ограничение: макс 100 слов за раз
  const batch = words.slice(0, 100);

  try {
    // Формируем список слов для промпта
    const wordList = batch
      .map((w, i) => `${i + 1}. ${w.front} — ${w.back}`)
      .join('\n');

    const prompt = `You are a language learning assistant. Below is a numbered list of words the user is studying. The LEFT side is the word in the language being learned, the RIGHT side is the translation in the user's native language.

For each word:
1. Write ONE example sentence (8–12 words) in the SAME language as the LEFT-side word, following these rules:
   - The word must be KEY to the sentence — without knowing it, the meaning is unclear
   - Do NOT place an article (der/die/das/ein/a/the/etc.) directly before the word
   - The sentence must be everyday and realistic
   - Do NOT use synonyms or paraphrases that would give away the meaning
   - For German separable verbs (trennbare Verben like "anrufen", "aufstehen", etc.): use a subordinate clause (Nebensatz) so the verb appears unseparated in infinitive form at the end (e.g. "Ich weiß, dass ich dich morgen anrufen werde.")
   - For all other words: you may use any natural inflected form that fits the sentence
2. Identify the EXACT form of the word as it appears in the sentence (e.g. if word is "run" but sentence uses "running", return "running"; if word is "Hund" but sentence uses "Hunde", return "Hunde").
3. Identify the part of speech of the LEFT-side word. Use ONLY one of: "noun", "verb", "adjective", "adverb", "other".

Words:
${wordList}

IMPORTANT: Return EXACTLY ${batch.length} items, one for each word, in the SAME order as the numbered list above.
Reply ONLY with a JSON array of objects. Each object must have:
- "word": the exact LEFT-side word from the list
- "example": the example sentence
- "wordForm": the exact form of the word as it appears in the sentence
- "wordType": the part of speech ("noun", "verb", "adjective", "adverb", or "other")

No extra text. Example format:
[{"word": "gehen", "example": "Ich muss morgen früh zur Schule gehen.", "wordForm": "gehen", "wordType": "verb"}, {"word": "Hund", "example": "Mein Nachbar hat zwei kleine Hunde gekauft.", "wordForm": "Hunde", "wordType": "noun"}]`;

    // 100 слов × ~25 токенов на пример — 4096 впритык, берём с запасом
    const text = await generateJson({ model: MODELS.text, prompt, temperature: 0.7, maxOutputTokens: 8192 });
    const examples = parseJsonArray(text);

    const VALID_WORD_TYPES = ['noun', 'verb', 'adjective', 'adverb', 'other'];

    // Собираем результат — сопоставляем по слову, а не по индексу
    const result_words = batch.map((w, i) => {
      let example = '';
      let wordForm = null;
      let wordType = null;

      if (Array.isArray(examples) && examples.length > 0) {
        if (typeof examples[0] === 'object' && examples[0] !== null) {
          // Формат: массив объектов {word, example, wordType}
          const frontLower = w.front.toLowerCase().trim();
          const match = examples.find(
            e => e.word && e.word.toLowerCase().trim() === frontLower
          );
          const entry = match || examples[i];
          if (entry) {
            example = entry.example || '';
            wordForm = entry.wordForm || null;
            wordType = VALID_WORD_TYPES.includes(entry.wordType) ? entry.wordType : null;
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
        wordForm,
        wordType,
      };
    });

    return res.status(200).json({ examples: result_words });
  } catch (error) {
    return sendAiError(res, error, 'Failed to generate examples');
  }
}
