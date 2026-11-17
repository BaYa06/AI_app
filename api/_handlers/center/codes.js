/**
 * Правила кодов и логинов учебного центра (plan/new/center_books.md, Center 8–10) — чистые функции,
 * их используют локальная админка (центры) и кабинет центра (api/center.js, выпуск кодов).
 *
 * Код центра: НАЧАЛО-МЕТКА-ХВОСТ, например ALFA-DEC-7KX. Начало — 3–8 латинских букв и цифр
 * (центр выбирает сам), метка — месяц или своё слово, хвост — случайный, всегда. Весь код не
 * длиннее 14 символов: для длинного начала метка укорачивается, при нехватке места — пропадает.
 */
import { randomInt } from 'node:crypto';

export const CODE_MAX = 14;
export const PREFIX_MIN = 3;
export const PREFIX_MAX = 8;
/** Хвост без похожих символов (0/O, 1/I/L) — код диктуют голосом и переписывают с доски. */
const TAIL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TAIL_MIN = 3;
const TAIL_MAX = 4;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Почта аккаунта центра в Supabase: её никто не видит, центр входит по логину. */
export const CENTER_EMAIL_DOMAIN = 'center.flashlycards.app';
const LOGIN_RE = /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/;

/** Кириллица → латиница для подсказки начала кода и логина. */
const TRANSLIT = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ә: 'a',
  ғ: 'g',
  қ: 'k',
  ң: 'n',
  ө: 'o',
  ұ: 'u',
  ү: 'u',
  һ: 'h',
  і: 'i',
};
/** Слова, которые в названии есть почти у всех: начало кода из них не строим. */
const FILLER = new Set([
  'english',
  'center',
  'centre',
  'school',
  'language',
  'languages',
  'academy',
  'international',
  'club',
  'studio',
  'courses',
  'course',
  'the',
  'of',
  'and',
  'shkola',
  'centr',
  'yazykov',
  'yazyka',
  'kursy',
  'mezhdunarodnaya',
  'akademiya',
  'uchebnyy',
  'obrazovatelnyy',
  'lingvisticheskiy',
  'i',
  'po',
  'angliyskogo',
  'angliyskiy',
  'nemeckogo',
  'yazyk',
  'kids',
  'detskiy',
]);

function latin(text) {
  return String(text || '')
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
}

function words(text) {
  return latin(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Начало кода из названия: первое «настоящее» слово (не «школа», «центр», «english»), до 8 знаков.
 * «Alfa English Center» → ALFA, «Международная школа языков Lingua» → LINGUA. Пусто — null.
 */
export function suggestPrefix(name) {
  const all = words(name);
  const meaningful = all.filter((w) => !FILLER.has(w));
  const pick = meaningful[0] || all[0] || '';
  const prefix = pick.toUpperCase().slice(0, PREFIX_MAX);
  if (prefix.length >= PREFIX_MIN) return prefix;
  // Короткое слово («IQ») — добираем первыми буквами следующих слов: IQ Language School → IQL
  const extra = [...new Set([...meaningful, ...all])]
    .filter((w) => w !== pick)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const joined = (prefix + extra).slice(0, PREFIX_MIN);
  return joined.length >= PREFIX_MIN ? joined : null;
}

/** Логин аккаунта центра из названия: «Alfa English Center» → alfa. */
export function suggestLogin(name) {
  const prefix = suggestPrefix(name);
  return prefix ? prefix.toLowerCase() : null;
}

export function normalizePrefix(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidPrefix(value) {
  return typeof value === 'string' && /^[A-Z0-9]{3,8}$/.test(value);
}

export function normalizeLogin(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function isValidLogin(value) {
  return typeof value === 'string' && LOGIN_RE.test(value);
}

export function centerEmail(login) {
  return `${login}@${CENTER_EMAIL_DOMAIN}`;
}

/** Метка по умолчанию — месяц начала доступа: DEC. */
export function monthLabel(date = new Date()) {
  return MONTHS[date.getUTCMonth()];
}

export function normalizeLabel(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function randomTail(length) {
  let tail = '';
  for (let i = 0; i < length; i++) tail += TAIL_ALPHABET[randomInt(TAIL_ALPHABET.length)];
  return tail;
}

/**
 * Новый код: ALFA-DEC-7KX. Хвост 3–4 знака всегда; если с меткой не влезает в 14 — метка
 * укорачивается, совсем не влезает — код без метки (LINGUAEN-7KXM).
 */
export function makeCenterCode(prefix, label = '') {
  const p = normalizePrefix(prefix);
  if (!isValidPrefix(p)) throw new Error('bad_prefix');
  let l = normalizeLabel(label);
  // ALFA- + метка + - + хвост
  const room = CODE_MAX - p.length - 1 - TAIL_MIN;
  if (l && room - 1 < 1) l = '';
  else if (l) l = l.slice(0, room - 1);
  const head = l ? `${p}-${l}-` : `${p}-`;
  const tailLength = Math.min(TAIL_MAX, CODE_MAX - head.length);
  return head + randomTail(tailLength);
}

/** Временный пароль центра: 12 знаков без похожих символов. Центр меняет его при первом входе. */
export function makeTempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[randomInt(alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}
