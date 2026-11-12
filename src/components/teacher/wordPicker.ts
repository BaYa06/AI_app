/**
 * Окно «Выбор слов для задания» (plan/new/teacher_cabinet.md, Teacher 19; макет 11а).
 * Чистые правила выбора — общие для RN-окна и Swift-окна (Teacher 20). Задание — список слов:
 * весь набор, часть набора или несколько наборов (решение плана «Задание = список конкретных слов»).
 */
import { pluralize } from '@/utils';
import {
  HOMEWORK_MANY_WORDS,
  HOMEWORK_PART_WORDS,
  homeworkVolumeText,
  wordsPerDay,
} from '@/services/homework';
import type { HomeworkWords } from './newHomework';

export interface PickerWord {
  id: string;
  front: string;
  back: string;
}

export interface PickerSet {
  id: string;
  title: string;
  words: PickerWord[];
}

/** setId → выбранные id слов */
export type WordSelection = Record<string, ReadonlySet<string>>;

export type SetCheck = 'all' | 'some' | 'none';

export const WORD_PICKER_TEXTS = {
  title: 'Слова для задания',
  search: 'Найти слово',
  setsLabel: 'Наборы курса',
  footnote:
    'Задание — это список слов. Слова, которые потом добавят в набор, в задание не попадут.',
  empty: 'В курсе пока нет наборов со словами',
  nothingFound: 'Ничего не нашлось',
  manyTitle: 'Много к сроку.',
  takePart: `Взять ${HOMEWORK_PART_WORDS}`,
  pickHint: 'Отметь наборы или отдельные слова',
  done: 'Готово',
  selectAll: 'Выбрать все слова',
  clearAll: 'Снять все слова',
} as const;

/** Выбор из уже выбранных слов задания (при повторном открытии окна) */
export function selectionFromWords(sets: PickerSet[], words: HomeworkWords | null): WordSelection {
  const chosen = new Set(words?.cardIds ?? []);
  const out: Record<string, Set<string>> = {};
  for (const s of sets)
    out[s.id] = new Set(s.words.filter((w) => chosen.has(w.id)).map((w) => w.id));
  return out;
}

export function setCheck(set: PickerSet, sel: WordSelection): SetCheck {
  const n = sel[set.id]?.size ?? 0;
  if (n === 0) return 'none';
  return n >= set.words.length ? 'all' : 'some';
}

/** Галочка набора: всё выбрано — снять все, иначе выбрать все */
export function toggleSet(set: PickerSet, sel: WordSelection): WordSelection {
  const all = setCheck(set, sel) === 'all';
  return { ...sel, [set.id]: new Set(all ? [] : set.words.map((w) => w.id)) };
}

export function toggleWord(setId: string, wordId: string, sel: WordSelection): WordSelection {
  const next = new Set(sel[setId] ?? []);
  if (next.has(wordId)) next.delete(wordId);
  else next.add(wordId);
  return { ...sel, [setId]: next };
}

/** «Взять 25»: первые n выбранных по порядку наборов и слов, остальное снять */
export function takeFirst(sets: PickerSet[], sel: WordSelection, n: number): WordSelection {
  let left = n;
  const out: Record<string, Set<string>> = {};
  for (const s of sets) {
    const keep = new Set<string>();
    for (const w of s.words) {
      if (left > 0 && sel[s.id]?.has(w.id)) {
        keep.add(w.id);
        left--;
      }
    }
    out[s.id] = keep;
  }
  return out;
}

export function selectedCount(sel: WordSelection): number {
  return Object.values(sel).reduce((n, s) => n + s.size, 0);
}

/** Итог выбора: слова по порядку наборов и слов, наборы — только с выбранными словами */
export function toHomeworkWords(sets: PickerSet[], sel: WordSelection): HomeworkWords {
  const cardIds: string[] = [];
  const used: HomeworkWords['sets'] = [];
  for (const s of sets) {
    const chosen = s.words.filter((w) => sel[s.id]?.has(w.id));
    if (chosen.length === 0) continue;
    used.push({ id: s.id, title: s.title });
    cardIds.push(...chosen.map((w) => w.id));
  }
  return { cardIds, sets: used };
}

/** Поиск по слову и переводу; пустой запрос — все слова */
export function filterWords(words: PickerWord[], query: string): PickerWord[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return words;
  return words.filter(
    (w) => w.front.toLocaleLowerCase().includes(q) || w.back.toLocaleLowerCase().includes(q)
  );
}

/** Подпись под набором: «50 слов» / «все 50 слов» / «12 из 50 слов» */
export function setSubtitle(set: PickerSet, sel: WordSelection): string {
  const total = set.words.length;
  const n = sel[set.id]?.size ?? 0;
  const words = pluralize(total, 'слово', 'слова', 'слов');
  if (n === 0) return `${total} ${words}`;
  if (n >= total) return `все ${total} ${words}`;
  return `${n} из ${total} ${words}`;
}

/** «Выбрано 50 слов» */
export function selectedTitle(n: number): string {
  return `Выбрано ${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;
}

/** Строка под итогом: объём или подсказка, если ничего не выбрано */
export function selectedVolume(n: number): string {
  return n === 0 ? WORD_PICKER_TEXTS.pickHint : homeworkVolumeText(n);
}

/** Плашка «Много к сроку»: null — не показывать */
export function tooManyText(n: number, due: Date, now: number = Date.now()): string | null {
  if (n <= HOMEWORK_MANY_WORDS) return null;
  const perDay = wordsPerDay(n, due, now);
  return `До срока это ${perDay} ${pluralize(perDay, 'слово', 'слова', 'слов')} в день. Можно задать часть, остальное — следующим заданием.`;
}

/** Порядок наборов: юниты и наборы по названию с учётом чисел («Ünite 2» раньше «Ünite 10») */
export function sortPickerSets(sets: PickerSet[]): PickerSet[] {
  return [...sets].sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }));
}
