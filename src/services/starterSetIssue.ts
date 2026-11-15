/**
 * Выдать стартовый набор (plan/new/new_user_activation.md, Start 1.3, 2.5).
 *
 * Ученик получает набор сразу после выбора языков — по нему идёт первый урок. Сервер создаёт
 * набор один раз в жизни аккаунта; копия сразу кладётся в store, чтобы урок мог записывать
 * ответы, не дожидаясь загрузки данных. Сбой сети не мешает онбордингу — набора и урока нет.
 */
import { useCardsStore, useSetsStore } from '@/store';
import { log } from '@/utils/logger';
import { Analytics } from './analytics';
import { DatabaseService } from './DatabaseService';
import { NeonService } from './NeonService';
import { buildStarterSet, type StarterSet } from './StarterSetService';
import { rememberStarterSet } from './starterSetTracking';

export interface IssueStarterSetInput {
  userId: string;
  nativeLanguage?: string;
  targetLanguages?: string[];
  learningGoal?: string;
}

/** Набор создан сейчас — он же; null — не из чего собрать, уже выдан, учитель или сбой */
export async function issueStarterSet(input: IssueStarterSetInput): Promise<StarterSet | null> {
  const built = buildStarterSet(input);
  if (!built) return null;
  try {
    const res = await NeonService.createStarterSet({ set: built.set, cards: built.cards });
    if (res?.created !== true) return null;
    rememberStarterSet(built.set.id);
    Analytics.starterSetCreated({
      target: built.set.languageFrom ?? '',
      native: built.set.languageTo ?? '',
      theme: built.theme,
    });
    return built;
  } catch (e) {
    log.warn('StarterSet', 'Стартовый набор не создан', e);
    return null;
  }
}

/** Положить выданный набор в store (как гостевой импорт, shareImport.ts): на сервере он уже есть */
export function putStarterSetInStores(starter: StarterSet): void {
  const { set, cards } = starter;
  const setsState = useSetsStore.getState();
  useSetsStore.setState({
    sets: { ...setsState.sets, [set.id]: set },
    setsOrder: [set.id, ...setsState.setsOrder.filter((id) => id !== set.id)],
  });
  DatabaseService.saveSets();

  const cardsState = useCardsStore.getState();
  const nextCards = { ...cardsState.cards };
  for (const card of cards) nextCards[card.id] = card;
  useCardsStore.setState({
    cards: nextCards,
    cardsBySet: { ...cardsState.cardsBySet, [set.id]: cards.map((c) => c.id) },
  });
  DatabaseService.saveCards();
}
