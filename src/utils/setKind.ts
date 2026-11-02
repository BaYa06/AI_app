/**
 * Тип набора (plan/new/set_kind.md): язык или предмет.
 * Пустой тип (старые наборы, наборы книг) ведёт себя как язык.
 */
import type { CardSet, SetKind } from '../types';

export function isSubjectSet(set: Pick<CardSet, 'kind'> | null | undefined): boolean {
  return set?.kind === 'subject';
}

/** Значение с сервера → тип набора; NULL и неизвестное → undefined (= язык). */
export function parseSetKind(value: unknown): SetKind | undefined {
  return value === 'language' || value === 'subject' ? value : undefined;
}

/** Языковые режимы — для предмета их нет (Собери слово, Аудио, Слово в контексте). */
const LANGUAGE_ONLY_MODES: readonly string[] = ['wordBuilder', 'audio', 'contextFill'];

/**
 * Можно ли запускать режим по этим наборам. Главная собирает карточки из разных наборов курса —
 * языковой режим доступен, только если среди них нет ни одного предметного.
 */
export function isModeAllowedForSets(mode: string, sets: ReadonlyArray<Pick<CardSet, 'kind'> | null | undefined>): boolean {
  return !LANGUAGE_ONLY_MODES.includes(mode) || !sets.some(isSubjectSet);
}
