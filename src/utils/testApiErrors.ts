/**
 * Русские сообщения для ошибок живых тестов (api/test.js отвечает по-английски).
 * Экраны тестов показывали пользователю текст ошибки как есть: «Not authenticated»,
 * «Test not found or already finished». Здесь — перевод известных ошибок по смыслу,
 * для остальных — понятное сообщение по ситуации (fallback).
 */

const KNOWN: Array<[RegExp, string]> = [
  [/not authenticated|unauthorized/i, 'Нужно войти в аккаунт.'],
  [/too many attempts/i, 'Слишком много попыток. Подожди минуту и попробуй снова.'],
  [/test not found or already finished/i, 'Тест с таким кодом не найден или уже закончился. Проверь код.'],
  [/not a member of this course/i, 'Ты не состоишь в курсе этого теста. Попроси у учителя код курса.'],
  [/no cards in this set/i, 'В наборе нет карточек — тест не из чего собрать.'],
  [/not course owner/i, 'Создавать тест может только учитель этого курса.'],
  [/test already started/i, 'Тест уже начался.'],
  [/test not active/i, 'Тест сейчас не идёт.'],
  [/session not found/i, 'Тест не найден.'],
  [/network request failed|failed to fetch|aborted/i, 'Нет соединения. Проверь интернет и попробуй снова.'],
];

/** Сообщение для пользователя: известная ошибка — по смыслу, иначе `fallback` */
export function describeTestError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const known = KNOWN.find(([pattern]) => pattern.test(message));
  return known ? known[1] : fallback;
}
