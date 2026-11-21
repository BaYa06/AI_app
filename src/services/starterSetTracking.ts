/**
 * Начал ли ученик учить стартовый набор (plan/new/new_user_activation.md, Start 1.5).
 * id набора запоминается на устройстве при выдаче, первый ответ по его карточке —
 * событие starter_set_first_answer, один раз.
 */
import type { Card } from '@/types';
import { Analytics } from './analytics';
import { StorageService } from './StorageService';

const STARTER_SET_ID_KEY = 'starter_set_id';
const FIRST_ANSWER_LOGGED_KEY = 'starter_set_first_answer_logged';

export function rememberStarterSet(setId: string): void {
  StorageService.setString(STARTER_SET_ID_KEY, setId);
  StorageService.setBoolean(FIRST_ANSWER_LOGGED_KEY, false);
}

/** Вызывается на каждый записанный ответ; дешёвая проверка, событие — только первый раз */
export function noteStarterSetAnswer(card: Pick<Card, 'setId'>, mode: string): void {
  const starterId = StorageService.getString(STARTER_SET_ID_KEY);
  if (!starterId || card.setId !== starterId) return;
  if (StorageService.getBoolean(FIRST_ANSWER_LOGGED_KEY)) return;
  StorageService.setBoolean(FIRST_ANSWER_LOGGED_KEY, true);
  Analytics.starterSetFirstAnswer(mode);
}
