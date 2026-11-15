/**
 * Слова стартового набора (plan/new/new_user_activation.md, Start 1.1)
 */
import { describe, expect, it } from '@jest/globals';
import { TOP_LANGUAGES } from '../languages';
import { LANGS_WITH_READING, STARTER_LANGS, STARTER_THEMES } from '../starterWords';

const themes = Object.values(STARTER_THEMES);

describe('starterWords', () => {
  it('языки — те же, что в онбординге (TOP_LANGUAGES)', () => {
    expect([...STARTER_LANGS].sort()).toEqual(TOP_LANGUAGES.map((l) => l.code).sort());
  });

  it('в каждой теме 20 понятий, id без повторов', () => {
    for (const theme of themes) {
      expect({ theme: theme.id, count: theme.concepts.length }).toEqual({
        theme: theme.id,
        count: 20,
      });
      const ids = theme.concepts.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('у каждого понятия заполнены все языки, нет пустых строк', () => {
    for (const theme of themes) {
      for (const c of theme.concepts) {
        for (const lang of STARTER_LANGS) {
          const e = c.words[lang];
          expect({ id: c.id, lang, word: e.word.trim().length > 0 }).toEqual({
            id: c.id,
            lang,
            word: true,
          });
          expect(e.example.trim().length).toBeGreaterThan(0);
          if (e.form !== undefined) expect(e.form.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('чтение есть ровно у китайского, японского и корейского', () => {
    for (const theme of themes) {
      for (const c of theme.concepts) {
        for (const lang of STARTER_LANGS) {
          const hasReading = !!c.words[lang].reading?.trim();
          expect({ id: c.id, lang, hasReading }).toEqual({
            id: c.id,
            lang,
            hasReading: LANGS_WITH_READING.includes(lang),
          });
        }
      }
    }
  });

  it('пример содержит слово или его форму — «Слово в контексте» найдёт пропуск', () => {
    // Сравнение — как в ContextFillScreen.blankWord: toLowerCase и поиск подстроки
    for (const theme of themes) {
      for (const c of theme.concepts) {
        for (const lang of STARTER_LANGS) {
          const e = c.words[lang];
          const example = e.example.toLowerCase();
          const found =
            (e.form !== undefined && example.includes(e.form.toLowerCase())) ||
            example.includes(e.word.toLowerCase());
          expect({ id: c.id, lang, found }).toEqual({ id: c.id, lang, found: true });
        }
      }
    }
  });
});
