/**
 * Карточка «Подключиться к учителю» на главной (plan/new/new_user_activation.md, Start 3.6):
 * ученик ответил «Да, у меня есть учитель» на онбординге. Крестик закрывает её навсегда.
 * На устройстве: это подсказка, а не данные — на другом телефоне её просто не будет.
 */
import { StorageService } from './StorageService';

const WANTS_KEY = 'join_teacher_card_wanted';
const CLOSED_KEY = 'join_teacher_card_closed';

export function setWantsTeacher(wants: boolean): void {
  StorageService.setBoolean(WANTS_KEY, wants);
}

export function shouldShowJoinTeacherCard(hasStudentCourse: boolean): boolean {
  if (hasStudentCourse) return false;
  return (
    StorageService.getBoolean(WANTS_KEY) === true && StorageService.getBoolean(CLOSED_KEY) !== true
  );
}

export function closeJoinTeacherCard(): void {
  StorageService.setBoolean(CLOSED_KEY, true);
}
