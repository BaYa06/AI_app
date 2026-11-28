/**
 * Стартовый набор (plan/new/new_user_activation.md, Start 1.2)
 */
import { describe, expect, it } from '@jest/globals';
import { buildStarterSet, pickStarterTheme } from '../StarterSetService';

let counter = 0;
const base = {
  userId: 'user-1',
  now: 1_700_000_000_000,
  newId: () => `id-${++counter}`,
};

describe('pickStarterTheme', () => {
  it('«Для путешествий» → фразы для поездки, остальное → первые слова', () => {
    expect(pickStarterTheme('travel')).toBe('travel');
    expect(pickStarterTheme('studies')).toBe('first_words');
    expect(pickStarterTheme('self')).toBe('first_words');
    expect(pickStarterTheme(undefined)).toBe('first_words');
    expect(pickStarterTheme(null)).toBe('first_words');
  });
});

describe('buildStarterSet', () => {
  it('русский → английский: 20 карточек, слово на изучаемом, перевод на родном', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['en'] });
    expect(r).not.toBeNull();
    expect(r!.theme).toBe('first_words');
    expect(r!.set.title).toBe('Первые слова');
    expect(r!.set.languageFrom).toBe('en');
    expect(r!.set.languageTo).toBe('ru');
    expect(r!.set.kind).toBe('language');
    expect(r!.set.courseId).toBeNull();
    expect(r!.set.cardCount).toBe(20);
    expect(r!.cards).toHaveLength(20);
    expect(r!.cards[0]).toMatchObject({
      setId: r!.set.id,
      frontText: 'Hello',
      backText: 'Привет',
      example: "Hello, I'm Anna.",
      status: 'new',
      learningStep: 0,
    });
  });

  it('из нескольких изучаемых берёт первый', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['de', 'en'] });
    expect(r!.set.languageFrom).toBe('de');
    expect(r!.cards[0].frontText).toBe('Hallo');
  });

  it('любая пара языков: английский → турецкий', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'en', targetLanguages: ['tr'] });
    expect(r!.cards[1]).toMatchObject({ frontText: 'Teşekkürler', backText: 'Thank you' });
  });

  it('цель «путешествия» → «Фразы для поездки»', () => {
    const r = buildStarterSet({
      ...base,
      nativeLanguage: 'ru',
      targetLanguages: ['es'],
      learningGoal: 'travel',
    });
    expect(r!.theme).toBe('travel');
    expect(r!.set.title).toBe('Фразы для поездки');
    expect(r!.set.category).toBe('travel');
    expect(r!.cards[0].frontText).toBe('Perdón');
  });

  it('китайский: чтение в переводе, иероглифы на лицевой стороне', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['zh'] });
    expect(r!.cards[0]).toMatchObject({ frontText: '你好', backText: 'Привет (nǐ hǎo)' });
  });

  it('родной — китайский: чтение не добавляется к переводу', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'zh', targetLanguages: ['en'] });
    expect(r!.cards[0]).toMatchObject({ frontText: 'Hello', backText: '你好' });
  });

  it('родной — японский, изучает корейский: латиница не приклеивается к японскому переводу', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ja', targetLanguages: ['ko'] });
    expect(r!.cards[0]).toMatchObject({ frontText: '안녕하세요', backText: 'こんにちは' });
    expect(r!.cards.every((c) => !/[a-z]/i.test(c.backText))).toBe(true);
  });

  it('родной — русский, изучает корейский: чтение остаётся', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['ko'] });
    expect(r!.cards[0].backText).toBe('Привет (annyeonghaseyo)');
  });

  it('форма слова в примере попадает в wordForm', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['ko'] });
    const eat = r!.cards.find((c) => c.frontText === '먹다');
    expect(eat).toMatchObject({ wordForm: '먹어요', backText: 'Есть (meokda)' });
  });

  it('порядок карточек сохраняется через createdAt', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['en'] });
    const times = r!.cards.map((c) => c.createdAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
  });

  it('id набора и карточек не повторяются', () => {
    const r = buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['en'] });
    const ids = [r!.set.id, ...r!.cards.map((c) => c.id)];
    expect(new Set(ids).size).toBe(21);
  });

  it('нечего собрать — null', () => {
    expect(buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: [] })).toBeNull();
    expect(buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: null })).toBeNull();
    expect(buildStarterSet({ ...base, nativeLanguage: null, targetLanguages: ['en'] })).toBeNull();
    expect(buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['ru'] })).toBeNull();
    expect(buildStarterSet({ ...base, nativeLanguage: 'ru', targetLanguages: ['pl'] })).toBeNull();
  });
});
