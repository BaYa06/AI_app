/**
 * Логгер приложения — вместо console.* (plan/new/code_cleanup.md, Clean 3).
 *
 *   log.debug('Push', 'token', token)     — только в разработке
 *   log.info('Sync', 'back online')       — только в разработке
 *   log.warn('Widget', 'write failed', e) — разработка: консоль; релиз: строка в журнал Crashlytics
 *   log.error('Data', 'load failed', e)   — консоль + некритичная ошибка в Crashlytics
 *
 * Зачем: в релизе babel вырезает console.log/warn (babel.config.cjs, transform-remove-console),
 * а console.error никто не видит. Теперь ошибки доходят до Crashlytics.
 *
 * В Crashlytics уходят только тег, текст сообщения и сама ошибка — объекты из `details`
 * (наборы, токены, ответы сервера) не отправляются. Одна и та же ошибка (тег + сообщение)
 * отправляется не чаще раза за запуск: обрыв сети не должен засыпать отчёты.
 */
import { crashLog, reportError } from '@/services/crashReporting';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

const reported = new Set<string>();

function errorText(value: unknown): string | null {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return null;
}

/** Текст для Crashlytics: тег, сообщение и текст первой ошибки из details (без объектов). */
function summary(tag: string, message: string, details: unknown[]): string {
  const cause = details.map(errorText).find((t) => t !== null);
  return cause ? `[${tag}] ${message}: ${cause}` : `[${tag}] ${message}`;
}

function debug(tag: string, message: string, ...details: unknown[]) {
  if (isDev) console.log(`[${tag}] ${message}`, ...details);
}

function warn(tag: string, message: string, ...details: unknown[]) {
  if (isDev) console.warn(`[${tag}] ${message}`, ...details);
  else crashLog(summary(tag, message, details));
}

function error(tag: string, message: string, ...details: unknown[]) {
  console.error(`[${tag}] ${message}`, ...details);
  if (isDev) return;

  const text = summary(tag, message, details);
  if (reported.has(text)) return;
  reported.add(text);

  const cause = details.find((d): d is Error => d instanceof Error);
  // Своя ошибка — со своим стеком (Crashlytics группирует по нему); иначе — новая с текстом
  const err = cause ?? new Error(text);
  reportError(err, tag);
}

export const log = { debug, info: debug, warn, error };

/** Только для тестов: сбросить «уже отправлено». */
export function __resetLoggerForTests() {
  reported.clear();
}
