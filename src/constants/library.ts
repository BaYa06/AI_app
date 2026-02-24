/**
 * Library constants — categories, languages, card count filters
 */

export interface LibraryCategoryDef {
  key: string;
  label: string;
  icon: string; // Ionicons name
}

export interface LibraryLanguageDef {
  key: string;       // e.g. 'en-ru'
  flag: string;      // e.g. '🇬🇧→🇷🇺'
  label: string;     // e.g. 'Английский'
  from: string;      // e.g. 'en'
  to: string;        // e.g. 'ru'
}

export interface CardCountRange {
  key: string;
  label: string;
  min: number;
  max: number | null; // null = no upper bound
}

export const LIBRARY_CATEGORIES: LibraryCategoryDef[] = [
  { key: 'grammar', label: 'Грамматика', icon: 'text-outline' },
  { key: 'vocab', label: 'Лексика', icon: 'book-outline' },
  { key: 'phrases', label: 'Фразы', icon: 'chatbubble-outline' },
  { key: 'travel', label: 'Путешествия', icon: 'airplane-outline' },
  { key: 'business', label: 'Бизнес', icon: 'briefcase-outline' },
  { key: 'medicine', label: 'Медицина', icon: 'medkit-outline' },
  { key: 'programming', label: 'IT', icon: 'code-outline' },
  { key: 'study', label: 'Экзамены', icon: 'school-outline' },
];

export const LIBRARY_LANGUAGES: LibraryLanguageDef[] = [
  { key: 'en-ru', flag: '🇬🇧→🇷🇺', label: 'Английский', from: 'en', to: 'ru' },
  { key: 'de-ru', flag: '🇩🇪→🇷🇺', label: 'Немецкий', from: 'de', to: 'ru' },
  { key: 'fr-ru', flag: '🇫🇷→🇷🇺', label: 'Французский', from: 'fr', to: 'ru' },
  { key: 'es-ru', flag: '🇪🇸→🇷🇺', label: 'Испанский', from: 'es', to: 'ru' },
];

export const CARD_COUNT_RANGES: CardCountRange[] = [
  { key: '1-50', label: '1-50', min: 1, max: 50 },
  { key: '51-100', label: '51-100', min: 51, max: 100 },
  { key: '101-200', label: '101-200', min: 101, max: 200 },
  { key: '200+', label: '200+', min: 201, max: null },
];

export const LIBRARY_SORT_OPTIONS = [
  { key: 'popular', label: 'Популярные' },
  { key: 'top_rated', label: 'По рейтингу' },
  { key: 'newest', label: 'Новые' },
] as const;

export type LibrarySortKey = typeof LIBRARY_SORT_OPTIONS[number]['key'];

/** Get category label by key */
export function getCategoryLabel(key: string): string {
  return LIBRARY_CATEGORIES.find(c => c.key === key)?.label ?? key;
}

/** Get language def by language_from + language_to */
export function getLanguageDef(from: string, to: string): LibraryLanguageDef | undefined {
  return LIBRARY_LANGUAGES.find(l => l.from === from && l.to === to);
}

/** Get language def by combined key (e.g. 'en-ru') */
export function getLanguageByKey(key: string): LibraryLanguageDef | undefined {
  return LIBRARY_LANGUAGES.find(l => l.key === key);
}

/** Format number with K suffix */
export function formatCount(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(n);
}

/** Format relative time in Russian */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
