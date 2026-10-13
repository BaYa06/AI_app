/**
 * Общие части промптов для ИИ-функций.
 * Языки в приложении хранятся кодами ISO 639-1 ('de', 'ru', 'tr', 'zh'…) — модели нужны названия.
 */

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** 'de' → 'German'; не код — вернётся как есть; пусто — fallback */
export function languageName(code, fallback) {
  if (typeof code !== 'string' || !code.trim()) return fallback;
  const value = code.trim();
  if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value)) {
    try {
      return languageNames.of(value) || value;
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Как записывать слово на изучаемом языке (лицевая сторона карточки) и перевод (оборот).
 * Используется и при распознавании словарей, и при переводе.
 */
export const WORD_FORMAT_RULES = `Word format (front of the card, the language being learned):
- Keep the word exactly as written in the source: spelling, capitalisation, accents, diacritics.
- Nouns keep their article if the language has them (German der/die/das, French le/la/l'/les, Spanish el/la, Italian il/lo/la/l', Dutch de/het). Keep grammar notes that follow the word in the source, e.g. plural "der Hund, -e" or "laufen, lief, ist gelaufen".
- Keep set phrases and reflexive verbs whole ("sich freuen auf", "give up", "avoir besoin de").
- Chinese/Japanese/Korean: keep the original script; keep pinyin/kana/romanisation only if the source shows it next to the word.
Translation format (back of the card):
- Short and natural: the most common meaning; at most 2 meanings separated by ", " when the word really has two.
- Same part of speech and basic form: verbs in the infinitive (Russian — imperfective unless the source says otherwise), nouns in the nominative singular, adjectives in the base form.
- If the translation language has noun articles (German, French, Spanish, Italian, Dutch), add the article to translated nouns.
- No explanations, transcriptions or extra notes in the translation.`;

/** Правила извлечения словаря со страницы (фото, PDF, таблица, вставленный список) */
export function vocabExtractionRules(langFrom, langTo) {
  return `Vocabulary extraction rules:
- "front" = the word or phrase in ${langFrom}; "back" = its translation in ${langTo}.
- The source may list pairs in any order ("${langTo} — ${langFrom}" or a table with columns in any order): always put the ${langFrom} word in "front".
- If the source gives the translation in another language (e.g. English in a German–English textbook), translate the word into ${langTo} yourself.
- If a word has no translation in the source, translate it into ${langTo} yourself.
- Skip headers, page numbers, exercise instructions, numbering, example sentences (unless they are the vocabulary item itself) and duplicates.
- Only words that are actually in the source — never add your own.
${WORD_FORMAT_RULES}`;
}
