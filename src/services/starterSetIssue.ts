/**
 * Выдать стартовый набор после онбординга (plan/new/new_user_activation.md, Start 1.3).
 *
 * Набор создаётся на сервере до перезагрузки данных (DatabaseService.reloadRemoteDataForUser):
 * перезагрузка стирает наборы в store и берёт их с сервера, поэтому набор, созданный только
 * на устройстве, пропал бы. Сбой сети не мешает закончить онбординг — набора просто не будет.
 */
import { log } from '@/utils/logger';
import { NeonService } from './NeonService';
import { buildStarterSet } from './StarterSetService';

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
    return res?.created === true;
  } catch (e) {
    log.warn('StarterSet', 'Стартовый набор не создан', e);
    return false;
  }
}
