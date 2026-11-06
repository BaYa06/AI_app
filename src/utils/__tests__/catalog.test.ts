import { describe, expect, it } from '@jest/globals';
import {
  addedLabel,
  bookMatchesLevel,
  collectionPath,
  levelLabel,
  setsCountLabel,
  trackName,
} from '../catalog';

describe('подписи каталога', () => {
  it('уровень: CEFR как есть, stages — по-русски, пусто — пусто', () => {
    expect(levelLabel('A2')).toBe('A2');
    expect(levelLabel('basic')).toBe('Основы');
    expect(levelLabel('advanced')).toBe('Углублённо');
    expect(levelLabel(null)).toBe('');
  });

  it('раздел: у языка — название по коду, у раздела — с сервера', () => {
    expect(trackName({ track: 'en', trackTitle: null })).toBe('Английский');
    expect(trackName({ track: 'kg', trackTitle: 'Кыргызстан' })).toBe('Кыргызстан');
    expect(trackName({ track: null, trackTitle: null })).toBe('');
  });

  it('путь подборки — только заполненные части', () => {
    expect(collectionPath({ track: 'en', trackTitle: null, level: 'A2' })).toBe('Английский · A2');
    expect(collectionPath({ track: 'kg', trackTitle: 'Кыргызстан', level: 'basic' })).toBe(
      'Кыргызстан · Основы'
    );
    expect(collectionPath({ track: null, trackTitle: null, level: null })).toBe('');
  });

  it('счётчики', () => {
    expect(setsCountLabel(1)).toBe('1 набор');
    expect(setsCountLabel(3)).toBe('3 набора');
    expect(setsCountLabel(8)).toBe('8 наборов');
    expect(addedLabel(3, 8)).toBe('добавлено 3 из 8');
  });

  it('учебник подходит уровню, если уровень в его диапазоне', () => {
    expect(bookMatchesLevel({ level: 'A2' }, 'A2')).toBe(true);
    expect(bookMatchesLevel({ level: 'A1–A2' }, 'A2')).toBe(true);
    expect(bookMatchesLevel({ level: 'a2 - b1' }, 'B1')).toBe(true);
    expect(bookMatchesLevel({ level: 'A1–A2' }, 'B1')).toBe(false);
    expect(bookMatchesLevel({ level: null }, 'A1')).toBe(false);
    expect(bookMatchesLevel({ level: 'Beginner' }, 'A1')).toBe(false);
  });
});
