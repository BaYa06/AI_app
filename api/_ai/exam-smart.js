import { neon } from '@neondatabase/serverless';
import { getAuthedUserId } from '../_auth.js';
import { log } from '../_log.js';
import { MODELS, generateJson, parseJsonArray, sendAiError } from './gemini.js';
import { blankSentence, suspicion, validateDistractors, validateSentence } from '../_exam/edit.js';
import { scriptOf } from '../_exam/prepare.js';

/**
 * «Умные варианты» экзамена (plan/new/web_cabinet.md, Web 16): ИИ готовит ЧЕРНОВИК улучшений.
 * Ничего не записывает в экзамен — только отвечает предложениями; принимает их учитель
 * (кнопка «Применить» → exam-edit-item), баллы считает код.
 *
 * POST /api/ai?fn=exam-smart   Authorization: Bearer <токен учителя>
 * Body: { sessionId, kinds?: ('gap' | 'choice')[] }
 *   gap    — новое предложение для «вставь слово» + неверные варианты той же формы;
 *   choice — неверные варианты «по смыслу» (того же вида слов, но не синонимы).
 * Ответ: { suggestions: [{ itemId, kind, before: { prompt, options }, after: { prompt, options },
 *                          doubtful, reasons: [{ code, text }] }], skipped: [{ itemId, reason }],
 *          usage: { used, limit, resetAt } }
 *
 * Права: только учитель этого экзамена, пока он не начался. Лимит — запросов в час на учителя
 * (api_rate_limits, action 'ai-exam-smart') → 429 { error: 'hourly_limit', limit, resetAt }.
 * Проверки кодом (edit.js): ровно один пропуск, ответ не торчит в предложении, варианты не равны
 * ответу и друг другу, подозрение на «второй верный ответ» — помечаем, а не скрываем.
 */

export const HOURLY_LIMIT = Number(process.env.AI_EXAM_HOURLY_LIMIT) || 10;
const ACTION = 'ai-exam-smart';
const MAX_ITEMS = 50;
/** Длинные ответы (определения) вариантами «по смыслу» не заменяем — ИИ их не отличит от верного */
const MAX_CHOICE_ANSWER_LEN = 40;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** Списывает один запрос; при исчерпанном лимите — { ok: false } */
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
    ON CONFLICT (user_id, action, window_start) DO UPDATE SET
      attempts = api_rate_limits.attempts + 1
    WHERE api_rate_limits.attempts < ${HOURLY_LIMIT}
    RETURNING attempts
  `;
  if (rows.length === 0)
    return { ok: false, usage: { used: HOURLY_LIMIT, limit: HOURLY_LIMIT, resetAt } };
  const used = rows[0].attempts;
  return {
    ok: true,
    usage: { used, limit: HOURLY_LIMIT, resetAt },
    refund: async () => {
      try {
        await sql`
          UPDATE api_rate_limits SET attempts = GREATEST(attempts - 1, 0)
          WHERE user_id = ${userId}::uuid AND action = ${ACTION}
            AND window_start = ${windowStart}::timestamptz
        `;
      } catch (error) {
        log.error('exam-smart', 'refund failed', error?.message || error);
      }
    },
  };
}

/** Какие вопросы отдаём ИИ: тип → список, остальные — в skipped с причиной */
export function pickItems(items, kinds) {
  const chosen = [];
  const skipped = [];
  for (const it of items) {
    if (it.format !== 'gap' && it.format !== 'choice') continue;
    if (!kinds.includes(it.format)) continue;
    if (!Array.isArray(it.options) || it.options.length < 4) {
      skipped.push({ itemId: it.id, reason: 'no_options' });
    } else if (it.format === 'choice' && String(it.answer).length > MAX_CHOICE_ANSWER_LEN) {
      skipped.push({ itemId: it.id, reason: 'long_answer' });
    } else {
      chosen.push(it);
    }
  }
  return { chosen: chosen.slice(0, MAX_ITEMS), skipped };
}

function buildPrompt(chosen, langHint) {
  const lines = chosen
    .map((it, i) =>
      it.format === 'gap'
        ? `${i + 1}. GAP | word: "${it.extra?.baseForm || it.answer}" | form to use: "${it.answer}" | current: "${it.prompt}"`
        : `${i + 1}. CHOICE | shown: "${it.prompt}" | correct: "${it.answer}" | current wrong: ${JSON.stringify(it.options.slice(1))}`
    )
    .join('\n');
  return `You prepare questions for a school vocabulary exam. A teacher will review every line you write; you only draft.
${langHint}
For each numbered line return ONE JSON object.

GAP lines (fill-in-the-blank): write a NEW natural sentence of 6–14 words that contains the exact "form to use" (character for character, once). The sentence must make that word clearly the only good fit, but must not contain a synonym, a translation or a definition of it. Simple everyday words around it. Then give 3 wrong options: real words of the SAME grammatical form as "form to use" (same ending: -s, -ed, -ing, or base) and the same part of speech that look plausible but DO NOT fit this sentence. Never give a synonym or a near-synonym of the correct word, and never another form of the same word.
CHOICE lines: give 3 wrong options for the "shown" item: same language and part of speech as "correct", similar length and level, plausible, but clearly different in meaning. Never a synonym, never a word with nearly the same meaning, never a form of the same word.
For every line also answer "alsoFits": a short string naming any wrong option that could ALSO be correct, or "" if none.

Return EXACTLY ${chosen.length} items in the same order. Reply ONLY with a JSON array:
[{"n": 1, "sentence": "<GAP only: full sentence>", "wrong": ["", "", ""], "alsoFits": ""}]

Lines:
${lines}`;
}

/** Склеить ответ ИИ с вопросом и прогнать через проверки кодом */
export function judge(item, raw) {
  if (!raw || typeof raw !== 'object') return { skip: 'bad_answer' };
  const wrong = Array.isArray(raw.wrong) ? raw.wrong.map((w) => String(w ?? '').trim()) : [];
  const expected = item.options.length - 1;
  const distractors = wrong.slice(0, expected);
  // Другая письменность, чем у ответа (русский вариант к английскому слову) — не подходит
  const answerScript = scriptOf(item.answer);
  if (answerScript && distractors.some((d) => scriptOf(d) && scriptOf(d) !== answerScript)) {
    return { skip: 'wrong_language' };
  }
  const dv = validateDistractors(item, distractors);
  if (!dv.ok) return { skip: `distractors_${dv.error}` };

  let prompt = item.prompt;
  if (item.format === 'gap') {
    const blanked = blankSentence(raw.sentence, item.answer);
    if (!blanked) return { skip: 'no_word_in_sentence' };
    const sv = validateSentence(item, blanked);
    if (!sv.ok) return { skip: `sentence_${sv.error}` };
    prompt = sv.sentence;
  }
  const flag = typeof raw.alsoFits === 'string' ? raw.alsoFits.trim() : '';
  const reasons = suspicion(item, {
    distractors,
    sentence: item.format === 'gap' ? prompt : null,
    modelFlags: flag ? [`ИИ отметил: «${flag}» тоже может подойти`] : [],
  });
  return {
    suggestion: {
      itemId: item.id,
      kind: item.format,
      before: { prompt: item.prompt, options: item.options.slice(1) },
      after: { prompt, options: distractors },
      doubtful: reasons.length > 0,
      reasons,
    },
  };
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
  const kinds = (Array.isArray(req.body?.kinds) ? req.body.kinds : ['gap', 'choice']).filter((k) =>
    ['gap', 'choice'].includes(k)
  );
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId) || kinds.length === 0) {
    return res.status(400).json({ error: 'sessionId and kinds are required' });
  }

  const sql = neon(process.env.POSTGRES_URL);
  const sessions = await sql`
    SELECT id, status, config FROM test_sessions
    WHERE id = ${sessionId}::uuid AND teacher_id = ${userId}::uuid AND engine = 2
  `;
  if (sessions.length === 0) return res.status(403).json({ error: 'Not authorized' });
  if (!['draft', 'waiting'].includes(sessions[0].status)) {
    return res.status(409).json({ error: 'Test already started' });
  }

  const rows = await sql`
    SELECT id, format, prompt, answer, options, extra
    FROM test_items WHERE session_id = ${sessionId}::uuid ORDER BY sort_key
  `;
  const { chosen, skipped } = pickItems(
    rows.map((r) => ({ ...r, extra: r.extra || {} })),
    kinds
  );
  if (chosen.length === 0) {
    return res.status(200).json({ suggestions: [], skipped, usage: null });
  }

  let quota;
  try {
    quota = await consume(sql, userId);
  } catch (error) {
    log.error('exam-smart', 'usage check failed', error?.message || error);
    return res.status(500).json({ error: 'Failed to check usage' });
  }
  if (!quota.ok) {
    return res
      .status(429)
      .json({ error: 'hourly_limit', limit: quota.usage.limit, resetAt: quota.usage.resetAt });
  }

  try {
    const langHint =
      sessions[0].config?.backKind === 'definition'
        ? 'The answers are English words; the definitions are in English.'
        : 'Keep the language of each "correct" value for the wrong options.';
    const text = await generateJson({
      models: MODELS.text,
      prompt: buildPrompt(chosen, langHint),
      temperature: 0.6,
      maxOutputTokens: 8192,
    });
    const answers = parseJsonArray(text);
    if (!Array.isArray(answers) || answers.length === 0) {
      await quota.refund();
      return res.status(502).json({ error: 'ai_empty' });
    }

    const suggestions = [];
    chosen.forEach((item, i) => {
      const raw = answers.find((a) => Number(a?.n) === i + 1) || answers[i];
      const r = judge(item, raw);
      if (r.suggestion) suggestions.push(r.suggestion);
      else skipped.push({ itemId: item.id, reason: r.skip });
    });
    if (suggestions.length === 0) await quota.refund();
    return res.status(200).json({ suggestions, skipped, usage: quota.usage });
  } catch (error) {
    await quota.refund();
    return sendAiError(res, error, 'Failed to prepare smart options');
  }
}
