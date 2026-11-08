/**
 * Создаёт templates/library_template.xlsx — шаблон каталога библиотеки (все предметы в одном файле).
 *
 *   npx tsx scripts/create-library-template.ts
 *
 * Формат: plan/new/library_catalog.md, «Формат Excel». Примеры в шаблоне проходят проверку импорта.
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { styleHeader } from './lib/excel';
import {
  CARD_COLUMNS,
  CARDS_SHEET,
  CEFR_LEVELS,
  MIN_CARDS,
  MIN_SETS_TO_PUBLISH,
  SET_COLUMNS,
  SETS_SHEET,
  STAGE_LEVELS,
  SUBJECT_COLUMNS,
  SUBJECTS_SHEET,
  TRACK_COLUMNS,
  TRACKS_SHEET,
} from './lib/libraryExcel';

const OUT = path.resolve(process.cwd(), 'templates', 'library_template.xlsx');
/** Строк с выпадающими списками на листе «Наборы». */
const VALIDATED_ROWS = 1000;

/** Совпадает с начальными строками миграции 040 (database/migrations/040_library_catalog.sql). */
const SUBJECTS = [
  ['languages', 'Языки', 'Английский, немецкий, турецкий', 'globe', 'Язык', 'cefr', 'language', 1],
  ['history', 'История', 'Кыргызстан и мир', 'landmark', 'Раздел', 'stages', 'subject', 2],
  ['geography', 'География', 'Столицы, флаги, природа', 'map-pin', '', '', 'subject', 3],
  ['ort', 'ОРТ и НЦТ', 'Подготовка к тестам', 'clipboard-check', 'Раздел', '', 'subject', 4],
  ['science', 'Наука', 'Физика и химия', 'flask-conical', '', '', 'subject', 5],
];
const TRACKS = [
  ['history', 'kg', 'Кыргызстан', 1],
  ['history', 'world', 'Всемирная', 2],
  ['ort', 'math', 'Математика', 1],
  ['ort', 'analogies', 'Аналогии', 2],
  ['ort', 'reading', 'Чтение', 3],
  ['ort', 'grammar', 'Грамматика', 4],
];

function listValidation(
  sheet: ExcelJS.Worksheet,
  col: number,
  formula: string,
  title: string,
  error: string
) {
  for (let r = 2; r <= VALIDATED_ROWS; r++) {
    sheet.getCell(r, col).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: title,
      error,
    };
  }
}

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const help = workbook.addWorksheet('Инструкция');

  // ── Предметы ──
  const subjects = workbook.addWorksheet(SUBJECTS_SHEET);
  const subjectWidths: Record<(typeof SUBJECT_COLUMNS)[number], number> = {
    slug: 14,
    title: 16,
    subtitle: 32,
    icon: 16,
    track_label: 13,
    level_scale: 13,
    set_kind: 12,
    position: 10,
  };
  subjects.columns = SUBJECT_COLUMNS.map((key) => ({
    header: key,
    key,
    width: subjectWidths[key],
  }));
  for (const row of SUBJECTS) subjects.addRow(row);
  styleHeader(subjects);

  // ── Разделы ──
  const tracks = workbook.addWorksheet(TRACKS_SHEET);
  const trackWidths: Record<(typeof TRACK_COLUMNS)[number], number> = {
    subject: 14,
    key: 14,
    title: 20,
    position: 10,
  };
  tracks.columns = TRACK_COLUMNS.map((key) => ({ header: key, key, width: trackWidths[key] }));
  for (const row of TRACKS) tracks.addRow(row);
  styleHeader(tracks);

  // ── Наборы ──
  const sets = workbook.addWorksheet(SETS_SHEET);
  const setWidths: Record<(typeof SET_COLUMNS)[number], number> = {
    subject: 13,
    track: 10,
    level: 10,
    collection: 26,
    position: 10,
    title: 28,
    language_from: 14,
    language_to: 13,
    description: 40,
  };
  sets.columns = SET_COLUMNS.map((key) => ({ header: key, key, width: setWidths[key] }));
  const exampleSets = [
    [
      'languages',
      'en',
      'A2',
      'Путешествия',
      1,
      'Аэропорт',
      'en',
      'ru',
      'Регистрация, посадка, багаж',
    ],
    ['languages', 'en', 'A2', 'Путешествия', 2, 'Отель', 'en', 'ru', 'Бронирование и заселение'],
    ['languages', 'en', 'A2', 'Путешествия', 3, 'Транспорт', 'en', 'ru', 'Метро, автобус, такси'],
    ['geography', '', '', 'Столицы Азии', 1, 'Центральная Азия', 'ru', 'ru', 'Страна → столица'],
  ];
  for (const row of exampleSets) sets.addRow(row);
  styleHeader(sets);
  listValidation(
    sets,
    sets.getColumn('subject').number,
    `'${SUBJECTS_SHEET}'!$A$2:$A$100`,
    'Предмет',
    `Выберите slug с листа «${SUBJECTS_SHEET}»`
  );
  listValidation(
    sets,
    sets.getColumn('level').number,
    `"${[...CEFR_LEVELS, ...STAGE_LEVELS.map(([k]) => k)].join(',')}"`,
    'Уровень',
    'A1–C2 для языков, basic / advanced для истории, пусто — если у предмета нет уровней'
  );

  // ── Карточки ──
  const cards = workbook.addWorksheet(CARDS_SHEET);
  const cardWidths: Record<(typeof CARD_COLUMNS)[number], number> = {
    set: 24,
    term: 24,
    translation: 28,
    example: 44,
  };
  cards.columns = CARD_COLUMNS.map((key) => ({ header: key, key, width: cardWidths[key] }));
  const exampleCards: [string, string, string, string][] = [
    ['Аэропорт', 'boarding pass', 'посадочный талон', 'Show your boarding pass at the gate.'],
    ['Аэропорт', 'luggage', 'багаж', 'My luggage is lost.'],
    ['Аэропорт', 'departure', 'вылет', 'Departure is at 9:40.'],
    ['Аэропорт', 'delay', 'задержка', 'There is a two-hour delay.'],
    ['Аэропорт', 'gate', 'выход на посадку', 'Go to gate 12.'],
    ['Отель', 'reservation', 'бронь', 'I have a reservation for two nights.'],
    ['Отель', 'single room', 'одноместный номер', 'A single room, please.'],
    ['Отель', 'key card', 'ключ-карта', 'Here is your key card.'],
    ['Отель', 'breakfast included', 'завтрак включён', 'Is breakfast included?'],
    ['Отель', 'check out', 'выселиться', 'We check out at noon.'],
    ['Транспорт', 'ticket', 'билет', 'A single ticket, please.'],
    ['Транспорт', 'bus stop', 'остановка', 'The bus stop is over there.'],
    ['Транспорт', 'subway', 'метро', 'Take the subway to the centre.'],
    ['Транспорт', 'taxi rank', 'стоянка такси', 'Where is the taxi rank?'],
    ['Транспорт', 'timetable', 'расписание', 'Check the timetable first.'],
    ['Центральная Азия', 'Кыргызстан', 'Бишкек', ''],
    ['Центральная Азия', 'Казахстан', 'Астана', ''],
    ['Центральная Азия', 'Узбекистан', 'Ташкент', ''],
    ['Центральная Азия', 'Таджикистан', 'Душанбе', ''],
    ['Центральная Азия', 'Туркменистан', 'Ашхабад', ''],
  ];
  for (const row of exampleCards) cards.addRow(row);
  styleHeader(cards);
  listValidation(
    cards,
    cards.getColumn('set').number,
    `'${SETS_SHEET}'!$F$2:$F$${VALIDATED_ROWS}`,
    'Набор',
    `Выберите title набора с листа «${SETS_SHEET}»`
  );

  // ── Инструкция ──
  help.getColumn(1).width = 120;
  const lines = [
    'Каталог библиотеки Flashly: один файл на все предметы. Названия листов и заголовки колонок не меняйте.',
    '',
    'Иерархия: L1 предмет (subject) → L2 язык или раздел (track) → L3 уровень (level) → L4 подборка (collection) → L5 набор (title) → карточки.',
    'L2 и L3 есть не у всех предметов: если у предмета их нет, ячейки оставьте пустыми.',
    '',
    `Лист «${SUBJECTS_SHEET}» — настройки предметов. Нужен, только чтобы завести предмет или поменять его. Строки этого листа перезаписывают предмет в базе.`,
    '  track_label — как называется ряд L2 («Язык», «Раздел»); пусто — ряда нет.',
    '  level_scale — cefr (A1–C2), stages (basic / advanced) или пусто — уровней нет.',
    '  set_kind — language (слова с переводом, все режимы) или subject (вопрос → ответ, без языковых режимов и озвучки).',
    `Лист «${TRACKS_SHEET}» — разделы неязыковых предметов (история, ОРТ). Для языков не нужен: track = код языка.`,
    '',
    `Лист «${SETS_SHEET}» — одна строка на набор:`,
    '  subject — slug предмета (выпадающий список).',
    '  track — у языков код языка, равный language_from (en, de, tr); у разделов key с листа «Разделы»; иначе пусто.',
    '  level — A1–C2 у языков, basic / advanced у истории, пусто у географии и ОРТ.',
    '  collection — название подборки, одинаковое у всех её наборов. «Путешествия» на A2 и на B1 — разные подборки.',
    '  position — номер набора в подборке: 1, 2, 3… без пропусков, от простого к сложному.',
    '  title — название набора, уникальное во всём файле (по нему карточки находят набор).',
    '  language_from, language_to — коды языков. У предметов без перевода одинаковые: ru и ru.',
    '  description — по желанию.',
    '  Порядок подборок на экране предмета — порядок, в котором они впервые встречаются в файле.',
    '',
    `Лист «${CARDS_SHEET}» — одна строка на карточку: set (title набора), term, translation, example (по желанию).`,
    `  Порядок строк = порядок карточек. В наборе не меньше ${MIN_CARDS} карточек.`,
    '',
    'Важно:',
    `  • Подборка меньше ${MIN_SETS_TO_PUBLISH} наборов остаётся черновиком и в библиотеке не видна.`,
    '  • При повторном импорте карточки набора заменяются целиком. У учеников, которые уже добавили набор, остаётся их копия.',
    '  • Набор, который убрали из подборки в файле, отвязывается от неё и в каталоге не виден.',
    '  • Переименование набора (title) или смена языков создаёт новый набор.',
    '  • Не объединяйте ячейки и не используйте формулы.',
    '',
    'Проверка:    npx tsx scripts/import-library.ts файл.xlsx --dry-run',
    'Черновик:    npx tsx scripts/import-library.ts файл.xlsx',
    'Публикация:  npx tsx scripts/import-library.ts файл.xlsx --publish',
    'База берётся из .env.local — перед запуском убедитесь, что это staging.',
  ];
  for (const line of lines) help.addRow([line]);
  help.getRow(1).font = { bold: true };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await workbook.xlsx.writeFile(OUT);
  console.log(`✅ Шаблон создан: ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error: unknown) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
