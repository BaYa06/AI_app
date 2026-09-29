/**
 * Текст ошибки для пользователя — всегда по-русски (брендбук, раздел 9).
 *
 * Supabase, наш API (api/*.js) и сеть отвечают по-английски: «Invalid login credentials»,
 * «Not the owner», «Network request failed». Показывать это как есть нельзя.
 * Известные ошибки переводим по смыслу, русский текст (наш же) пропускаем как есть,
 * остальное — заменяем понятным `fallback` по ситуации.
 */

const KNOWN: Array<[RegExp, string]> = [
  // Сеть
  [/network request failed|failed to fetch|network error|load failed|aborted|timeout|timed out/i,
    'Нет соединения. Проверь интернет и попробуй ещё раз.'],
  // Вход (Supabase Auth)
  [/invalid login credentials/i, 'Неверная почта или код. Проверь и попробуй ещё раз.'],
  [/token has expired or is invalid|otp.*(expired|invalid)|invalid.*otp/i, 'Код неверный или устарел. Запроси новый.'],
  [/email not confirmed/i, 'Почта не подтверждена. Открой письмо и перейди по ссылке.'],
  [/(email|over_email_send).*rate limit|rate limit.*email/i, 'Слишком много писем. Подожди немного и попробуй снова.'],
  [/for security purposes.*after (\d+) seconds/i, 'Слишком часто. Подожди минуту и попробуй снова.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'Проверь адрес почты.'],
  [/user already registered/i, 'Такой пользователь уже есть. Попробуй войти.'],
  [/signups? not allowed|signup is disabled/i, 'Регистрация сейчас недоступна.'],
  [/user (was )?not found/i, 'Пользователь не найден.'],
  [/code verifier|flow state|invalid (grant|flow)|pkce/i, 'Не удалось завершить вход. Попробуй ещё раз.'],
  [/popup_closed|cancel(l)?ed|user cancel/i, 'Вход отменён.'],
  // Наш API
  [/too many attempts|too many requests|rate limit/i, 'Слишком много попыток. Подожди минуту и попробуй снова.'],
  [/not authenticated|unauthorized|missing or invalid token|jwt/i, 'Нужно войти в аккаунт.'],
  [/not the owner|not owner|access denied|forbidden|not authorized/i, 'Недостаточно прав для этого действия.'],
  [/not a member of this course/i, 'Ты не состоишь в этом курсе.'],
  [/cannot join your own course/i, 'Нельзя присоединиться к своему же курсу.'],
  [/invite (not found|expired)/i, 'Приглашение не найдено или больше не действует.'],
  [/already (published|imported|exists)/i, 'Это уже сделано раньше.'],
  [/not found/i, 'Не найдено — возможно, его уже удалили.'],
  [/internal server error|server error|http 5\d\d|error 5\d\d/i, 'Ошибка на сервере. Попробуй чуть позже.'],
];

function rawMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const e = error as { message?: unknown; error?: unknown; error_description?: unknown };
    for (const value of [e.message, e.error_description, e.error]) {
      if (typeof value === 'string') return value;
    }
  }
  return '';
}

/** Сообщение для пользователя: русское — как есть, известное английское — по смыслу, иначе `fallback`. */
export function describeError(error: unknown, fallback: string): string {
  const message = rawMessage(error).trim();
  if (!message) return fallback;
  if (/[А-Яа-яЁё]/.test(message)) return message;
  const known = KNOWN.find(([pattern]) => pattern.test(message));
  return known ? known[1] : fallback;
}
