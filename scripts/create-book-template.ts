/**
 * Создаёт templates/book_template.xlsx — шаблон для заполнения книги каталога.
 *
 *   npx tsx scripts/create-book-template.ts
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { BOOK_COLUMNS, BOOK_SHEET, CARD_COLUMNS, CARDS_SHEET } from './lib/bookExcel';

const OUT = path.resolve(process.cwd(), 'templates', 'book_template.xlsx');

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF9' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  const book = workbook.addWorksheet(BOOK_SHEET);
  book.columns = BOOK_COLUMNS.map((key) => ({ header: key, key, width: key === 'title' ? 36 : 16 }));
  book.addRow({
    title: 'Solutions Pre-Intermediate', edition: '3rd', level: 'A2', subject: 'English',
    language_from: 'en', language_to: 'ru', publisher: 'Oxford',
  });
  styleHeader(book);

  const cards = workbook.addWorksheet(CARDS_SHEET);
  const widths: Record<(typeof CARD_COLUMNS)[number], number> = {
    unit: 8, unit_title: 22, pages: 10, term: 24, translation: 28, example: 44,
  };
  cards.columns = CARD_COLUMNS.map((key) => ({ header: key, key, width: widths[key] }));
  // Текстовый формат, чтобы Excel не превращал «8-17» в дату.
  cards.getColumn('pages').numFmt = '@';
  const rows = [
    { unit: 1, unit_title: 'Feelings', pages: '8–17', term: 'happy', translation: 'счастливый', example: "I'm happy to see you." },
    { unit: 1, unit_title: 'Feelings', pages: '8–17', term: 'angry', translation: 'злой, сердитый', example: 'Why are you angry?' },
    { unit: 1, unit_title: 'Feelings', pages: '8–17', term: 'be afraid of', translation: 'бояться', example: 'She is afraid of dogs.' },
    { unit: 2, unit_title: 'Adventure', pages: '18–27', term: 'climb', translation: 'взбираться, лезть', example: '' },
  ];
  for (const row of rows) cards.addRow(row);
  styleHeader(cards);

  const help = workbook.addWorksheet('Инструкция');
  help.getColumn(1).width = 110;
  const lines = [
    'Один файл = одна книга. Листы «Книга» и «Карточки» не переименовывайте, заголовки колонок не меняйте.',
    '',
    'Лист «Книга» — одна строка:',
    '  title, language_from (язык изучения: en, de…), language_to (язык перевода: ru, ky) — обязательны.',
    '  edition, level, subject, publisher — по желанию.',
    '',
    'Лист «Карточки» — одна строка на слово:',
    '  unit — номер юнита числом (0, 1, 2…). unit_title и pages повторяйте в каждой строке юнита одинаково.',
    '  term и translation обязательны, example — по желанию.',
    '  Порядок строк = порядок карточек в приложении.',
    '  Несколько значений перевода — в одной ячейке через запятую: «злой, сердитый».',
    '',
    'Важно:',
    '  • Не объединяйте ячейки, не используйте формулы.',
    '  • Страницы пишите через длинное тире (8–17) или держите колонку pages текстовой — иначе Excel сделает из них дату.',
    '  • translation и example можно исправлять когда угодно — прогресс учеников сохранится.',
    '  • Исправление term после публикации создаёт новую карточку: прогресс по старой не перейдёт.',
    '  • Примеры предложений лучше писать свои, а не копировать из учебника.',
    '',
    'Проверка:    npx tsx scripts/import-book.ts файл.xlsx --dry-run',
    'Импорт:      npx tsx scripts/import-book.ts файл.xlsx',
    'Публикация:  npx tsx scripts/publish-book.ts "Название" "Издание"',
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
