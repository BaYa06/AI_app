/**
 * Логгер сервера — вместо console.* (plan/new/code_cleanup.md, Clean 3c). Файл с `_` —
 * Vercel не публикует его как эндпоинт.
 *
 *   log.debug('push', 'decide', ctx)       — не в продакшне (VERCEL_ENV !== 'production')
 *   log.info('import-files', 'files=3 …')  — всегда (статистика, ход cron)
 *   log.warn('gemini', 'model busy')       — всегда
 *   log.error('data', 'news failed', e)    — всегда; у Error — стек
 *
 * Строка в логах Vercel: `[tag] message …details`. Тег — модуль, по нему фильтруем логи.
 */

const isProduction = process.env.VERCEL_ENV === 'production';

const line = (tag, message) => `[${tag}] ${message}`;

/** Error → стек (Vercel иначе показывает `{}` для некоторых ошибок), остальное как есть. */
const detail = (value) => (value instanceof Error ? value.stack || value.message : value);

export const log = {
  debug(tag, message, ...details) {
    if (!isProduction) console.log(line(tag, message), ...details);
  },
  info(tag, message, ...details) {
    console.log(line(tag, message), ...details);
  },
  warn(tag, message, ...details) {
    console.warn(line(tag, message), ...details.map(detail));
  },
  error(tag, message, ...details) {
    console.error(line(tag, message), ...details.map(detail));
  },
};
