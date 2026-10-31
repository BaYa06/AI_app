/**
 * Ссылки из виджета на экране блокировки (plan/new/widgets.md, шаг 0.3)
 * @description flashly://lesson?from=widget&state=…&family=… — главная запускает урок дня;
 *   flashly://set/<setId>?from=widget&… — набор слова.
 *   Остальные flashly:// (вход, приглашения) разбирает App.tsx, а не React Navigation.
 */

export type WidgetLinkTarget = 'lesson' | 'set';

export interface WidgetLink {
  target: WidgetLinkTarget;
  /** Состояние виджета в момент нажатия (урок ждёт, закрепление…) */
  state: string;
  /** accessoryRectangular / accessoryInline / accessoryCircular */
  family: string;
}

const WIDGET_URL_RE = /^flashly:\/\/(lesson|set\/[^/?#]+)\/?(\?.*)?$/;

/** Ссылка из виджета — только её пропускаем в React Navigation */
export function isWidgetUrl(url: string): boolean {
  return WIDGET_URL_RE.test(url);
}

/** Рейтинг курса из пуша (plan/new/push_notifications.md, 0.5): flashly://rating/<courseId>?from=push */
const RATING_URL_RE = /^flashly:\/\/rating\/[^/?#]+\/?(\?.*)?$/;

/** Ответ команды из пуша (plan/new/support_threads.md): flashly://support/<id>?from=push */
const SUPPORT_URL_RE = /^flashly:\/\/support\/[^/?#]+\/?(\?.*)?$/;

/** Что пропускаем в React Navigation: ссылки виджета и ссылки из пушей (урок — та же flashly://lesson) */
export function isNavigationUrl(url: string): boolean {
  return isWidgetUrl(url) || RATING_URL_RE.test(url) || SUPPORT_URL_RE.test(url);
}

export function parseWidgetUrl(url: string): WidgetLink | null {
  const match = url.match(WIDGET_URL_RE);
  if (!match) return null;
  const query = new Map<string, string>();
  for (const pair of (match[2] || '').replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    try {
      query.set(key, decodeURIComponent(value));
    } catch {
      query.set(key, value);
    }
  }
  if (query.get('from') !== 'widget') return null;
  return {
    target: match[1] === 'lesson' ? 'lesson' : 'set',
    state: query.get('state') || 'unknown',
    family: query.get('family') || 'unknown',
  };
}
