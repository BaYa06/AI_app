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
