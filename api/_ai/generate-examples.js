import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';
import { languageName } from './prompts.js';

/**
 * API для генерации примеров через Gemini (Google AI Studio)
 * Endpoint: /api/generate-examples
 *
 * POST body: { words: [{ front: string, back: string }], languageFrom?: string, languageTo?: string }
 *   Языки — коды набора ('de', 'ru'…); старые клиенты их не шлют — тогда модель определяет язык сама.
 *   Пример нужен режиму «Слово в контексте»: слово в нём заменяется пропуском по wordForm.
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

  const { words, languageFrom, languageTo } = req.body || {};

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

    const langFrom = languageName(languageFrom, 'the language of the LEFT-side words (detect it)');
    const langTo = languageName(languageTo, "the user's native language");

    const prompt = `You write example sentences for a flashcard app. In "word in context" mode the app shows the sentence with the word replaced by a blank, and the learner picks the missing word from options.

Words being learned (LEFT, ${langFrom}) with translations (RIGHT, ${langTo}):
${wordList}

For EACH word return:
1. "example" — ONE sentence in ${langFrom}:
   - natural, everyday, grammatically perfect; about 6–12 words (Chinese/Japanese: about 10–20 characters);
   - the rest of the sentence uses simple, common words, so the learner understands the context;
   - the context makes the missing word clearly guessable, but the sentence does not contain the word's translation, a synonym or a definition;
   - use the word itself, not a different word from the same root.
2. "wordForm" — the word exactly as it appears in your sentence, character for character (same case and inflection), so the app can find and blank it:
   - nouns written with an article on the LEFT (der Hund, la maison, el perro): build the sentence so the noun appears WITH the same article and include the article in wordForm ("der Hund"). If grammar forces another case or form, use it correctly and put exactly that in wordForm ("den Hund").
   - ignore grammar notes on the LEFT ("der Hund, -e", "laufen, lief, gelaufen"): use only the word itself.
   - German/Dutch separable verbs (anrufen, aufstehen): use a subordinate clause or modal verb so the verb stays in one piece ("…, dass ich dich morgen anrufen werde.").
   - Grammar always wins: never change normal word order to keep a phrase together ("Die Kinder freuen sich auf…", not "Die Kinder sich freuen auf…").
     Reflexive verbs, phrasal verbs and set phrases whose parts end up apart: wordForm = only the inflected main word as it appears ("freuen"); if the parts stand together, wordForm = the whole phrase ("give up").
   - Turkish, Korean and other agglutinative languages: wordForm is the whole inflected word as it appears (evimizde, 학교에서).
   - Chinese/Japanese: wordForm is the exact characters used in the sentence.
3. "wordType" — part of speech of the LEFT word: "noun", "verb", "adjective", "adverb" or "other".

Return EXACTLY ${batch.length} items in the SAME order as the list.
Reply ONLY with a JSON array: [{"word": "<LEFT word exactly as given>", "example": "...", "wordForm": "...", "wordType": "..."}]
Example: [{"word": "der Hund, -e", "example": "Jeden Morgen geht der Hund mit mir im Park spazieren.", "wordForm": "der Hund", "wordType": "noun"}, {"word": "anrufen", "example": "Ich weiß, dass du mich heute Abend anrufen wirst.", "wordForm": "anrufen", "wordType": "verb"}]`;

    // 100 слов × ~25 токенов на пример — 4096 впритык, берём с запасом
    const text = await generateJson({ models: MODELS.text, prompt, temperature: 0.7, maxOutputTokens: 8192 });
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
            // Пропуск ставится по точному совпадению — форма, которой нет в предложении, бесполезна
            if (wordForm && !example.toLowerCase().includes(wordForm.toLowerCase())) wordForm = null;
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
