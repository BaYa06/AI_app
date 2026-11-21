/**
 * App-wide language list — used for native/target language selection during onboarding
 * and displayed in Settings → Personal info. English and German are pinned first per
 * product decision (they're this app's most common learning pair).
 */

export interface AppLanguageDef {
  code: string;
  flag: string;
  label: string;
}

export const TOP_LANGUAGES: AppLanguageDef[] = [
  { code: 'en', flag: '🇬🇧', label: 'Английский' },
  { code: 'de', flag: '🇩🇪', label: 'Немецкий' },
  { code: 'ru', flag: '🇷🇺', label: 'Русский' },
  { code: 'es', flag: '🇪🇸', label: 'Испанский' },
  { code: 'fr', flag: '🇫🇷', label: 'Французский' },
  { code: 'it', flag: '🇮🇹', label: 'Итальянский' },
  { code: 'zh', flag: '🇨🇳', label: 'Китайский' },
  { code: 'ja', flag: '🇯🇵', label: 'Японский' },
  { code: 'ko', flag: '🇰🇷', label: 'Корейский' },
  { code: 'tr', flag: '🇹🇷', label: 'Турецкий' },
];

export const MAX_TARGET_LANGUAGES = 3;

// Named *ByCode* to avoid colliding with library.ts's getLanguageDef(from, to), which
// looks up a from/to pair rather than a single code — both are re-exported from constants/index.
export function getLanguageDefByCode(code: string): AppLanguageDef | undefined {
  return TOP_LANGUAGES.find((l) => l.code === code);
}

export function getLanguageLabel(code: string): string {
  return getLanguageDefByCode(code)?.label ?? code;
}

export function getLanguageFlag(code: string): string {
  return getLanguageDefByCode(code)?.flag ?? '🌐';
}

/** «английский» — название языка внутри фразы: «учишь английский» */
export function languageAccusative(code: string): string {
  return (getLanguageDefByCode(code)?.label ?? code).toLowerCase();
}

/** «на английском» без «на»: «Я говорю на русском». Все названия TOP_LANGUAGES кончаются на «-ий». */
export function languagePrepositional(code: string): string {
  return languageAccusative(code).replace(/ий$/, 'ом');
}
