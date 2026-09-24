/**
 * Человеко-понятные сообщения для причин отказа api/teacher.js — чтобы UI показывал разный
 * текст под "истёк"/"не найден"/"нет сети" и т.д. вместо одного и того же сообщения на всё
 * подряд. См. plan/teacher_access_fix_plan.md, пункт 13.
 */
import type { TeacherApiReason } from '@/services/NeonService';

export function describeTeacherApiReason(reason: TeacherApiReason): string {
  switch (reason) {
    case 'not_found':
      return 'Код не найден. Проверьте, что ввели его правильно.';
    case 'expired':
      return 'Этот код приглашения больше не действует — попросите учителя обновить его.';
    case 'own_course':
      return 'Нельзя присоединиться к своему же курсу.';
    case 'unauthorized':
      return 'Нужно войти в аккаунт, чтобы это сделать.';
    case 'forbidden':
      return 'Недостаточно прав для этого действия.';
    case 'rate_limited':
      return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
    case 'network':
      return 'Нет соединения с сервером. Проверьте интернет и попробуйте снова.';
    case 'bad_request':
    case 'unknown':
    default:
      return 'Что-то пошло не так. Попробуйте ещё раз.';
  }
}
