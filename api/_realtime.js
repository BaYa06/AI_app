/**
 * Сигнал «курс изменился» ученикам через Supabase Realtime (broadcast).
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 *
 * Приложение ученика слушает каналы `course:<courseId>` своих курсов и по сигналу тихо
 * подтягивает изменения (DatabaseService.syncStudentCourses). В сигнале нет данных курса —
 * только «обновись»: данные ученик получает обычным запросом, где сервер проверяет членство.
 *
 * REST-эндпоинт вместо websocket-подписки (как в api/test.js): один HTTP-запрос, без ожидания
 * SUBSCRIBED. Ошибка сигнала никогда не ломает сам запрос учителя — ученик всё равно получит
 * изменения при возврате в приложение.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const NOTIFY_TIMEOUT_MS = 2_000;

export const COURSE_CHANGED_EVENT = 'course_changed';

export async function notifyCoursesChanged(courseIds) {
  const ids = [...new Set((courseIds || []).filter(Boolean).map(String))];
  if (ids.length === 0 || !SUPABASE_KEY) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  try {
    const resp = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        messages: ids.map((id) => ({
          topic: `course:${id}`,
          event: COURSE_CHANGED_EVENT,
          payload: { at: Date.now() },
        })),
      }),
      signal: controller.signal,
    });
    if (!resp.ok) console.warn('[realtime] course broadcast failed:', resp.status);
  } catch (error) {
    console.warn('[realtime] course broadcast error:', error?.message || error);
  } finally {
    clearTimeout(timer);
  }
}
