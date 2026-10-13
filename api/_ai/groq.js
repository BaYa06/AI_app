/**
 * Groq — резерв для ТЕКСТОВЫХ задач, когда все модели Gemini перегружены (plan/ai_import.md).
 * Фото и PDF Groq не принимает — для них резерва нет.
 * OpenAI-совместимый API, ключ GROQ_API_KEY; без ключа резерв просто выключен.
 * Модели по порядку, env GROQ_MODELS — список через запятую.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const GROQ_MODELS = (process.env.GROQ_MODELS || 'openai/gpt-oss-120b,llama-3.3-70b-versatile,openai/gpt-oss-20b')
  .split(',').map(m => m.trim()).filter(Boolean);

export function isGroqEnabled() {
  return Boolean(process.env.GROQ_API_KEY) && GROQ_MODELS.length > 0;
}

/**
 * Один запрос к модели Groq. Ошибка несёт status (429 и т.п.) — как у Gemini,
 * чтобы общая логика повторов и ответов работала одинаково.
 */
export async function groqGenerate({ model, prompt, temperature, maxOutputTokens, timeoutMs }) {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Reply with valid JSON only — no markdown, no comments.' },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_completion_tokens: maxOutputTokens,
      // gpt-oss — рассуждающая модель; для наших задач долгие рассуждения не нужны
      ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw Object.assign(new Error(`Groq ${response.status}: ${body.slice(0, 300)}`), { status: response.status });
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
