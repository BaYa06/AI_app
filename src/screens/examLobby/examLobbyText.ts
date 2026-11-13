/**
 * Подписи настройки живого теста (plan/new/teacher_cabinet.md, Teacher 39): обычный тест,
 * разминка по трудным словам и «Проверить на уроке» по словам задания.
 */
import { pluralize } from '@/utils';

/** Больше вопросов в одном тесте не задаём */
export const TEST_MAX_QUESTIONS = 50;

export function examLobbyWords(n: number): string {
  return `${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;
}

/** «Новый тест» / «Разминка · 6 слов» / «Ünite 4 · проверка задания» */
export function examLobbyTitle(params: {
  cardIds?: string[];
  purpose?: 'warmup';
  title?: string;
}): string {
  const n = Math.min(TEST_MAX_QUESTIONS, params.cardIds?.length ?? 0);
  if (n === 0) return 'Новый тест';
  if (params.purpose === 'warmup') return `Разминка · ${examLobbyWords(n)}`;
  return params.title || `Тест · ${examLobbyWords(n)}`;
}

/** Название теста в истории: у разминки — подпись «Разминка» перед набором */
export function historyTitle(item: { setTitle: string; purpose?: string | null }): string {
  return item.purpose === 'warmup' ? `Разминка · ${item.setTitle}` : item.setTitle;
}

/** Заголовок «Проверить на уроке» по заданию */
export function lessonCheckTitle(homeworkTitle: string): string {
  return `${homeworkTitle} · проверка задания`;
}
