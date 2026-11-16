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
import { CACHE_OWNER_KEY } from './localCache';
import { StorageService } from './StorageService';
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

/**
 * Положить выданный набор в store (как гостевой импорт, shareImport.ts): на сервере он уже есть.
 * Владелец кэша на устройстве — этот пользователь: у нового его ещё нет (ставится после первой
 * загрузки данных), и без него урок дня не запомнил бы слова первого урока (Start 2.7).
 */
export function putStarterSetInStores(starter: StarterSet): void {
  const { set, cards } = starter;
  StorageService.setString(CACHE_OWNER_KEY, set.userId);
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

/**
 * Стартовый набор ещё одного изучаемого языка — «Хочешь начать и немецкий?» (Start 4.3).
 * Сервер выдаёт по одному на язык из онбординга, кроме основного.
 */
export async function issueExtraStarterSet(input: {
  userId: string;
  nativeLanguage: string;
  language: string;
}): Promise<StarterSet | null> {
  const built = buildStarterSet({
    userId: input.userId,
    nativeLanguage: input.nativeLanguage,
    targetLanguages: [input.language],
  });
  if (!built) return null;
  try {
    const res = await NeonService.createStarterSet({
      set: built.set,
      cards: built.cards,
      extra: true,
    });
    if (res?.created !== true) return null;
    putStarterSetInStores(built);
    Analytics.starterSetCreated({
      target: input.language,
      native: input.nativeLanguage,
      theme: `${built.theme}_extra`,
    });
    return built;
  } catch (e) {
    log.warn('StarterSet', 'Набор второго языка не создан', e);
    return null;
  }
}
