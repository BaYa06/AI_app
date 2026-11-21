/**
 * Коды учебного центра и курса в одном поле (plan/new/center_books.md, Center 5).
 *
 * Код курса — 6 латинских букв и цифр (K7M2QX). Код центра — с дефисом: начало центра, месяц и
 * случайный хвост (ALFA-DEC-7K), не длиннее 14 символов. Дефис их и отличает.
 */

export const COURSE_CODE_LENGTH = 6;
export const CENTER_CODE_MAX = 14;

/** Как ввели → как храним: заглавные, только A–Z, 0–9 и дефис, не длиннее 14. */
export function normalizeJoinCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, CENTER_CODE_MAX);
}

export function isCenterCode(code: string): boolean {
  return /^[A-Z0-9]+-[A-Z0-9-]*[A-Z0-9]$/.test(code) && code.length >= 5;
}

export function isCourseCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/** Ссылка /join/<код центра> (https://… или flashly://) → код или null. Токен курса (64 hex) — null. */
export function parseCenterJoin(url: string): string | null {
  const m = url.match(/\/join\/([A-Za-z0-9]+-[A-Za-z0-9-]+)(?:[/?#]|$)/);
  if (!m) return null;
  const code = normalizeJoinCode(m[1]);
  return isCenterCode(code) ? code : null;
}

/**
 * Ссылка для учителей центра (Center 13): https://flashlycards.app/t/<код> или flashly://t/<код>
 * или путь /t/<код> (веб) → код ссылки (16 знаков A–Z, a–z, 0–9, _ и -) или null. Регистр важен.
 */
export function parseTeacherInvite(url: string): string | null {
  const m = url.match(/(?:^|flashlycards\.app|flashly:\/)\/t\/([A-Za-z0-9_-]{8,32})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/** Можно искать: полный код курса или код центра. */
export function isJoinCodeReady(code: string): boolean {
  return isCourseCode(code) || isCenterCode(code);
}

export type CenterCodeReason =
  | 'ok'
  | 'already_active'
  | 'not_found'
  | 'expired'
  | 'full'
  | 'contract_ended'
  | 'rate_limited'
  | 'network'
  | 'unknown';

/** Текст под полем кода — на «ты», как во всём приложении. */
export function describeCenterReason(reason: CenterCodeReason): string {
  switch (reason) {
    case 'not_found':
      return 'Такого кода нет. Проверь буквы и цифры.';
    case 'expired':
      return 'Срок этого кода закончился. Возьми новый у менеджера курса.';
    case 'full':
      return 'Места по этому коду закончились. Возьми новый у менеджера курса.';
    case 'contract_ended':
      return 'Доступ центра к Flashly сейчас закрыт. Спроси у менеджера курса.';
    case 'rate_limited':
      return 'Слишком много попыток. Подожди несколько минут и попробуй снова.';
    case 'network':
      return 'Нет соединения с сервером. Проверь интернет и попробуй снова.';
    default:
      return 'Что-то пошло не так. Попробуй ещё раз.';
  }
}

/** «15 февраля» — дата конца доступа. */
export function formatAccessDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** Сколько полных дней доступа осталось (не меньше 0). */
export function daysLeft(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((t - now) / 86_400_000));
}
