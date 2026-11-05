/**
 * Категории и языки редактора набора
 * (Clean 8 — перенесено из SetEditorScreen.tsx без изменений.)
 */
import { TOP_LANGUAGES } from '@/constants';
import type { SetCategory } from '@/types';

// icon — эмодзи-обложка, которая сохраняется в набор и публикацию (данные, не интерфейс).
// В интерфейсе категорию показываем иконкой lucide (CategoryIcon).
export const CATEGORY_OPTIONS: { value: SetCategory; label: string; icon: string }[] = [
  { value: 'general', label: 'Общие', icon: '⭐️' }, // brand:data
  { value: 'travel', label: 'Путешествия', icon: '✈️' }, // brand:data
  { value: 'food', label: 'Еда', icon: '🍽️' }, // brand:data
  { value: 'study', label: 'Учёба', icon: '📚' }, // brand:data
  { value: 'work', label: 'Работа', icon: '💼' }, // brand:data
  { value: 'grammar', label: 'Грамматика', icon: '✏️' }, // brand:data
  { value: 'custom', label: 'Свой вариант…', icon: '✨' }, // brand:data
];

// Единый источник — тот же список из 10 языков, что и в онбординге/настройках
// (см. constants/languages.ts), чтобы не расходиться друг с другом.
const ALL_LANGUAGES = TOP_LANGUAGES.map((l) => `${l.flag} ${l.label} (${l.code.toUpperCase()})`);
export const SOURCE_LANGUAGES = ALL_LANGUAGES;
export const TARGET_LANGUAGES = ALL_LANGUAGES;
export const DESCRIPTION_LIMIT = 200;

export const LANG_CODE_TO_LABEL: Record<string, string> = Object.fromEntries(
  TOP_LANGUAGES.map((l) => [l.code, `${l.flag} ${l.label} (${l.code.toUpperCase()})`])
);

export const LANG_LABEL_TO_CODE: Record<string, string> = Object.fromEntries(
  TOP_LANGUAGES.map((l) => [`${l.flag} ${l.label} (${l.code.toUpperCase()})`, l.code])
);
