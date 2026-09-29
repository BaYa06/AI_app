#!/usr/bin/env node
/**
 * Автопроверка брендбука (plan/brandbook.md, plan/brandbook_migration.md шаг 1.1).
 *
 * Считает по каждому файлу в src/ нарушения брендбука:
 *   Основной счёт (колонка «Всего»):
 *     hex      — цвета '#…' в коде
 *     rgba     — rgb()/rgba()/hsl() в коде
 *     isDark   — ручные проверки темы `isDark ? …`
 *     font     — fontSize вне шкалы 12/14/16/18/20/24/32/40
 *     weight   — fontWeight кроме 400/600/700
 *     radius   — скругления вне 8/12/16/24/full
 *     alpha    — прозрачность-суффикс вне '1A'/'33'/'66' (color + '15')
 *     alert    — системный Alert без выбора и не опасный (успех/инфо)
 *   Отдельно (в «Всего» не входят):
 *     small    — текст меньше 12 px
 *     emoji    — эмодзи в интерфейсе (флаги языков не считаются)
 *     ion      — импорт Ionicons вне AppNavigator (панель вкладок)
 *     a11y     — кнопка из одной иконки без accessibilityLabel
 *     en       — английские строки в интерфейсе
 *
 * Использование:
 *   npm run brand:check                    — таблица по всем файлам
 *   npm run brand:check -- src/screens/X   — только файлы по пути
 *   npm run brand:check -- --details       — с номерами строк нарушений
 *   npm run brand:check -- --update-baseline  — сохранить снимок
 *   npm run brand:check -- --fail-on-new   — код 1, если где-то стало больше, чем в снимке
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(ROOT, 'scripts', 'brand-baseline.json');

// Файлы, где «сырые» значения разрешены: сами токены.
const IGNORED = new Set([
  'src/constants/colors.ts',
  'src/constants/typography.ts',
  'src/constants/spacing.ts',
]);
const TAB_BAR_FILE = 'src/navigation/AppNavigator.tsx';
// Файлы интерфейса — в них ищем английские строки
const UI_FILE = /^src\/(screens|components|navigation)\/|^src\/App\.tsx$/;

const MAIN = ['hex', 'rgba', 'isDark', 'font', 'weight', 'radius', 'alpha', 'alert'];
const EXTRA = ['small', 'emoji', 'ion', 'a11y', 'en'];
const ALL = [...MAIN, ...EXTRA];

const FONT_SCALE = new Set([12, 14, 16, 18, 20, 24, 32, 40]);
const RADIUS_SCALE = new Set([0, 8, 12, 16, 24]);
const ALPHA_STEPS = new Set(['1A', '33', '66']);
const ALLOWED_WEIGHTS = new Set(['400', '600', '700', 'normal', 'bold']);

// ---------------------------------------------------------------- args
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const filters = args.filter((a) => !a.startsWith('--')).map((p) => p.replace(/\/$/, ''));
const showDetails = flags.has('--details');

// ---------------------------------------------------------------- files
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'assets') continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec|d)\.[jt]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------- helpers
/** Заменяет комментарии пробелами (сохраняя переводы строк), строки не трогает. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2; out += '  ';
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      i += 2; out += '  ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i++;
  }
  return out;
}

function blankConsoleCalls(src) {
  const re = /\bconsole\.(?:log|warn|error|info|debug)\s*\(/g;
  let out = src;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const body = callBody(src, open);
    out = out.slice(0, open) + body.replace(/[^\n]/g, ' ') + out.slice(open + body.length);
  }
  return out;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

/** Текст вызова от открывающей скобки до парной закрывающей. */
function callBody(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const ICON_TAG_RE = /<([A-Z][A-Za-z0-9]*)\b/g;
const PRESSABLE_RE = /<(TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Pressable|AnimatedPressable)\b/g;

// ---------------------------------------------------------------- checks
function check(rel, raw) {
  const src = stripComments(raw);
  const hits = Object.fromEntries(ALL.map((k) => [k, []]));
  const add = (key, idx, note) => hits[key].push({ line: lineOf(src, idx), note });
  let m;

  // Цвета '#…'
  const hexRe = /(['"`])#([0-9a-fA-F]{3,8})\1/g;
  while ((m = hexRe.exec(src))) if ([3, 4, 6, 8].includes(m[2].length)) add('hex', m.index, m[0]);

  // rgb/rgba/hsl
  const rgbaRe = /\b(rgba?|hsla?)\(/g;
  while ((m = rgbaRe.exec(src))) add('rgba', m.index, m[1]);

  // isDark ?
  const darkRe = /\bisDark\s*\?(?![?.])/g;
  while ((m = darkRe.exec(src))) add('isDark', m.index, 'isDark ?');

  // fontSize
  const fontRe = /\bfontSize\s*:\s*(\d+(?:\.\d+)?)\b/g;
  while ((m = fontRe.exec(src))) {
    const size = Number(m[1]);
    if (!FONT_SCALE.has(size)) add('font', m.index, `fontSize ${size}`);
    if (size < 12) add('small', m.index, `fontSize ${size}`);
  }

  // fontWeight
  // Только литералы: '500', "bold", 800. Ссылки на токены (typography.body.fontWeight) — не нарушение
  const weightRe = /\bfontWeight\s*:\s*(?:(['"])([0-9a-z]+)\1|(\d+)\b)/g;
  while ((m = weightRe.exec(src))) {
    const weight = m[2] ?? m[3];
    if (!ALLOWED_WEIGHTS.has(weight)) add('weight', m.index, `fontWeight ${weight}`);
  }

  // borderRadius и borderTopLeftRadius и т.п.
  const radiusRe = /\bborder(?:Top|Bottom)?(?:Left|Right|Start|End)?Radius\s*:\s*(\d+(?:\.\d+)?)\b/g;
  while ((m = radiusRe.exec(src))) {
    const r = Number(m[1]);
    if (!RADIUS_SCALE.has(r) && r < 999) add('radius', m.index, `radius ${r}`);
  }

  // Прозрачность-суффикс: color + '15'
  const alphaRe = /\+\s*(['"`])([0-9A-Fa-f]{2})\1/g;
  while ((m = alphaRe.exec(src))) if (!ALPHA_STEPS.has(m[2].toUpperCase())) add('alpha', m.index, `+ '${m[2]}'`);
  const alphaTplRe = /\}([0-9A-Fa-f]{2})`/g; // `${color}15`
  while ((m = alphaTplRe.exec(src))) if (!ALPHA_STEPS.has(m[1].toUpperCase())) add('alpha', m.index, `\${…}${m[1]}`);

  // Alert без выбора и не опасный
  const alertRe = /\bAlert\.alert\s*\(/g;
  while ((m = alertRe.exec(src))) {
    const body = callBody(src, m.index + m[0].length - 1);
    const destructive = /style\s*:\s*['"]destructive['"]/.test(body);
    const buttons = (body.match(/\btext\s*:/g) || []).length;
    if (!destructive && buttons < 2) add('alert', m.index, 'Alert без выбора');
  }

  // Эмодзи и английский — только то, что видит пользователь (без console.*)
  const visible = blankConsoleCalls(src);

  // Эмодзи (флаги — региональные индикаторы — не Extended_Pictographic и не считаются)
  const emojiRe = new RegExp(EMOJI_RE.source + '[\\uFE0F\\u200D\\p{Extended_Pictographic}]*', 'gu');
  while ((m = emojiRe.exec(visible))) {
    if (/^[©®™]$/.test(m[0])) continue;
    add('emoji', m.index, m[0]);
  }

  // Ionicons вне панели вкладок
  if (rel !== TAB_BAR_FILE) {
    const ionRe = /from\s+['"]react-native-vector-icons\/Ionicons['"]/g;
    while ((m = ionRe.exec(src))) add('ion', m.index, 'Ionicons');
  }

  // Кнопка из одной иконки без accessibilityLabel
  while ((m = PRESSABLE_RE.exec(src))) {
    const tag = m[1];
    const openEnd = findTagEnd(src, m.index);
    if (openEnd < 0) continue;
    const openTag = src.slice(m.index, openEnd + 1);
    if (openTag.endsWith('/>')) continue;
    if (/accessibilityLabel|aria-label/.test(openTag)) continue;
    const close = src.indexOf(`</${tag}>`, openEnd);
    if (close < 0) continue;
    const inner = src.slice(openEnd + 1, close);
    if (/<Text\b|<ActivityIndicator\b|<TextInput\b|<Image\b/.test(inner)) continue;
    // Видимый текст или {label} / {'…'} — у кнопки есть подпись
    const noTags = inner.replace(/<[A-Za-z/][^<>]*?>/g, '');
    if (/\S/.test(noTags.replace(/\{[^{}]*\}/g, ''))) continue;
    if (/\{\s*(['"`][^'"`]*['"`]|[\w.?]+)\s*\}/.test(noTags)) continue;
    const tags = [...inner.matchAll(ICON_TAG_RE)].map((t) => t[1]).filter((t) => t !== 'View');
    if (tags.length >= 1 && tags.length <= 2) add('a11y', m.index, `${tag} с иконкой ${tags[0]}`);
  }

  // Английские строки: текст в JSX и строки в заметных пропсах
  if (UI_FILE.test(rel)) {
    const jsxTextRe = />\s*([A-Za-z][A-Za-z' ,.!?:-]*[A-Za-z.!?])\s*</g;
    while ((m = jsxTextRe.exec(visible))) if (isEnglishPhrase(m[1])) add('en', m.index, m[1]);
    const propRe = /\b(title|placeholder|label|subtitle|message|description|buttonText|accessibilityLabel)\s*[:=]\s*\{?\s*(['"])([^'"\n]+)\2/g;
    while ((m = propRe.exec(visible))) if (isEnglishPhrase(m[3])) add('en', m.index, m[3]);
  }

  return hits;
}

function findTagEnd(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && src[i - 1] !== '=') return i;
  }
  return -1;
}

const EN_ALLOW = new Set(['Flashly', 'OK', 'ID', 'QR', 'IT', 'Apple', 'Google', 'Telegram', 'Email', 'PIN', 'AI', 'PDF', 'CSV', 'URL', 'PRO', 'Pro', 'Premium', 'Anki', 'Quizlet']);
function isEnglishPhrase(s) {
  const text = s.trim();
  if (text.length < 3 || /[А-Яа-яЁё]/.test(text)) return false;
  if (/\w\.\w/.test(text)) return false; // a.b — обращение к полю, не текст
  const words = text.split(/[\s,.!?:-]+/).filter(Boolean);
  if (words.every((w) => EN_ALLOW.has(w))) return false;
  // одно слово в camelCase / без гласных — скорее код, чем текст
  if (words.length === 1 && (/[a-z][A-Z]/.test(text) || text.length < 4 || /^[a-z]/.test(text))) return false;
  return /[aeiouy]/i.test(text);
}

// ---------------------------------------------------------------- run
const files = walk(SRC)
  .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
  .filter((rel) => !IGNORED.has(rel))
  .filter((rel) => filters.length === 0 || filters.some((p) => rel.startsWith(p) || rel.startsWith(`src/${p}`)))
  .sort();

const report = {};
for (const rel of files) {
  const hits = check(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const counts = Object.fromEntries(ALL.map((k) => [k, hits[k].length]));
  counts.total = MAIN.reduce((s, k) => s + counts[k], 0);
  if (ALL.some((k) => counts[k] > 0)) report[rel] = { counts, hits };
}

const rows = Object.entries(report).sort((a, b) => b[1].counts.total - a[1].counts.total || a[0].localeCompare(b[0]));
const totals = Object.fromEntries([...ALL, 'total'].map((k) => [k, rows.reduce((s, [, r]) => s + r.counts[k], 0)]));

function pad(s, n, right = false) {
  s = String(s);
  return right ? s.padStart(n) : s.padEnd(n);
}
const cols = ['total', ...MAIN, ...EXTRA];
const head = { total: 'Всего' };
const width = Math.min(60, Math.max(20, ...rows.map(([f]) => f.length - 4)));

if (!flags.has('--quiet')) {
  console.log(pad('Файл', width) + cols.map((c) => pad(head[c] || c, 7, true)).join(''));
  console.log('-'.repeat(width + cols.length * 7));
  for (const [file, r] of rows) {
    console.log(pad(file.replace(/^src\//, '').slice(0, width), width) + cols.map((c) => pad(r.counts[c] || '·', 7, true)).join(''));
    if (showDetails) {
      for (const k of ALL) for (const h of r.hits[k]) console.log(`    ${pad(k, 7)} :${h.line}  ${h.note}`);
    }
  }
  console.log('-'.repeat(width + cols.length * 7));
  console.log(pad(`Итого (${rows.length} файлов)`, width) + cols.map((c) => pad(totals[c], 7, true)).join(''));
  const ionFiles = rows.filter(([, r]) => r.counts.ion > 0).length;
  const mainFiles = rows.filter(([, r]) => r.counts.total > 0).length;
  console.log(`\nНарушений: ${totals.total} в ${mainFiles} файлах · текст < 12 px: ${totals.small} · эмодзи: ${totals.emoji} · Ionicons вне панели вкладок: ${ionFiles} файлов · иконки-кнопки без подписи: ${totals.a11y} · английских строк: ${totals.en}`);
}

// ---------------------------------------------------------------- baseline
const snapshot = {
  totals,
  files: Object.fromEntries(rows.map(([f, r]) => [f, Object.fromEntries(Object.entries(r.counts).filter(([, v]) => v > 0))])),
};

if (flags.has('--update-baseline')) {
  if (filters.length) {
    console.error('\n--update-baseline работает только без фильтра по пути.');
    process.exit(2);
  }
  fs.writeFileSync(BASELINE, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`\nСнимок сохранён: ${path.relative(ROOT, BASELINE)}`);
}

if (flags.has('--fail-on-new')) {
  if (!fs.existsSync(BASELINE)) {
    console.error('\nНет снимка scripts/brand-baseline.json — запусти с --update-baseline.');
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files;
  const worse = [];
  for (const [file, counts] of Object.entries(snapshot.files)) {
    for (const k of [...ALL, 'total']) {
      const before = base[file]?.[k] ?? 0;
      if ((counts[k] ?? 0) > before) worse.push(`${file}: ${k} ${before} → ${counts[k]}`);
    }
  }
  if (worse.length) {
    console.error('\n✗ Новые нарушения брендбука (больше, чем в снимке):');
    for (const w of worse) console.error('  ' + w);
    console.error('\nИсправь их или, если нарушения стало меньше в другом месте, обнови снимок: npm run brand:check -- --update-baseline');
    process.exit(1);
  }
  console.log('\n✓ Новых нарушений нет.');
}
