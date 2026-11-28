/**
 * Стартовый набор нового ученика (plan/new/new_user_activation.md, Start 1.2).
 *
 * Один набор на первом выбранном изучаемом языке с переводом на родной. Слова — понятия из
 * src/constants/starterWords.ts, любая пара языков собирается здесь на лету. Только сборка:
 * сохранение и правило «один раз в жизни аккаунта» — на сервере (Start 1.3).
 */
import { v4 as uuid } from 'uuid';
import {
  STARTER_THEMES,
  isStarterLang,
  type StarterLang,
  type StarterThemeId,
} from '@/constants/starterWords';
import type { Card, CardSet } from '@/types';

export interface StarterSet {
  theme: StarterThemeId;
  set: CardSet;
  cards: Card[];
}

export interface BuildStarterSetInput {
  userId: string;
  nativeLanguage?: string | null;
  /** Изучаемые языки из онбординга; набор — только на первом (он же основной) */
  targetLanguages?: readonly string[] | null;
  learningGoal?: string | null;
  now?: number;
  newId?: () => string;
}

/** «Для путешествий» → «Фразы для поездки», остальные цели и «не знаем» → «Первые слова» */
export function pickStarterTheme(learningGoal: string | null | undefined): StarterThemeId {
  return learningGoal === 'travel' ? 'travel' : 'first_words';
}

/** Родные языки с иероглифами или хангылем: латиница рядом с переводом читается как его транскрипция */
const NO_READING_NATIVE: ReadonlySet<StarterLang> = new Set(['zh', 'ja', 'ko']);

/**
 * Перевод на родном и чтение изучаемого слова для zh/ja/ko: «Привет (nǐ hǎo)».
 * Если родной сам zh/ja/ko, чтение не добавляем: «母 (eomeoni)» выглядит как
 * латинская транскрипция японского слова, а не корейского (отзыв ученика, 28.11.2026).
 */
function backText(nativeWord: string, reading: string | undefined, native: StarterLang): string {
  return reading && !NO_READING_NATIVE.has(native) ? `${nativeWord} (${reading})` : nativeWord;
}

/**
 * Собрать стартовый набор. null — набор не из чего собрать: язык не из TOP_LANGUAGES,
 * изучаемый не выбран или совпадает с родным.
 */
export function buildStarterSet(input: BuildStarterSetInput): StarterSet | null {
  const native = input.nativeLanguage;
  const target = input.targetLanguages?.[0];
  if (!isStarterLang(native) || !isStarterLang(target) || native === target) return null;

  const themeId = pickStarterTheme(input.learningGoal);
  const theme = STARTER_THEMES[themeId];
  const now = input.now ?? Date.now();
  const newId = input.newId ?? uuid;
  const setId = newId();

  const cards: Card[] = theme.concepts.map((concept, i) => {
    const studied = concept.words[target as StarterLang];
    const translation = concept.words[native as StarterLang];
    // +i мс: сервер сортирует карточки по created_at, порядок понятий сохраняется
    const createdAt = now + i;
    return {
      id: newId(),
      setId,
      frontText: studied.word,
      backText: backText(translation.word, studied.reading, native as StarterLang),
      example: studied.example,
      wordForm: studied.form,
      createdAt,
      updatedAt: createdAt,
      learningStep: 0,
      nextReviewDate: now,
      lastReviewDate: 0,
      status: 'new',
    };
  });

  const set: CardSet = {
    id: setId,
    userId: input.userId,
    courseId: null,
    title: theme.title,
    category: themeId === 'travel' ? 'travel' : 'languages',
    tags: [],
    languageFrom: target,
    languageTo: native,
    kind: 'language',
    isPublic: false,
    createdAt: now,
    updatedAt: now,
    cardCount: cards.length,
    newCount: cards.length,
    learningCount: 0,
    reviewCount: 0,
    masteredCount: 0,
    isFavorite: false,
    isArchived: false,
  };

  return { theme: themeId, set, cards };
}
