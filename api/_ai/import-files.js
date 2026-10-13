import { MODELS, generateJson, parseJsonObject, sendAiError } from './gemini.js';
import { consumeRecognition } from './usage.js';
import { getAuthedUserId } from '../_auth.js';

/**
 * Единый ИИ-импорт: фото, PDF, CSV/TSV и вставленный текст → карточки.
 * Endpoint: /api/import-files (переехал с GCP VM, server/import-files.js)
 *
 * POST body:
 *   files: Array<
 *     | { type: 'binary', name, mimeType: image/* | 'application/pdf', base64 }
 *     | { type: 'text',   name, mimeType: 'text/csv' | 'text/tab-separated-values' | 'text/plain', content }
 *   >  — до 5 файлов, всего до ~3 МБ (лимит тела запроса Vercel — 4,5 МБ)
 *   goal?:   'vocab' (по умолчанию) | 'pick_words' | 'all_words' | 'terms' | 'qa'
 *   level?:  'A1' | 'A2' | 'B1' | 'B2' | 'C1' — для pick_words
 *   prompt?: string — своя инструкция пользователя, важнее goal
 *   languageFrom?, languageTo?: string — языки набора (изучаемый → перевод)
 *
 * Нужен Bearer-токен Supabase (гости — анонимные пользователи, токен есть) → иначе 401.
 * Лимит — 20 распознаваний в день (usage.js) → 429 { error: 'daily_limit', limit, resetAt }.
 *
 * Response: {
 *   cards: [{ front, back, example?, confidence?: 'low' }],
 *   suggestedTitle, count,
 *   kind: 'vocab' | 'text' | 'exercise' | 'empty' — что на самом деле загрузили,
 *   lang: string | null — язык содержимого (ISO 639-1),
 *   excerpt?: string    — начало текста, когда kind = 'text',
 *   usage: { used, limit, resetAt }
 * }
 * При goal = 'vocab' без своей инструкции сплошной текст карточками не становится:
 * возвращаем kind = 'text' и пустой cards — приложение спросит, что из него сделать.
 */

const BINARY_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
]);
const TEXT_MIME_TYPES = new Set(['text/csv', 'text/tab-separated-values', 'text/plain']);

const MAX_FILES = 5;
// Тело запроса Vercel — 4,5 МБ; base64 + текст + JSON-обёртка должны уложиться
const MAX_TOTAL_CHARS = 4_200_000;

const GOALS = new Set(['vocab', 'pick_words', 'all_words', 'terms', 'qa']);
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const KINDS = new Set(['vocab', 'text', 'exercise', 'empty']);

function goalInstruction(goal, level, langTo) {
  switch (goal) {
    case 'pick_words':
      return `Pick about 15 words or set phrases from the content that a learner at CEFR level ${level} probably does NOT know yet. Skip very basic words, proper names and numbers. For each: "front" = dictionary form (nouns with article, verbs in infinitive), "back" = translation into ${langTo}, "example" = the sentence from the content where it appears, copied verbatim.`;
    case 'all_words':
      return `Make a card for every distinct word of the content (deduplicated, dictionary form: nouns with article, verbs in infinitive). Skip proper names and numbers. "back" = translation into ${langTo}.`;
    case 'terms':
      return 'Make cards from terms and their definitions: "front" = term, "back" = definition, as written in the content.';
    case 'qa':
      return 'Make question-answer cards that check understanding of the content: "front" = question, "back" = short answer. Use the language of the content.';
    default:
      return `Extract the vocabulary list: "front" = word or phrase in the language being learned (keep articles), "back" = its translation as written. If a word has no translation in the content, translate it into ${langTo}. Ignore numbering, headers, page numbers and exercise instructions.`;
  }
}

function buildPrompt({ goal, level, userPrompt, languageFrom, languageTo }) {
  const langFrom = languageFrom || 'the language being learned';
  const langTo = languageTo || "the user's native language";
  const stopOnText = goal === 'vocab' && !userPrompt;

  return `You are a flashcard generator for a language learning app. The user uploaded files (photos, PDFs, tables or pasted text).
Card set: learning ${langFrom}, translations in ${langTo}.

First, classify the content as "kind":
- "vocab": a vocabulary list or table (word — translation, or just a list of words)
- "text": continuous prose — an article, story, dialogue, letter
- "exercise": exercises, gap fills, pictures with tasks, without a usable word list
- "empty": no readable text

Task: ${userPrompt ? `follow the user's instruction: "${userPrompt}"` : goalInstruction(goal, level, langTo)}
${stopOnText ? 'If kind is "text", "exercise" or "empty", return an empty "cards" array — do not invent cards.\n' : ''}
Rules:
- Use ONLY what is in the files. Never invent words that are not there.
- If text is handwritten, blurry or you are unsure about a word, add "confidence": "low" to that card.
- "example" is optional; include it only when the task asks for it.

Return ONLY a JSON object of this shape:
{
  "kind": "vocab" | "text" | "exercise" | "empty",
  "lang": ISO 639-1 code of the main language of the content (the words being learned), or null,
  "title": "2–5 words summarising the content, in ${langTo}",
  "excerpt": "first ~200 characters of the content, only when kind is \\"text\\"",
  "cards": [{ "front": "...", "back": "...", "example": "...", "confidence": "low" }]
}`;
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return 'files array is required';
  if (files.length > MAX_FILES) return `Maximum ${MAX_FILES} files allowed`;

  let total = 0;
  for (const file of files) {
    if (file?.type === 'binary') {
      if (!BINARY_MIME_TYPES.has(file.mimeType)) return `Unsupported file type: ${file.mimeType}`;
      if (typeof file.base64 !== 'string' || !file.base64) return `Missing base64 for: ${file.name || 'file'}`;
      total += file.base64.length;
    } else if (file?.type === 'text') {
      if (!TEXT_MIME_TYPES.has(file.mimeType)) return `Unsupported file type: ${file.mimeType}`;
      if (typeof file.content !== 'string' || !file.content.trim()) return `Missing content for: ${file.name || 'text'}`;
      total += file.content.length;
    } else {
      return 'Each file needs type "binary" or "text"';
    }
  }
  if (total > MAX_TOTAL_CHARS) return 'too_large';
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { files, goal: rawGoal, level: rawLevel, prompt, languageFrom, languageTo } = req.body || {};

  const invalid = validateFiles(files);
  if (invalid === 'too_large') return res.status(413).json({ error: 'too_large' });
  if (invalid) return res.status(400).json({ error: invalid });

  const userId = await getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  let quota;
  try {
    quota = await consumeRecognition(userId);
  } catch (error) {
    console.error('[import-files] usage check failed:', error?.message || error);
    return res.status(500).json({ error: 'Failed to check usage' });
  }
  if (!quota.ok) {
    return res.status(429).json({ error: 'daily_limit', limit: quota.usage.limit, resetAt: quota.usage.resetAt });
  }

  const goal = GOALS.has(rawGoal) ? rawGoal : 'vocab';
  const level = LEVELS.has(rawLevel) ? rawLevel : 'B1';
  const userPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 500) : '';

  try {
    const binaryFiles = files
      .filter(f => f.type === 'binary')
      .map(f => ({ mimeType: f.mimeType, data: f.base64 }));
    // Текстовые файлы — прямо в промпт, с именем файла как контекстом (заголовки CSV помогают понять столбцы)
    const textBlocks = files
      .filter(f => f.type === 'text')
      .map(f => `[File: ${f.name || 'text'} (${f.mimeType})]\n${f.content}`)
      .join('\n\n');

    const fullPrompt = buildPrompt({ goal, level, userPrompt, languageFrom, languageTo })
      + (textBlocks ? `\n\nFiles content:\n${textBlocks}` : '');

    const text = await generateJson({
      model: MODELS.vision,
      prompt: fullPrompt,
      files: binaryFiles,
      temperature: 0.2,
      // «Все слова подряд» из длинного текста — сотни карточек
      maxOutputTokens: goal === 'all_words' ? 16384 : 8192,
    });
    const parsed = parseJsonObject(text);

    const cards = (Array.isArray(parsed.cards) ? parsed.cards : [])
      .filter(c => c && typeof c.front === 'string' && c.front.trim())
      .map(c => ({
        front: c.front.trim(),
        back: typeof c.back === 'string' ? c.back.trim() : '',
        ...(typeof c.example === 'string' && c.example.trim() ? { example: c.example.trim() } : {}),
        ...(c.confidence === 'low' ? { confidence: 'low' } : {}),
      }));

    const kind = KINDS.has(parsed.kind) ? parsed.kind : (cards.length ? 'vocab' : 'empty');
    const lang = typeof parsed.lang === 'string' && /^[a-z]{2}$/i.test(parsed.lang) ? parsed.lang.toLowerCase() : null;
    const suggestedTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const excerpt = kind === 'text' && typeof parsed.excerpt === 'string' ? parsed.excerpt.trim().slice(0, 300) : undefined;

    // Ничего не нашли (текст, упражнение, пусто) — распознавание не засчитываем:
    // следующим запросом пользователь выберет, что делать с текстом
    if (cards.length === 0) await quota.refund();

    console.log(`[import-files] files=${files.length} goal=${goal} kind=${kind} lang=${lang} cards=${cards.length}`);

    return res.status(200).json({
      cards,
      suggestedTitle,
      count: cards.length,
      kind,
      lang,
      ...(excerpt ? { excerpt } : {}),
      usage: quota.usage,
    });
  } catch (error) {
    await quota.refund();
    return sendAiError(res, error, 'Failed to generate cards');
  }
}
