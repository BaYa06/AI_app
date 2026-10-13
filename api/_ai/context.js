import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';

/**
 * API для режима "Слово в контексте"
 *
 * POST /api/context?action=distractors
 *   Body: { word, translation, wordType, count, example?, wordForm? }
 *   Генерирует слова-дистракторы через Gemini когда карточек в наборе не хватает.
 *   Варианты стоят рядом с лицевой стороной карточки — поэтому в той же форме, что и word;
 *   example (необязательно, старые клиенты не шлют) — предложение с пропуском: дистракторы не должны в него подходить.
 */

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
 * Body: { word, translation, wordType, count, example?, wordForm? }
 */
async function generateDistractors(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, translation, wordType = 'other', count = 3, example, wordForm } = req.body || {};
  if (!word || !translation) {
    return res.status(400).json({ error: 'word and translation are required' });
  }

  const safeCount = Math.min(Math.max(1, Number(count)), 5);

  try {
    const sentence = typeof example === 'string' && example.trim()
      ? `\nThe learner sees this sentence with a blank instead of "${typeof wordForm === 'string' && wordForm ? wordForm : word}":\n"${example.trim()}"\nEach distractor must NOT fit the blank naturally — only "${word}" should make sense there.\n`
      : '';

    const prompt = `You create wrong answer options for a flashcard quiz. The correct answer is the flashcard word "${word}" (meaning: "${translation}", part of speech: ${wordType}).
${sentence}
Give ${safeCount} distractors that:
- are in the same language as "${word}" and written in the SAME format: same part of speech; nouns with an article if "${word}" has one (with their own correct article); verbs in the same form (infinitive, reflexive "sich …" if "${word}" is reflexive); a phrase if "${word}" is a phrase;
- if "${word}" has grammar notes (e.g. "der Hund, -e"), give the distractors without notes;
- are common words of similar difficulty and length, from a similar topic;
- clearly differ in meaning: no synonyms, no antonyms that also fit, no words with the same root, no different forms of "${word}".

Reply ONLY with a JSON array of ${safeCount} strings.
Example for "der Hund" (собака): ["die Katze", "der Vogel", "das Pferd"]`;

    // Ответ крошечный, но лимит с запасом: размышления модели тоже расходуют токены ответа
    const text = await generateJson({ models: MODELS.text, prompt, temperature: 0.8, maxOutputTokens: 1024 });
    const distractors = parseJsonArray(text)
      .filter(w => typeof w === 'string' && w.trim().toLowerCase() !== word.toLowerCase())
      .slice(0, safeCount);

    return res.status(200).json({ distractors });
  } catch (error) {
    return sendAiError(res, error, 'Failed to generate distractors');
  }
}
