/**
 * Выдать стартовый набор после онбординга (plan/new/new_user_activation.md, Start 1.3).
 *
 * Набор создаётся на сервере до перезагрузки данных (DatabaseService.reloadRemoteDataForUser):
 * перезагрузка стирает наборы в store и берёт их с сервера, поэтому набор, созданный только
 * на устройстве, пропал бы. Сбой сети не мешает закончить онбординг — набора просто не будет.
 */
import { log } from '@/utils/logger';
import { Analytics } from './analytics';
import { NeonService } from './NeonService';
import { buildStarterSet } from './StarterSetService';
import { rememberStarterSet } from './starterSetTracking';

export interface IssueStarterSetInput {
  userId: string;
  nativeLanguage?: string;
  targetLanguages?: string[];
  learningGoal?: string;
}

/** true — набор создан сейчас; false — не из чего собрать, уже выдан, учитель или сбой */
export async function issueStarterSet(input: IssueStarterSetInput): Promise<boolean> {
  const built = buildStarterSet(input);
  if (!built) return false;
  try {
    const res = await NeonService.createStarterSet({ set: built.set, cards: built.cards });
    if (res?.created !== true) return false;
    rememberStarterSet(built.set.id);
    Analytics.starterSetCreated({
      target: built.set.languageFrom ?? '',
      native: built.set.languageTo ?? '',
      theme: built.theme,
    });
    return true;
  } catch (e) {
    log.warn('StarterSet', 'Стартовый набор не создан', e);
    return false;
  }
}
