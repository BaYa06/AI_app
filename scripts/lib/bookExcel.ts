/**
 * Формат Excel-файла книги (один файл = одна книга) и его разбор с валидацией.
 * Используется import-book.ts (чтение) и create-book-template.ts (заголовки).
 */

import ExcelJS from 'exceljs';

export const BOOK_SHEET = 'Книга';
export const CARDS_SHEET = 'Карточки';

export const BOOK_COLUMNS = ['title', 'edition', 'level', 'subject', 'language_from', 'language_to', 'publisher'] as const;
export const CARD_COLUMNS = ['unit', 'unit_title', 'pages', 'term', 'translation', 'example'] as const;

type BookColumn = (typeof BOOK_COLUMNS)[number];
type CardColumn = (typeof CARD_COLUMNS)[number];

const REQUIRED_BOOK_COLUMNS: BookColumn[] = ['title', 'language_from', 'language_to'];
const REQUIRED_CARD_COLUMNS: CardColumn[] = ['unit', 'unit_title', 'term', 'translation'];

export interface ParsedBook {
  title: string;
  edition: string;
  level: string | null;
  subject: string | null;
  languageFrom: string;
  languageTo: string;
  publisher: string | null;
}

export interface ParsedCard {
  term: string;
  translation: string;
  example: string | null;
  /** Номер строки в Excel — для сообщений. */
  row: number;
}

export interface ParsedUnit {
  number: number;
  title: string;
  pages: string | null;
  cards: ParsedCard[];
}

export interface ParseResult {
  book: ParsedBook | null;
  units: ParsedUnit[];
  errors: string[];
  warnings: string[];
}

/** Ключ сопоставления карточек: регистр и лишние пробелы не важны. Тот же ключ применяется к карточкам в БД. */
export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

/** Приводит значение ячейки ExcelJS к строке. Date возвращается отдельно, чтобы поймать «страницы, ставшие датой». */
function cellText(cell: ExcelJS.Cell): { text: string; isDate: boolean } {
  const v = cell.value;
  if (v === null || v === undefined) return { text: '', isDate: false };
  if (v instanceof Date) return { text: v.toISOString().slice(0, 10), isDate: true };
  if (typeof v === 'string') return { text: v.trim(), isDate: false };
  if (typeof v === 'number' || typeof v === 'boolean') return { text: String(v).trim(), isDate: false };
  if (typeof v === 'object') {
    if ('richText' in v) return { text: v.richText.map((part) => part.text).join('').trim(), isDate: false };
    if ('text' in v && typeof v.text === 'string') return { text: v.text.trim(), isDate: false };
    if ('result' in v) {
      const r = v.result;
      if (r instanceof Date) return { text: r.toISOString().slice(0, 10), isDate: true };
      if (r === null || r === undefined || typeof r === 'object') return { text: '', isDate: false };
      return { text: String(r).trim(), isDate: false };
    }
  }
  return { text: String(v).trim(), isDate: false };
}

function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const target = normalizeHeader(name);
  return workbook.worksheets.find((ws) => normalizeHeader(ws.name) === target);
}

/** Возвращает номер колонки для каждого известного заголовка из первой строки листа. */
function readHeaders<T extends string>(
  sheet: ExcelJS.Worksheet,
  known: readonly T[],
  required: T[],
  errors: string[],
): Map<T, number> | null {
  const map = new Map<T, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = normalizeHeader(cellText(cell).text);
    const match = known.find((k) => k === header);
    if (match && !map.has(match)) map.set(match, col);
  });
  const missing = required.filter((c) => !map.has(c));
  if (missing.length > 0) {
    errors.push(`Лист «${sheet.name}»: нет обязательных колонок: ${missing.join(', ')} (строка 1 — заголовки)`);
    return null;
  }
  return map;
}

function rowIsEmpty(row: ExcelJS.Row): boolean {
  let empty = true;
  row.eachCell((cell) => {
    if (cellText(cell).text !== '') empty = false;
  });
  return empty;
}

export async function parseBookWorkbook(filePath: string): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const bookSheet = findSheet(workbook, BOOK_SHEET);
  const cardsSheet = findSheet(workbook, CARDS_SHEET);
  if (!bookSheet) errors.push(`Нет листа «${BOOK_SHEET}»`);
  if (!cardsSheet) errors.push(`Нет листа «${CARDS_SHEET}»`);
  if (!bookSheet || !cardsSheet) return { book: null, units: [], errors, warnings };

  // ── Лист «Книга» ──────────────────────────────────────────────────────────
  let book: ParsedBook | null = null;
  const bookCols = readHeaders(bookSheet, BOOK_COLUMNS, REQUIRED_BOOK_COLUMNS, errors);
  if (bookCols) {
    const dataRows: ExcelJS.Row[] = [];
    for (let r = 2; r <= bookSheet.rowCount; r++) {
      const row = bookSheet.getRow(r);
      if (!rowIsEmpty(row)) dataRows.push(row);
    }
    if (dataRows.length === 0) {
      errors.push(`Лист «${BOOK_SHEET}»: нет строки с данными книги (строка 2)`);
    } else {
      if (dataRows.length > 1) {
        warnings.push(`Лист «${BOOK_SHEET}»: строк с данными ${dataRows.length}, используется только строка ${dataRows[0].number}`);
      }
      const row = dataRows[0];
      const get = (c: BookColumn): string => {
        const col = bookCols.get(c);
        return col ? cellText(row.getCell(col)).text : '';
      };
      const title = get('title');
      const languageFrom = get('language_from').toLowerCase();
      const languageTo = get('language_to').toLowerCase();
      if (!title) errors.push(`Лист «${BOOK_SHEET}», строка ${row.number}: пустой title`);
      for (const [name, value] of [['language_from', languageFrom], ['language_to', languageTo]] as const) {
        if (!/^[a-z]{2,3}$/.test(value)) {
          errors.push(`Лист «${BOOK_SHEET}», строка ${row.number}: ${name} должен быть кодом языка (en, ru, ky…), сейчас «${value}»`);
        }
      }
      book = {
        title,
        edition: get('edition'),
        level: get('level') || null,
        subject: get('subject') || null,
        languageFrom,
        languageTo,
        publisher: get('publisher') || null,
      };
    }
  }

  // ── Лист «Карточки» ───────────────────────────────────────────────────────
  const units: ParsedUnit[] = [];
  const cardCols = readHeaders(cardsSheet, CARD_COLUMNS, REQUIRED_CARD_COLUMNS, errors);
  if (cardCols) {
    const byNumber = new Map<number, ParsedUnit>();
    // Служебное: первая строка юнита и уже встреченные term → строка.
    const meta = new Map<number, { firstRow: number; seen: Map<string, number> }>();
    for (let r = 2; r <= cardsSheet.rowCount; r++) {
      const row = cardsSheet.getRow(r);
      if (rowIsEmpty(row)) continue;
      const get = (c: CardColumn): { text: string; isDate: boolean } => {
        const col = cardCols.get(c);
        return col ? cellText(row.getCell(col)) : { text: '', isDate: false };
      };

      const unitRaw = get('unit').text;
      const unitTitle = get('unit_title').text;
      const pagesCell = get('pages');
      const term = get('term').text;
      const translation = get('translation').text;
      const example = get('example').text || null;

      let rowOk = true;
      const unitNumber = Number(unitRaw);
      if (!/^\d+$/.test(unitRaw) || !Number.isSafeInteger(unitNumber)) {
        errors.push(`Строка ${r}: unit должен быть целым числом ≥ 0, сейчас «${unitRaw}»`);
        rowOk = false;
      }
      if (!unitTitle) { errors.push(`Строка ${r}: пустой unit_title`); rowOk = false; }
      if (!term) { errors.push(`Строка ${r}: пустой term`); rowOk = false; }
      if (!translation) { errors.push(`Строка ${r}: пустой translation`); rowOk = false; }
      if (pagesCell.isDate) {
        errors.push(`Строка ${r}: Excel превратил pages в дату (${pagesCell.text}). Сделайте колонку текстовой или пишите через длинное тире: 8–17`);
        rowOk = false;
      }
      if (!rowOk) continue;

      const pages = pagesCell.text || null;
      let unit = byNumber.get(unitNumber);
      if (!unit) {
        unit = { number: unitNumber, title: unitTitle, pages, cards: [] };
        byNumber.set(unitNumber, unit);
        meta.set(unitNumber, { firstRow: r, seen: new Map() });
        units.push(unit);
      } else {
        const { firstRow } = meta.get(unitNumber)!;
        if (unit.title !== unitTitle) {
          errors.push(`Строка ${r}: у Unit ${unitNumber} другое название «${unitTitle}», в строке ${firstRow} — «${unit.title}»`);
          continue;
        }
        if (unit.pages !== pages) {
          errors.push(`Строка ${r}: у Unit ${unitNumber} другие страницы «${pages ?? ''}», в строке ${firstRow} — «${unit.pages ?? ''}»`);
          continue;
        }
      }

      const { seen } = meta.get(unitNumber)!;
      const key = normalizeTerm(term);
      const dupRow = seen.get(key);
      if (dupRow !== undefined) {
        warnings.push(`Строка ${r}: «${term}» уже есть в Unit ${unitNumber} (строка ${dupRow}) — дубль пропущен`);
        continue;
      }
      seen.set(key, r);
      unit.cards.push({ term, translation, example, row: r });
    }

    if (units.length === 0 && errors.length === 0) {
      errors.push(`Лист «${CARDS_SHEET}»: нет ни одной карточки`);
    }
  }

  return { book, units, errors, warnings };
}
