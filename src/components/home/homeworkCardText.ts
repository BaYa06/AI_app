/** Подписи карточки задания на главной ученика (Teacher 26) — без RN, чтобы проверять тестами. */
import {
  dueRelative,
  formatDue,
  hardWordsText,
  homeworkLeft,
  homeworkVolume,
  needsScoreRetry,
  type StudentHomework,
} from '@/services/homework';
import { pluralize } from '@/utils';

/** Новое — выдано меньше 2 дней назад и ничего ещё не засчитано */
const NEW_FOR_MS = 2 * 24 * 60 * 60 * 1000;

export function teacherInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/** «Задание от Ильяз агая» — имя как есть, без склонения */
export function homeworkCardTexts(hw: StudentHomework, now: number = Date.now()) {
  const left = homeworkLeft(hw);
  const done = hw.words - left;
  const retry = needsScoreRetry(hw);
  const { minutes } = homeworkVolume(left);
  return {
    from: `Задание от: ${hw.teacher || 'учителя'}`,
    title: hw.kind === 'review' ? `Повторить ${hardWordsText(hw.words)}` : `Выучить ${hw.title}`,
    due: `до: ${formatDue(hw.dueAt)} · ${dueRelative(hw.dueAt, now)}`,
    progress: retry
      ? `Все ${hw.words} ${pluralize(hw.words, 'слово', 'слова', 'слов')} пройдены · верно ${hw.score}%, нужно ${hw.minScore}%`
      : `${done} из ${hw.words} ${pluralize(hw.words, 'слова', 'слов', 'слов')}${left > 0 ? ` · осталось ${left} · ~${minutes} мин` : ''}`,
    button: retry ? 'Повторить трудные' : done === 0 ? 'Начать' : 'Продолжить',
    isNew: hw.creditedCardIds.length === 0 && now - Date.parse(hw.createdAt) < NEW_FOR_MS,
    pct: hw.words > 0 ? done / hw.words : 0,
  };
}
