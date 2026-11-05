/**
 * Формат Excel-файла каталога библиотеки (один файл на все предметы) и его разбор с валидацией.
 * Используется import-library.ts (чтение) и create-library-template.ts (заголовки).
 *
 * Иерархия (plan/new/library_catalog.md, «Формат Excel»):
 *   L1 subject → L2 track (язык / раздел, если есть у предмета) → L3 level (если есть) → L4 collection → L5 набор.
 *
 * Разбор в два этапа:
 *  1. parseLibraryWorkbook — только файл: структура, обязательные поля, порядок в подборке, карточки.
 *  2. validateCatalog — правила, зависящие от предмета (шкала уровней, разделы). Предметы берутся из файла
 *     (лист «Предметы») и из базы, поэтому этот шаг вызывается после чтения базы. Функция чистая.
 */

import ExcelJS from 'exceljs';
import {
  cellText,
  findSheet,
  isLanguageCode,
  normalizeTerm,
  readHeaders,
  rowIsEmpty,
} from './excel';

export const SUBJECTS_SHEET = 'Предметы';
export const TRACKS_SHEET = 'Разделы';
export const SETS_SHEET = 'Наборы';
export const CARDS_SHEET = 'Карточки';

export const SUBJECT_COLUMNS = [
  'slug',
  'title',
  'subtitle',
  'icon',
  'track_label',
  'level_scale',
  'set_kind',
  'position',
] as const;
export const TRACK_COLUMNS = ['subject', 'key', 'title', 'position'] as const;
export const SET_COLUMNS = [
  'subject',
  'track',
  'level',
  'collection',
  'position',
  'title',
  'language_from',
  'language_to',
  'description',
] as const;
export const CARD_COLUMNS = ['set', 'term', 'translation', 'example'] as const;

type SubjectColumn = (typeof SUBJECT_COLUMNS)[number];
type TrackColumn = (typeof TRACK_COLUMNS)[number];
type SetColumn = (typeof SET_COLUMNS)[number];
type CardColumn = (typeof CARD_COLUMNS)[number];

const REQUIRED_SUBJECT_COLUMNS: SubjectColumn[] = ['slug', 'title', 'set_kind', 'position'];
const REQUIRED_TRACK_COLUMNS: TrackColumn[] = ['subject', 'key', 'title'];
const REQUIRED_SET_COLUMNS: SetColumn[] = [
  'subject',
  'collection',
  'position',
  'title',
  'language_from',
  'language_to',
];
const REQUIRED_CARD_COLUMNS: CardColumn[] = ['set', 'term', 'translation'];
/** Колонки старого формата (plan/done/library_import.md): теперь берутся из предмета. */
const OBSOLETE_SET_COLUMNS = ['kind', 'category', 'tags', 'cover_emoji'];

/** Ограничения library_sets / library_collections (VARCHAR(100)) и правило публикации. */
const MAX_TITLE = 100;
export const MIN_CARDS = 5;
/** Подборка меньше этого остаётся черновиком даже с --publish (правила показа, п. 5). */
export const MIN_SETS_TO_PUBLISH = 3;

export const SET_KINDS = ['language', 'subject'] as const;
export type LibrarySetKind = (typeof SET_KINDS)[number];
export const LEVEL_SCALES = ['cefr', 'stages'] as const;
export type LevelScale = (typeof LEVEL_SCALES)[number];

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
/** Шкала stages: ключ в базе и подпись, которую тоже принимаем в файле. */
export const STAGE_LEVELS: [string, string][] = [
  ['basic', 'Основы'],
  ['advanced', 'Углублённо'],
];

/**
 * Категория набора для старых версий приложения (фильтр и иконка в прежней библиотеке, card_sets.category
 * у копии). В новом формате её не заполняют — выводим из предмета.
 */
const SUBJECT_CATEGORY: Record<string, string> = {
  languages: 'vocab',
  history: 'history',
  geography: 'geography',
  ort: 'kg_tests',
};
export function categoryForSubject(slug: string, setKind: LibrarySetKind): string {
  return SUBJECT_CATEGORY[slug] ?? (setKind === 'language' ? 'vocab' : 'study');
}

export interface SubjectDef {
  slug: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  trackLabel: string | null;
  levelScale: LevelScale | null;
  setKind: LibrarySetKind;
  position: number;
}

export interface TrackDef {
  subject: string;
  key: string;
  title: string;
  position: number;
}

export interface ParsedLibraryCard {
  term: string;
  translation: string;
  example: string | null;
}

export interface ParsedLibrarySet {
  /** Строка на листе «Наборы» — для сообщений об ошибках. */
  row: number;
  subject: string;
  track: string | null;
  /** Как в файле; validateCatalog приводит к ключу шкалы (A2, basic). */
  level: string | null;
  collection: string;
  position: number;
  title: string;
  languageFrom: string;
  languageTo: string;
  description: string | null;
  cards: ParsedLibraryCard[];
}

export interface ParsedCollection {
  /** Ключ subject|track|level|title (нормализованный). */
  key: string;
  subject: string;
  track: string | null;
  level: string | null;
  title: string;
  /** Порядок на экране предмета: порядок первого появления в файле внутри subject + track + level. */
  position: number;
  sets: ParsedLibrarySet[];
}

export interface LibraryParseResult {
  subjects: SubjectDef[];
  tracks: TrackDef[];
  sets: ParsedLibrarySet[];
  errors: string[];
  warnings: string[];
}

const clean = (s: string): string => s.trim().replace(/\s+/g, ' ');
const orNull = (s: string): string | null => (s === '' ? null : s);

export function collectionKey(
  subject: string,
  track: string | null,
  level: string | null,
  title: string
): string {
  return [subject, track ?? '', level ?? '', normalizeTerm(title)].join('|');
}

function parsePositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

function cellGetter<T extends string>(sheet: ExcelJS.Worksheet, cols: Map<T, number>, r: number) {
  const row = sheet.getRow(r);
  return (c: T): string => {
    const col = cols.get(c);
    return col ? cellText(row.getCell(col)).text : '';
  };
}

// ── Лист «Предметы» (необязательный) ─────────────────────────────────────────
function parseSubjects(sheet: ExcelJS.Worksheet, errors: string[]): SubjectDef[] {
  const cols = readHeaders(sheet, SUBJECT_COLUMNS, REQUIRED_SUBJECT_COLUMNS, errors);
  if (!cols) return [];
  const out: SubjectDef[] = [];
  const seen = new Map<string, number>();
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (rowIsEmpty(sheet.getRow(r))) continue;
    const get = cellGetter(sheet, cols, r);
    const where = `Лист «${SUBJECTS_SHEET}», строка ${r}`;
    const slug = get('slug').toLowerCase();
    const title = clean(get('title'));
    const levelScale = get('level_scale').toLowerCase();
    const setKind = get('set_kind').toLowerCase();
    const position = parsePositiveInt(get('position'));

    let ok = true;
    if (!/^[a-z][a-z0-9_-]*$/.test(slug)) {
      errors.push(`${where}: slug «${slug}» — латиница в нижнем регистре, например languages`);
      ok = false;
    }
    if (!title) {
      errors.push(`${where}: пустой title`);
      ok = false;
    }
    if (levelScale && !(LEVEL_SCALES as readonly string[]).includes(levelScale)) {
      errors.push(`${where}: level_scale «${levelScale}» — можно cefr, stages или пусто`);
      ok = false;
    }
    if (!(SET_KINDS as readonly string[]).includes(setKind)) {
      errors.push(`${where}: set_kind «${setKind}» — нужно language или subject`);
      ok = false;
    }
    if (position === null) {
      errors.push(`${where}: position — целое число от 1`);
      ok = false;
    }
    const dup = seen.get(slug);
    if (dup) {
      errors.push(`${where}: предмет «${slug}» уже есть в строке ${dup}`);
      ok = false;
    }
    if (!ok) continue;
    seen.set(slug, r);
    out.push({
      slug,
      title,
      subtitle: orNull(clean(get('subtitle'))),
      icon: orNull(get('icon')),
      trackLabel: orNull(clean(get('track_label'))),
      levelScale: (levelScale || null) as LevelScale | null,
      setKind: setKind as LibrarySetKind,
      position: position as number,
    });
  }
  return out;
}

// ── Лист «Разделы» (необязательный) ──────────────────────────────────────────
function parseTracks(sheet: ExcelJS.Worksheet, errors: string[]): TrackDef[] {
  const cols = readHeaders(sheet, TRACK_COLUMNS, REQUIRED_TRACK_COLUMNS, errors);
  if (!cols) return [];
  const out: TrackDef[] = [];
  const seen = new Map<string, number>();
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (rowIsEmpty(sheet.getRow(r))) continue;
    const get = cellGetter(sheet, cols, r);
    const where = `Лист «${TRACKS_SHEET}», строка ${r}`;
    const subject = get('subject').toLowerCase();
    const key = get('key').toLowerCase();
    const title = clean(get('title'));
    const rawPos = get('position');
    const position =
      rawPos === ''
        ? out.filter((t) => t.subject === subject).length + 1
        : parsePositiveInt(rawPos);

    let ok = true;
    if (!subject) {
      errors.push(`${where}: пустой subject`);
      ok = false;
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(key)) {
      errors.push(`${where}: key «${key}» — латиница в нижнем регистре, например math`);
      ok = false;
    }
    if (!title) {
      errors.push(`${where}: пустой title`);
      ok = false;
    }
    if (position === null) {
      errors.push(`${where}: position — целое число от 1`);
      ok = false;
    }
    const dup = seen.get(`${subject}|${key}`);
    if (dup) {
      errors.push(`${where}: раздел «${key}» предмета «${subject}» уже есть в строке ${dup}`);
      ok = false;
    }
    if (!ok) continue;
    seen.set(`${subject}|${key}`, r);
    out.push({ subject, key, title, position: position as number });
  }
  return out;
}

export async function parseLibraryWorkbook(filePath: string): Promise<LibraryParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const subjectsSheet = findSheet(workbook, SUBJECTS_SHEET);
  const tracksSheet = findSheet(workbook, TRACKS_SHEET);
  const setsSheet = findSheet(workbook, SETS_SHEET);
  const cardsSheet = findSheet(workbook, CARDS_SHEET);
  if (!setsSheet) errors.push(`Нет листа «${SETS_SHEET}»`);
  if (!cardsSheet) errors.push(`Нет листа «${CARDS_SHEET}»`);

  const subjects = subjectsSheet ? parseSubjects(subjectsSheet, errors) : [];
  const tracks = tracksSheet ? parseTracks(tracksSheet, errors) : [];
  if (!setsSheet || !cardsSheet) return { subjects, tracks, sets: [], errors, warnings };

  // ── Лист «Наборы» ─────────────────────────────────────────────────────────
  const sets: ParsedLibrarySet[] = [];
  // Карточки ссылаются на набор по title — он должен быть уникален во всём файле.
  const byTitle = new Map<string, { set: ParsedLibrarySet; seen: Map<string, number> }>();
  const setCols = readHeaders(setsSheet, SET_COLUMNS, REQUIRED_SET_COLUMNS, errors);
  if (setCols) {
    const headers: string[] = [];
    setsSheet.getRow(1).eachCell((cell) => headers.push(cellText(cell).text.toLowerCase()));
    const obsolete = OBSOLETE_SET_COLUMNS.filter((c) => headers.includes(c));
    if (obsolete.length > 0) {
      warnings.push(
        `Лист «${SETS_SHEET}»: колонки ${obsolete.join(', ')} больше не нужны и пропускаются — тип и категория берутся из предмета`
      );
    }

    for (let r = 2; r <= setsSheet.rowCount; r++) {
      if (rowIsEmpty(setsSheet.getRow(r))) continue;
      const get = cellGetter(setsSheet, setCols, r);
      const where = `Лист «${SETS_SHEET}», строка ${r}`;

      const subject = get('subject').toLowerCase();
      const track = get('track').toLowerCase();
      const level = get('level');
      const collection = clean(get('collection'));
      const position = parsePositiveInt(get('position'));
      const title = clean(get('title'));
      const languageFrom = get('language_from').toLowerCase();
      const languageTo = get('language_to').toLowerCase();

      let ok = true;
      if (!subject) {
        errors.push(`${where}: пустой subject`);
        ok = false;
      }
      if (!collection) {
        errors.push(`${where}: пустой collection (название подборки)`);
        ok = false;
      } else if (collection.length > MAX_TITLE) {
        errors.push(`${where}: collection длиннее ${MAX_TITLE} символов`);
        ok = false;
      }
      if (position === null) {
        errors.push(`${where}: position — номер набора в подборке, целое число от 1`);
        ok = false;
      }
      if (!title) {
        errors.push(`${where}: пустой title`);
        ok = false;
      } else if (title.length > MAX_TITLE) {
        errors.push(`${where}: title длиннее ${MAX_TITLE} символов`);
        ok = false;
      }
      for (const [name, value] of [
        ['language_from', languageFrom],
        ['language_to', languageTo],
      ] as const) {
        if (!isLanguageCode(value)) {
          errors.push(`${where}: ${name} должен быть кодом языка (en, ru, ky…), сейчас «${value}»`);
          ok = false;
        }
      }
      if (!ok) continue;

      const key = normalizeTerm(title);
      const dup = byTitle.get(key);
      if (dup) {
        errors.push(
          `${where}: набор «${title}» уже есть в строке ${dup.set.row} — название набора должно быть уникальным во всём файле`
        );
        continue;
      }
      const set: ParsedLibrarySet = {
        row: r,
        subject,
        track: orNull(track),
        level: orNull(level),
        collection,
        position: position as number,
        title,
        languageFrom,
        languageTo,
        description: orNull(get('description')),
        cards: [],
      };
      byTitle.set(key, { set, seen: new Map() });
      sets.push(set);
    }
    if (sets.length === 0 && errors.length === 0)
      errors.push(`Лист «${SETS_SHEET}»: нет ни одного набора`);
  }

  // ── Лист «Карточки» ───────────────────────────────────────────────────────
  const cardCols = readHeaders(cardsSheet, CARD_COLUMNS, REQUIRED_CARD_COLUMNS, errors);
  if (cardCols && setCols) {
    for (let r = 2; r <= cardsSheet.rowCount; r++) {
      if (rowIsEmpty(cardsSheet.getRow(r))) continue;
      const get = cellGetter(cardsSheet, cardCols, r);
      const where = `Лист «${CARDS_SHEET}», строка ${r}`;

      const setTitle = get('set');
      const term = get('term');
      const translation = get('translation');
      const example = orNull(get('example'));

      let ok = true;
      const entry = byTitle.get(normalizeTerm(setTitle));
      if (!setTitle) {
        errors.push(`${where}: пустой set`);
        ok = false;
      } else if (!entry) {
        errors.push(`${where}: набора «${setTitle}» нет на листе «${SETS_SHEET}»`);
        ok = false;
      }
      if (!term) {
        errors.push(`${where}: пустой term`);
        ok = false;
      }
      if (!translation) {
        errors.push(`${where}: пустой translation`);
        ok = false;
      }
      if (!ok || !entry) continue;

      const key = normalizeTerm(term);
      const dupRow = entry.seen.get(key);
      if (dupRow !== undefined) {
        warnings.push(
          `${where}: «${term}» уже есть в наборе «${entry.set.title}» (строка ${dupRow}) — дубль пропущен`
        );
        continue;
      }
      entry.seen.set(key, r);
      entry.set.cards.push({ term, translation, example });
    }

    for (const { set } of byTitle.values()) {
      if (set.cards.length < MIN_CARDS) {
        errors.push(
          `Набор «${set.title}» (лист «${SETS_SHEET}», строка ${set.row}): карточек ${set.cards.length}, нужно не меньше ${MIN_CARDS}`
        );
      }
    }
  }

  return { subjects, tracks, sets, errors, warnings };
}

export interface CatalogValidation {
  collections: ParsedCollection[];
  errors: string[];
  warnings: string[];
}

/**
 * Правила, зависящие от предмета: предмет существует, раздел и уровень подходят к его шкале,
 * у языков track = language_from, номера в подборке 1..N без пропусков и повторов.
 * Уровень приводится к ключу (a2 → A2, «Основы» → basic) прямо в наборах.
 *
 * subjects / tracks — уже объединённые: из базы, поверх них — из файла.
 */
export function validateCatalog(
  sets: ParsedLibrarySet[],
  subjects: SubjectDef[],
  tracks: TrackDef[]
): CatalogValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const subjectBySlug = new Map(subjects.map((s) => [s.slug, s]));

  for (const t of tracks) {
    if (!subjectBySlug.has(t.subject)) {
      errors.push(
        `Лист «${TRACKS_SHEET}»: раздел «${t.key}» у неизвестного предмета «${t.subject}»`
      );
    }
  }

  const collections = new Map<string, ParsedCollection>();
  const groupCounters = new Map<string, number>();

  for (const set of sets) {
    const where = `Лист «${SETS_SHEET}», строка ${set.row}`;
    const subject = subjectBySlug.get(set.subject);
    if (!subject) {
      errors.push(
        `${where}: предмета «${set.subject}» нет. Есть: ${subjects.map((s) => s.slug).join(', ') || '—'}` +
          ` (новый предмет заводится на листе «${SUBJECTS_SHEET}»)`
      );
      continue;
    }

    // L2: раздел / язык.
    let ok = true;
    if (!subject.trackLabel) {
      if (set.track) {
        errors.push(`${where}: у предмета «${subject.title}» нет разделов — оставьте track пустым`);
        ok = false;
      }
    } else if (!set.track) {
      errors.push(
        `${where}: track обязателен для «${subject.title}» (${subject.trackLabel.toLowerCase()})`
      );
      ok = false;
    } else if (subject.setKind === 'language') {
      if (set.track !== set.languageFrom) {
        errors.push(
          `${where}: у языков track = код языка набора: track «${set.track}», language_from «${set.languageFrom}»`
        );
        ok = false;
      }
    } else {
      const known = tracks.filter((t) => t.subject === subject.slug);
      if (!known.some((t) => t.key === set.track)) {
        errors.push(
          `${where}: раздела «${set.track}» у «${subject.title}» нет. Есть: ${known.map((t) => t.key).join(', ') || '—'}` +
            ` (новый раздел заводится на листе «${TRACKS_SHEET}»)`
        );
        ok = false;
      }
    }

    // L3: уровень по шкале предмета.
    if (!subject.levelScale) {
      if (set.level) {
        errors.push(`${where}: у предмета «${subject.title}» нет уровней — оставьте level пустым`);
        ok = false;
      }
    } else if (!set.level) {
      errors.push(`${where}: level обязателен для «${subject.title}»`);
      ok = false;
    } else if (subject.levelScale === 'cefr') {
      const lv = set.level.toUpperCase();
      if (!CEFR_LEVELS.includes(lv)) {
        errors.push(`${where}: level «${set.level}» — можно ${CEFR_LEVELS.join(', ')}`);
        ok = false;
      } else set.level = lv;
    } else {
      const raw = normalizeTerm(set.level);
      const stage = STAGE_LEVELS.find(([k, label]) => k === raw || normalizeTerm(label) === raw);
      if (!stage) {
        errors.push(
          `${where}: level «${set.level}» — можно ${STAGE_LEVELS.map(([k, l]) => `${k} (${l})`).join(', ')}`
        );
        ok = false;
      } else set.level = stage[0];
    }
    if (!ok) continue;

    const key = collectionKey(set.subject, set.track, set.level, set.collection);
    let col = collections.get(key);
    if (!col) {
      const group = `${set.subject}|${set.track ?? ''}|${set.level ?? ''}`;
      const position = (groupCounters.get(group) ?? 0) + 1;
      groupCounters.set(group, position);
      col = {
        key,
        subject: set.subject,
        track: set.track,
        level: set.level,
        title: set.collection,
        position,
        sets: [],
      };
      collections.set(key, col);
    }
    col.sets.push(set);
  }

  // Номера в подборке: 1..N без пропусков и повторов.
  for (const col of collections.values()) {
    col.sets.sort((a, b) => a.position - b.position);
    const name = `Подборка «${col.title}» (${[col.subject, col.track, col.level].filter(Boolean).join(' · ')})`;
    const positions = col.sets.map((s) => s.position);
    const dup = positions.find((p, i) => positions.indexOf(p) !== i);
    if (dup !== undefined) {
      const rows = col.sets.filter((s) => s.position === dup).map((s) => s.row);
      errors.push(`${name}: номер ${dup} повторяется (строки ${rows.join(', ')})`);
    } else if (positions.some((p, i) => p !== i + 1)) {
      errors.push(
        `${name}: номера должны идти 1, 2, 3… без пропусков, сейчас ${positions.join(', ')}`
      );
    }
    if (col.sets.length < MIN_SETS_TO_PUBLISH) {
      warnings.push(
        `${name}: наборов ${col.sets.length}, для показа в библиотеке нужно не меньше ${MIN_SETS_TO_PUBLISH} — подборка останется черновиком`
      );
    }
  }

  return { collections: [...collections.values()], errors, warnings };
}
