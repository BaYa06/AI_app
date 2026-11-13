import { describe, expect, it } from '@jest/globals';
import { examLobbyTitle, historyTitle, lessonCheckTitle } from '../examLobbyText';

describe('подписи живого теста', () => {
  it('обычный тест, разминка, проверка задания', () => {
    expect(examLobbyTitle({})).toBe('Новый тест');
    expect(examLobbyTitle({ cardIds: [] })).toBe('Новый тест');
    expect(examLobbyTitle({ cardIds: ['a', 'b', 'c', 'd', 'e', 'f'], purpose: 'warmup' })).toBe(
      'Разминка · 6 слов'
    );
    expect(examLobbyTitle({ cardIds: ['a'], title: lessonCheckTitle('Ünite 4') })).toBe(
      'Ünite 4 · проверка задания'
    );
    expect(examLobbyTitle({ cardIds: ['a', 'b'] })).toBe('Тест · 2 слова');
  });

  it('история: «Разминка» у purpose = warmup', () => {
    expect(historyTitle({ setTitle: 'Ünite 1', purpose: 'warmup' })).toBe('Разминка · Ünite 1');
    expect(historyTitle({ setTitle: 'Ünite 1', purpose: null })).toBe('Ünite 1');
    expect(historyTitle({ setTitle: 'Ünite 1' })).toBe('Ünite 1');
  });
});
