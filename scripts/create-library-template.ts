/**
 * Создаёт templates/library_template.xlsx — шаблон для наборов библиотеки.
 *
 *   npx tsx scripts/create-library-template.ts
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { LIBRARY_CATEGORIES } from '../src/constants/library';
import { styleHeader } from './lib/excel';
import { CARD_COLUMNS, CARDS_SHEET, MIN_CARDS, SET_COLUMNS, SETS_SHEET } from './lib/libraryExcel';

const OUT = path.resolve(process.cwd(), 'templates', 'library_template.xlsx');
const CATEGORIES_SHEET = 'Категории';
/** Строк с выпадающим списком категорий на листе «Наборы». */
const VALIDATED_ROWS = 500;

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  const sets = workbook.addWorksheet(SETS_SHEET);
  const setWidths: Record<(typeof SET_COLUMNS)[number], number> = {
    title: 36, category: 14, language_from: 14, language_to: 14, description: 44, tags: 24, cover_emoji: 12,
  };
  sets.columns = SET_COLUMNS.map((key) => ({ header: key, key, width: setWidths[key] }));
  sets.addRow({
    title: 'Travel: at the airport', category: 'travel', language_from: 'en', language_to: 'ru',
    description: 'Слова, которые пригодятся в аэропорту', tags: 'путешествия, A2', cover_emoji: '✈️',
  });
  sets.addRow({
    title: 'Столицы Центральной Азии', category: 'geography', language_from: 'ru', language_to: 'ru',
    description: 'Страна → столица', tags: 'ОРТ', cover_emoji: '🗺️',
  });
  styleHeader(sets);

  const categories = workbook.addWorksheet(CATEGORIES_SHEET);
  categories.columns = [
    { header: 'category', key: 'key', width: 16 },
    { header: 'В приложении', key: 'label', width: 24 },
  ];
  for (const c of LIBRARY_CATEGORIES) categories.addRow({ key: c.key, label: c.label });
  styleHeader(categories);

  // Выпадающий список категорий — ссылкой на лист «Категории».
  const categoryCol = sets.getColumn('category').number;
  const listRef = `'${CATEGORIES_SHEET}'!$A$2:$A$${LIBRARY_CATEGORIES.length + 1}`;
  for (let r = 2; r <= VALIDATED_ROWS; r++) {
    sets.getCell(r, categoryCol).dataValidation = {
      type: 'list', allowBlank: true, formulae: [listRef],
      showErrorMessage: true, errorTitle: 'Категория', error: `Выберите категорию с листа «${CATEGORIES_SHEET}»`,
    };
  }

  const cards = workbook.addWorksheet(CARDS_SHEET);
  const cardWidths: Record<(typeof CARD_COLUMNS)[number], number> = { set: 30, term: 24, translation: 28, example: 44 };
  cards.columns = CARD_COLUMNS.map((key) => ({ header: key, key, width: cardWidths[key] }));
  const travel = 'Travel: at the airport';
  const capitals = 'Столицы Центральной Азии';
  const rows = [
    { set: travel, term: 'boarding pass', translation: 'посадочный талон', example: 'Please show your boarding pass.' },
    { set: travel, term: 'gate', translation: 'выход на посадку', example: 'Our flight leaves from gate 12.' },
    { set: travel, term: 'luggage', translation: 'багаж', example: '' },
    { set: travel, term: 'delay', translation: 'задержка', example: 'There is a two-hour delay.' },
    { set: travel, term: 'check in', translation: 'зарегистрироваться', example: 'We need to check in online.' },
    { set: capitals, term: 'Кыргызстан', translation: 'Бишкек', example: '' },
    { set: capitals, term: 'Казахстан', translation: 'Астана', example: '' },
    { set: capitals, term: 'Узбекистан', translation: 'Ташкент', example: '' },
    { set: capitals, term: 'Таджикистан', translation: 'Душанбе', example: '' },
    { set: capitals, term: 'Туркменистан', translation: 'Ашхабад', example: '' },
  ];
  for (const row of rows) cards.addRow(row);
  styleHeader(cards);

  const help = workbook.addWorksheet('Инструкция');
  help.getColumn(1).width = 110;
  const lines = [
    'Один файл = сколько угодно наборов. Листы «Наборы» и «Карточки» не переименовывайте, заголовки колонок не меняйте.',
    '',
    'Лист «Наборы» — одна строка на набор:',
    '  title — название (до 100 символов), уникальное в файле. По нему и языкам набор находится при повторном импорте.',
    `  category — из списка (лист «${CATEGORIES_SHEET}»).`,
    '  language_from, language_to — коды языков: en, ru, ky… Для предметов без перевода (история, ОРТ) — одинаковые: ru и ru.',
    '  description, tags (через запятую), cover_emoji (один эмодзи) — по желанию.',
    '',
    'Лист «Карточки» — одна строка на карточку:',
    '  set — title набора с листа «Наборы».',
    '  term (лицевая сторона) и translation (обратная) обязательны, example — по желанию.',
    `  Порядок строк = порядок карточек. В наборе не меньше ${MIN_CARDS} карточек.`,
    '',
    'Важно:',
    '  • Не объединяйте ячейки, не используйте формулы.',
    '  • Исправлять можно что угодно: при повторном импорте карточки набора заменяются целиком.',
    '    У пользователей, которые уже взяли набор, остаётся их копия.',
    '  • Переименование набора (title) или смена языков создаёт новый набор, старый остаётся в библиотеке.',
    '',
    'Проверка:    npx tsx scripts/import-library.ts файл.xlsx --dry-run',
    'Черновик:    npx tsx scripts/import-library.ts файл.xlsx',
    'Публикация:  npx tsx scripts/import-library.ts файл.xlsx --publish',
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
