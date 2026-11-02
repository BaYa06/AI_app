/**
 * Общие помощники чтения и оформления Excel для импорта книг (bookExcel.ts) и наборов библиотеки
 * (libraryExcel.ts).
 */

import ExcelJS from 'exceljs';

/** Ключ сопоставления карточек: регистр и лишние пробелы не важны. Тот же ключ применяется к карточкам в БД. */
export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

/** Приводит значение ячейки ExcelJS к строке. Date возвращается отдельно, чтобы поймать «страницы, ставшие датой». */
export function cellText(cell: ExcelJS.Cell): { text: string; isDate: boolean } {
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

export function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const target = normalizeHeader(name);
  return workbook.worksheets.find((ws) => normalizeHeader(ws.name) === target);
}

/** Возвращает номер колонки для каждого известного заголовка из первой строки листа. */
export function readHeaders<T extends string>(
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

export function rowIsEmpty(row: ExcelJS.Row): boolean {
  let empty = true;
  row.eachCell((cell) => {
    if (cellText(cell).text !== '') empty = false;
  });
  return empty;
}

/** Код языка: en, ru, ky… */
export function isLanguageCode(value: string): boolean {
  return /^[a-z]{2,3}$/.test(value);
}

/** Шапка листа шаблона: жирная, с заливкой, закреплена. */
export function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF9' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
