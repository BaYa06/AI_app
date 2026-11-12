/**
 * Наборы курса со словами для окна «Выбор слов» (Teacher 19). Слова — из хранилища карточек;
 * набора, чьи слова ещё не загружены (юнит учебника), догружаем с сервера при открытии окна.
 */
import { useEffect, useMemo, useState } from 'react';
import { isSetInCourse, useCardsStore, useSetsStore } from '@/store';
import { NeonService } from '@/services/NeonService';
import type { Card } from '@/types';
import { sortPickerSets, type PickerSet } from './wordPicker';

const toWord = (c: Card) => ({ id: c.id, front: c.frontText || '', back: c.backText || '' });

export function useCoursePickerSets(courseId: string, active: boolean): PickerSet[] | null {
  const sets = useSetsStore((s) => s.sets);
  const cards = useCardsStore((s) => s.cards);
  const cardsBySet = useCardsStore((s) => s.cardsBySet);
  const [loaded, setLoaded] = useState<Record<string, Card[]>>({});
  const [loading, setLoading] = useState(false);

  const courseSets = useMemo(
    () => Object.values(sets).filter((s) => isSetInCourse(s, courseId)),
    [sets, courseId]
  );

  // Догрузить слова наборов, которых нет в хранилище
  useEffect(() => {
    if (!active) return;
    const missing = courseSets.filter(
      (s) => (cardsBySet[s.id]?.length ?? 0) === 0 && s.cardCount > 0 && !loaded[s.id]
    );
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(
      missing.map((s) =>
        NeonService.loadCardsBySet(s.id)
          .then((list) => [s.id, list] as const)
          .catch(() => [s.id, [] as Card[]] as const)
      )
    ).then((pairs) => {
      if (cancelled) return;
      setLoaded((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, courseSets]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (loading) return null;
    const list: PickerSet[] = courseSets
      .map((s) => {
        const own = (cardsBySet[s.id] || []).map((id) => cards[id]).filter((c): c is Card => !!c);
        const words = (own.length > 0 ? own : loaded[s.id] || []).map(toWord);
        return { id: s.id, title: s.title, words };
      })
      .filter((s) => s.words.length > 0);
    return sortPickerSets(list);
  }, [courseSets, cards, cardsBySet, loaded, loading]);
}
