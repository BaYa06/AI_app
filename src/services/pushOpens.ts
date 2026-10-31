/**
 * Тап по push-уведомлению (plan/new/push_notifications.md, шаг 0.5)
 * @description Отмечает открытие (GA4 + push_log на сервере), запоминает пуш до конца сессии,
 *   чтобы урок, начатый после него, связался с ним (push → урок), и отдаёт ссылку для перехода.
 *   Платформенную часть (откуда берётся тап) дают pushNotifications(.native).ts.
 */
import { API_BASE } from '@/config/apiBase';
import { Analytics } from './analytics';
import { markLaunchInterrupted } from './modalGate';
import { supabase } from './supabaseClient';

/** Урок засчитывается пушу, если начат в течение 6 часов после тапа (главная метрика плана) */
const PUSH_LESSON_WINDOW_MS = 6 * 60 * 60 * 1000;

export type PushLessonStage = 'opened' | 'lesson_started' | 'lesson_completed';

interface PushOrigin {
  pushId: string;
  type: string;
  openedAt: number;
}

let origin: PushOrigin | null = null;
const handledPushIds = new Set<string>();

async function reportToServer(pushId: string, stage: PushLessonStage): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    await fetch(`${API_BASE}/push?action=opened`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ push_id: pushId, stage }),
    });
  } catch (error) {
    console.warn('[Push] opened report failed:', error);
  }
}

/**
 * Пользователь открыл приложение тапом по пушу. Возвращает ссылку, куда перейти (data.link),
 * или null. Повторный вызов для того же пуша (повторный getInitialNotification) ничего не делает.
 */
export function handlePushOpen(data: Record<string, string> | undefined | null): string | null {
  if (!data) return null;
  const pushId = data.push_id;
  const type = data.type || 'unknown';
  if (pushId) {
    if (handledPushIds.has(pushId)) return null;
    handledPushIds.add(pushId);
    origin = { pushId, type, openedAt: Date.now() };
    reportToServer(pushId, 'opened');
  }
  Analytics.pushNotificationOpened({ type, pushId });
  // Пришёл по пушу за конкретным делом — «Что нового» в этот раз не показываем
  markLaunchInterrupted();
  return typeof data.link === 'string' && data.link ? data.link : null;
}

/** Пуш, которому засчитывается урок, — если тап был не раньше 6 часов назад */
export function currentPushOrigin(): { pushId: string; type: string } | null {
  if (!origin) return null;
  if (Date.now() - origin.openedAt > PUSH_LESSON_WINDOW_MS) {
    origin = null;
    return null;
  }
  return { pushId: origin.pushId, type: origin.type };
}

/** Урок начат или пройден после пуша: отметка в push_log. Завершение закрывает связь с пушем. */
export function reportPushLesson(stage: 'lesson_started' | 'lesson_completed'): void {
  const current = currentPushOrigin();
  if (!current) return;
  reportToServer(current.pushId, stage);
  if (stage === 'lesson_completed') origin = null;
}
