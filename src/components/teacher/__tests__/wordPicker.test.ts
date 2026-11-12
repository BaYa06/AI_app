import { describe, expect, it } from '@jest/globals';
import {
  filterWords,
  selectedCount,
  selectionFromWords,
  setCheck,
  setSubtitle,
  sortPickerSets,
  takeFirst,
  toHomeworkWords,
  toggleSet,
  toggleWord,
  tooManyText,
  type PickerSet,
} from '../wordPicker';

const words = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    front: `${prefix}w${i}`,
    back: `п${i}`,
  }));
const U5: PickerSet = { id: 'u5', title: 'Ünite 5', words: words('a', 50) };
const U4: PickerSet = { id: 'u4', title: 'Ünite 4', words: words('b', 48) };
const SETS = [U4, U5];

describe('выбор слов', () => {
  it('из слов задания; состояние набора все / часть / ни одного', () => {
    const sel = selectionFromWords(SETS, { cardIds: U5.words.map((w) => w.id), sets: [] });
    expect(setCheck(U5, sel)).toBe('all');
    expect(setCheck(U4, sel)).toBe('none');
    const part = toggleWord('u5', 'a0', sel);
    expect(setCheck(U5, part)).toBe('some');
    expect(setSubtitle(U5, part)).toBe('49 из 50 слов');
    expect(setSubtitle(U4, part)).toBe('48 слов');
    expect(setSubtitle(U5, sel)).toBe('все 50 слов');
  });

  it('галочка набора: часть → все, все → ни одного', () => {
    const part = toggleWord('u5', 'a0', selectionFromWords(SETS, null));
    const all = toggleSet(U5, part);
    expect(selectedCount(all)).toBe(50);
    expect(selectedCount(toggleSet(U5, all))).toBe(0);
  });

  it('«Взять 25» — первые по порядку наборов', () => {
    let sel = toggleSet(U4, toggleSet(U5, selectionFromWords(SETS, null)));
    expect(selectedCount(sel)).toBe(98);
    sel = takeFirst(SETS, sel, 25);
    expect(selectedCount(sel)).toBe(25);
    expect(setCheck(U4, sel)).toBe('some');
    expect(setCheck(U5, sel)).toBe('none');
  });

  it('итог — слова по порядку и только наборы с выбранными словами', () => {
    const sel = toggleWord('u5', 'a3', toggleWord('u5', 'a1', selectionFromWords(SETS, null)));
    expect(toHomeworkWords(SETS, sel)).toEqual({
      cardIds: ['a1', 'a3'],
      sets: [{ id: 'u5', title: 'Ünite 5' }],
    });
  });

  it('поиск по слову и переводу; порядок наборов с числами', () => {
    expect(filterWords(U5.words, 'AW1').length).toBe(11); // aw1, aw10–aw19
    expect(filterWords(U5.words, 'п49').map((w) => w.id)).toEqual(['a49']);
    const sorted = sortPickerSets([
      { id: '10', title: 'Ünite 10', words: [] },
      { id: '2', title: 'Ünite 2', words: [] },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['2', '10']);
  });

  it('плашка «Много к сроку» — больше 30 слов', () => {
    const now = new Date(2026, 10, 12, 10, 0).getTime();
    const due = new Date(2026, 10, 15, 20, 0);
    expect(tooManyText(30, due, now)).toBeNull();
    expect(tooManyText(50, due, now)).toContain('17 слов в день');
  });
});
