import { neon } from '@neondatabase/serverless';
import { getAuthedUserId } from '../_auth.js';
import { log } from '../_log.js';
import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';
import { languageName } from './prompts.js';
import { normalize, sameAnswer } from '../_exam/check.js';
import { blankSentence, countWord, validateSentence } from '../_exam/edit.js';
import { scriptOf } from '../_exam/prepare.js';

/**
 * «Вставь слово» пишет ИИ (plan/new/web_cabinet.md; решение пользователя 28.11.2026).
 *
 * Сборка экзамена в вебе ставит такие вопросы заготовками (extra.ai = 'pending'). Здесь ИИ для каждого
 * пишет предложение, ставит слово в нужную форму («study» → «studied») и даёт три неверных варианта в
 * той же форме, которые по смыслу в предложение НЕ подходят (не синонимы — иначе второй верный ответ).
 * Остальные форматы ИИ не трогает: их варианты по-прежнему из слов набора (код).
 *
 * Всё проверяет код (judgeGap): слово действительно из этой карточки, пропуск ровно один, других слов
 * экзамена в предложении нет (подсказка), варианты не совпадают с ответом и друг с другом, не однокоренные,
 * на том же алфавите, сама модель подтвердила «подходит только ответ». Не прошло — вторая попытка;
 * снова нет — вопрос становится «письменным ответом» (код), экзамен не ломается.
 * Результат сразу сохраняется в вопросы черновика: перезагрузка страницы ничего не теряет.
 *
 * POST /api/ai?fn=exam-gap   Authorization: Bearer <токен учителя>
 * Body: { sessionId, fallback?: true }  — fallback: без ИИ, все заготовки → письменный ответ
 * Ответ: { written, fallback, pending: 0 }
 * Права: только учитель экзамена, до старта. Лимит — запусков в час (api_rate_limits, 'ai-exam-gap').
 */

export const HOURLY_LIMIT = Number(process.env.AI_EXAM_HOURLY_LIMIT) || 20;
const ACTION = 'ai-exam-gap';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Вторую попытку делаем, только если после первой осталось столько времени (мс) */
const RETRY_BUDGET_MS = 120_000;

function hourWindow() {
  const now = new Date();
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours()
  );
  return {
    windowStart: new Date(start).toISOString(),
    resetAt: new Date(start + 3600_000).toISOString(),
  };
}

async function consume(sql, userId) {
  const { windowStart, resetAt } = hourWindow();
  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      user_id UUID NOT NULL,
      action VARCHAR(50) NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, action, window_start)
    )
  `;
  const rows = await sql`
    INSERT INTO api_rate_limits (user_id, action, window_start, attempts)
    VALUES (${userId}::uuid, ${ACTION}, ${windowStart}::timestamptz, 1)
    ON CONFLICT (user_id, action, window_start) DO UPDATE SET attempts = api_rate_limits.attempts + 1
    WHERE api_rate_limits.attempts < ${HOURLY_LIMIT}
    RETURNING attempts
  `;
  return rows.length > 0 ? { ok: true } : { ok: false, resetAt };
}

/** Слово в предложении — та же карточка, а не другое слово: «study» → «studied», «box» → «boxes» */
export function sameStem(form, base) {
  const f = normalize(form);
  const b = normalize(base);
  if (!f || !b) return false;
  if (f === b) return true;
  if (/\s/.test(b) || /\s/.test(f)) return false; // фразы — только как есть
  const k = Math.min(4, Math.max(2, b.length - 2));
  return f.slice(0, k) === b.slice(0, k);
}

/** Однокоренной вариант (reluctant → reluctantly) мог бы подойти как ответ — такие не берём */
function related(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  return x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5);
}

/**
 * Проверка ответа ИИ для одного вопроса.
 * item — { baseForm }, raw — { sentence, form, wrong[], onlyAnswerFits }, otherWords — другие слова экзамена.
 * → { ok: true, prompt, answer, options } | { ok: false, reason }
 */
export function judgeGap(item, raw, otherWords = []) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'bad_answer' };
  const base = String(item.baseForm || '').trim();
  const form = String(raw.form ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!form || !sameStem(form, base)) return { ok: false, reason: 'other_word' };
  const prompt = blankSentence(raw.sentence, form);
  if (!prompt) return { ok: false, reason: 'no_word_in_sentence' };
  const sv = validateSentence({ answer: form }, prompt);
  if (!sv.ok) return { ok: false, reason: `sentence_${sv.error}` };
  for (const w of otherWords) {
    if (normalize(w) !== normalize(base) && countWord(raw.sentence, w) > 0) {
      return { ok: false, reason: 'leaks_other_word' };
    }
  }
  if (raw.onlyAnswerFits === false) return { ok: false, reason: 'model_doubt' };

  const wrong = Array.isArray(raw.wrong)
    ? raw.wrong.map((w) =>
        String(w ?? '')
          .replace(/\s+/g, ' ')
          .trim()
      )
    : [];
  const script = scriptOf(form);
  const picked = [];
  for (const w of wrong) {
    if (picked.length === 3) break;
    if (!w || w.length > 40) continue;
    if (sameAnswer(w, form) || sameAnswer(w, base)) continue;
    if (related(w, base) || related(w, form)) continue;
    if (script && scriptOf(w) && scriptOf(w) !== script) continue;
    if (countWord(raw.sentence, w) > 0) continue;
    if (picked.some((p) => normalize(p) === normalize(w))) continue;
    picked.push(w);
  }
  if (picked.length < 3) return { ok: false, reason: 'few_options' };
  return { ok: true, prompt: sv.sentence, answer: form, options: [form, ...picked] };
}

export function buildPrompt(items, lang, otherWords) {
  const lines = items
    .map((it, i) => `${i + 1}. word: "${it.baseForm}" — meaning: "${it.meaning}"`)
    .join('\n');
  return `You write fill-in-the-blank questions for a school vocabulary exam. Language of the sentences: ${lang}.
For EACH numbered word return ONE JSON object:
- "sentence": ONE natural, everyday sentence in ${lang}, 7–14 words, simple vocabulary (A2–B1). Use the word EXACTLY ONCE, in the grammatical form the sentence needs (you may change the ending: plural, past tense, -ing, 3rd person, etc.). The context must make this word, with this meaning, the only sensible choice. Do not put a synonym, translation or definition of the word into the sentence. Do not use any of these exam words: ${otherWords.slice(0, 80).join(', ')}.
- "form": the word exactly as it appears in your sentence, character for character.
- "wrong": 3 real ${lang} words of the SAME part of speech and in the SAME grammatical form/ending as "form", that clearly do NOT fit this sentence by meaning. NEVER a synonym or near-synonym, never another form of the same word, never a word already in the sentence.
- "onlyAnswerFits": true only if NONE of the 3 wrong words could correctly fill the blank; otherwise false.

Return EXACTLY ${items.length} objects in the same order. Reply ONLY with a JSON array:
[{"n": 1, "sentence": "...", "form": "...", "wrong": ["...", "...", "..."], "onlyAnswerFits": true}]

Words:
${lines}`;
}

async function askModel(items, lang, otherWords) {
  const text = await generateJson({
    models: MODELS.text,
    prompt: buildPrompt(items, lang, otherWords),
    temperature: 0.4,
    maxOutputTokens: 8192,
  });
  const answers = parseJsonArray(text);
  return Array.isArray(answers) ? answers : [];
}

/** Не получилось — «письменный ответ» по той же карточке: перевод → слово (как в коде сборки) */
async function toWrite(sql, it) {
  const extra = { ...(it.extra || {}), ai: 'fallback' };
  delete extra.baseForm;
  await sql`
    UPDATE test_items SET format = 'write', direction = 'back', prompt = ${it.back}, answer = ${it.front},
      options = NULL, extra = ${JSON.stringify(extra)}::jsonb
    WHERE id = ${it.id}::uuid
  `;
}

async function saveGap(sql, it, r) {
  const extra = { ...(it.extra || {}), ai: 'done', baseForm: it.baseForm };
  await sql`
    UPDATE test_items SET prompt = ${r.prompt}, answer = ${r.answer},
      options = ${JSON.stringify(r.options)}::jsonb, extra = ${JSON.stringify(extra)}::jsonb
    WHERE id = ${it.id}::uuid
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const { sessionId } = req.body || {};
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const sql = neon(process.env.POSTGRES_URL);
  const sessions = await sql`
    SELECT id, status FROM test_sessions
    WHERE id = ${sessionId}::uuid AND teacher_id = ${userId}::uuid AND engine = 2
  `;
  if (sessions.length === 0) return res.status(403).json({ error: 'Not authorized' });
  if (!['draft', 'waiting'].includes(sessions[0].status)) {
    return res.status(409).json({ error: 'Test already started' });
  }

  const rows = await sql`
    SELECT ti.id, ti.extra, c.front, c.back, cs.language_from
    FROM test_items ti
    JOIN cards c ON c.id = ti.card_id
    LEFT JOIN card_sets cs ON cs.id = c.set_id
    WHERE ti.session_id = ${sessionId}::uuid AND ti.format = 'gap' AND ti.extra->>'ai' = 'pending'
    ORDER BY ti.sort_key
  `;
  const pending = rows.map((r) => ({
    id: r.id,
    extra: r.extra || {},
    front: r.front,
    back: r.back,
    baseForm: (r.extra && r.extra.baseForm) || String(r.front).trim(),
    meaning: r.back,
    lang: r.language_from,
  }));
  if (pending.length === 0) return res.status(200).json({ written: 0, fallback: 0, pending: 0 });

  // Без ИИ: учитель отказался ждать или ИИ недоступен
  if (req.body.fallback === true) {
    for (const it of pending) await toWrite(sql, it);
    return res.status(200).json({ written: 0, fallback: pending.length, pending: 0 });
  }

  const quota = await consume(sql, userId).catch((e) => {
    log.error('exam-gap', 'usage check failed', e?.message || e);
    return null;
  });
  if (!quota) return res.status(500).json({ error: 'Failed to check usage' });
  if (!quota.ok) return res.status(429).json({ error: 'hourly_limit', resetAt: quota.resetAt });

  const words = await sql`
    SELECT c.front FROM test_items ti JOIN cards c ON c.id = ti.card_id
    WHERE ti.session_id = ${sessionId}::uuid
  `;
  const otherWords = words.map((w) => String(w.front).trim()).filter(Boolean);
  const lang = languageName(pending[0].lang, 'the language of the words (detect it)');

  const started = Date.now();
  let written = 0;
  let left = pending;
  try {
    for (let round = 0; round < 2 && left.length > 0; round++) {
      if (round > 0 && Date.now() - started > RETRY_BUDGET_MS) break;
      const answers = await askModel(left, lang, otherWords);
      const failed = [];
      for (const [i, it] of left.entries()) {
        const raw = answers.find((a) => Number(a?.n) === i + 1) || answers[i];
        const r = judgeGap(it, raw, otherWords);
        if (r.ok) {
          await saveGap(sql, it, r);
          written++;
        } else {
          failed.push(it);
        }
      }
      left = failed;
    }
  } catch (error) {
    // ИИ не ответил: то, что уже записали, остаётся; остальное ждёт повтора или «без ИИ»
    if (written > 0) return res.status(200).json({ written, fallback: 0, pending: left.length });
    return sendAiError(res, error, 'Failed to write gap questions');
  }
  for (const it of left) await toWrite(sql, it);
  return res.status(200).json({ written, fallback: left.length, pending: 0 });
}
