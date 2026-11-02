/**
 * Формат Excel-файла наборов библиотеки (один файл = сколько угодно наборов) и его разбор с валидацией.
 * Используется import-library.ts (чтение) и create-library-template.ts (заголовки).
 * План: plan/new/library_import.md.
 */

import ExcelJS from 'exceljs';
import { LIBRARY_CATEGORIES } from '../../src/constants/library';
import { cellText, findSheet, isLanguageCode, normalizeTerm, readHeaders, rowIsEmpty } from './excel';

export const SETS_SHEET = 'Наборы';
export const CARDS_SHEET = 'Карточки';

export const SET_COLUMNS = ['title', 'category', 'language_from', 'language_to', 'description', 'tags', 'cover_emoji'] as const;
export const CARD_COLUMNS = ['set', 'term', 'translation', 'example'] as const;

type SetColumn = (typeof SET_COLUMNS)[number];
type CardColumn = (typeof CARD_COLUMNS)[number];

const REQUIRED_SET_COLUMNS: SetColumn[] = ['title', 'category', 'language_from', 'language_to'];
const REQUIRED_CARD_COLUMNS: CardColumn[] = ['set', 'term', 'translation'];

/** Ограничения library_sets (миграция 005) и правило публикации (api/library.js). */
const MAX_TITLE = 100;
const MAX_EMOJI = 10;
export const MIN_CARDS = 5;

export const CATEGORY_KEYS = LIBRARY_CATEGORIES.map((c) => c.key);

export interface ParsedLibraryCard {
  term: string;
  translation: string;
  example: string | null;
}

export interface ParsedLibrarySet {
  title: string;
  category: string;
  languageFrom: string;
  languageTo: string;
  description: string | null;
  tags: string[];
  coverEmoji: string | null;
  cards: ParsedLibraryCard[];
}

export interface LibraryParseResult {
  sets: ParsedLibrarySet[];
  errors: string[];
  warnings: string[];
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(',')) {
    const tag = part.trim().replace(/\s+/g, ' ');
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

export async function parseLibraryWorkbook(filePath: string): Promise<LibraryParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const setsSheet = findSheet(workbook, SETS_SHEET);
  const cardsSheet = findSheet(workbook, CARDS_SHEET);
  if (!setsSheet) errors.push(`Нет листа «${SETS_SHEET}»`);
  if (!cardsSheet) errors.push(`Нет листа «${CARDS_SHEET}»`);
  if (!setsSheet || !cardsSheet) return { sets: [], errors, warnings };

  // ── Лист «Наборы» ─────────────────────────────────────────────────────────
  const sets: ParsedLibrarySet[] = [];
  // Карточки ссылаются на набор по title — он должен быть уникален в файле.
  const byTitle = new Map<string, { set: ParsedLibrarySet; row: number; seen: Map<string, number> }>();
  const setCols = readHeaders(setsSheet, SET_COLUMNS, REQUIRED_SET_COLUMNS, errors);
  if (setCols) {
    for (let r = 2; r <= setsSheet.rowCount; r++) {
      const row = setsSheet.getRow(r);
      if (rowIsEmpty(row)) continue;
      const get = (c: SetColumn): string => {
        const col = setCols.get(c);
        return col ? cellText(row.getCell(col)).text : '';
      };
      const where = `Лист «${SETS_SHEET}», строка ${r}`;

      const title = get('title').replace(/\s+/g, ' ');
      const category = get('category').toLowerCase();
      const languageFrom = get('language_from').toLowerCase();
      const languageTo = get('language_to').toLowerCase();
      const coverEmoji = get('cover_emoji') || null;

      let rowOk = true;
      if (!title) { errors.push(`${where}: пустой title`); rowOk = false; }
      if (title.length > MAX_TITLE) { errors.push(`${where}: title длиннее ${MAX_TITLE} символов`); rowOk = false; }
      if (!CATEGORY_KEYS.includes(category)) {
        errors.push(`${where}: category «${category}» — нет такой категории. Можно: ${CATEGORY_KEYS.join(', ')}`);
        rowOk = false;
      }
      for (const [name, value] of [['language_from', languageFrom], ['language_to', languageTo]] as const) {
        if (!isLanguageCode(value)) {
          errors.push(`${where}: ${name} должен быть кодом языка (en, ru, ky…), сейчас «${value}»`);
          rowOk = false;
        }
      }
      if (coverEmoji && [...coverEmoji].length > MAX_EMOJI) {
        errors.push(`${where}: cover_emoji — один эмодзи, сейчас «${coverEmoji}»`);
        rowOk = false;
      }
      if (!rowOk) continue;

      const key = normalizeTerm(title);
      const dup = byTitle.get(key);
      if (dup) {
        errors.push(`${where}: набор «${title}» уже есть в строке ${dup.row}`);
        continue;
      }
      const set: ParsedLibrarySet = {
        title, category, languageFrom, languageTo,
        description: get('description') || null,
        tags: parseTags(get('tags')),
        coverEmoji,
        cards: [],
      };
      byTitle.set(key, { set, row: r, seen: new Map() });
      sets.push(set);
    }
    if (sets.length === 0 && errors.length === 0) errors.push(`Лист «${SETS_SHEET}»: нет ни одного набора`);
  }

  // ── Лист «Карточки» ───────────────────────────────────────────────────────
  const cardCols = readHeaders(cardsSheet, CARD_COLUMNS, REQUIRED_CARD_COLUMNS, errors);
  if (cardCols && setCols) {
    for (let r = 2; r <= cardsSheet.rowCount; r++) {
      const row = cardsSheet.getRow(r);
      if (rowIsEmpty(row)) continue;
      const get = (c: CardColumn): string => {
        const col = cardCols.get(c);
        return col ? cellText(row.getCell(col)).text : '';
      };
      const where = `Лист «${CARDS_SHEET}», строка ${r}`;

      const setTitle = get('set');
      const term = get('term');
      const translation = get('translation');
      const example = get('example') || null;

      let rowOk = true;
      const entry = byTitle.get(normalizeTerm(setTitle));
      if (!setTitle) { errors.push(`${where}: пустой set`); rowOk = false; }
      else if (!entry) { errors.push(`${where}: набора «${setTitle}» нет на листе «${SETS_SHEET}»`); rowOk = false; }
      if (!term) { errors.push(`${where}: пустой term`); rowOk = false; }
      if (!translation) { errors.push(`${where}: пустой translation`); rowOk = false; }
      if (!rowOk || !entry) continue;

      const key = normalizeTerm(term);
      const dupRow = entry.seen.get(key);
      if (dupRow !== undefined) {
        warnings.push(`${where}: «${term}» уже есть в наборе «${entry.set.title}» (строка ${dupRow}) — дубль пропущен`);
        continue;
      }
      entry.seen.set(key, r);
      entry.set.cards.push({ term, translation, example });
    }

    for (const { set, row } of byTitle.values()) {
      if (set.cards.length < MIN_CARDS) {
        errors.push(
          `Набор «${set.title}» (лист «${SETS_SHEET}», строка ${row}): карточек ${set.cards.length}, нужно не меньше ${MIN_CARDS}`,
        );
      }
    }
  }

  return { sets, errors, warnings };
}
