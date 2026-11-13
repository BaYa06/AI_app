/**
 * Экран задания ученика (plan/new/teacher_cabinet.md, Teacher 27; макет У3) — подписи и кнопки.
 * Без RN, чтобы проверять тестами.
 */
import {
  dueRelative,
  formatDue,
  homeworkLeft,
  homeworkVolume,
  needsScoreRetry,
  type StudentHomework,
} from '@/services/homework';
import { pluralize } from '@/utils';

const words = (n: number) => `${n} ${pluralize(n, 'слово', 'слова', 'слов')}`;

export interface HomeworkScreenTexts {
  title: string;
  subtitle: string;
  due: string;
  dueHint: string;
  overdue: boolean;
  allWords: { label: string; value: string; done: boolean };
  score: { label: string; value: string; done: boolean } | null;
  rule: string;
  group: string;
  primary: { title: string; prefer: 'learn' | 'review' } | null;
  secondary: { title: string; prefer: 'learn' | 'review' } | null;
}

export function homeworkScreenTexts(
  hw: StudentHomework,
  now: number = Date.now()
): HomeworkScreenTexts {
  const left = homeworkLeft(hw);
  const done = hw.words - left;
  const wrong = hw.wrongCardIds.length;
  const retry = needsScoreRetry(hw);
  const overdue = Date.parse(hw.dueAt) < now;
  const learnTitle = `Учить ${left} ${pluralize(left, 'новое', 'новых', 'новых')} · ~${homeworkVolume(left).minutes} мин`;
  const reviewTitle = `Повторить ${wrong} ${pluralize(wrong, 'трудное', 'трудных', 'трудных')}`;

  let primary: HomeworkScreenTexts['primary'] = null;
  let secondary: HomeworkScreenTexts['secondary'] = null;
  if (!hw.submitted) {
    if (left > 0) {
      primary = { title: learnTitle, prefer: 'learn' };
      if (wrong > 0) {
        secondary = { title: `Сначала ${reviewTitle.toLowerCase()}`, prefer: 'review' };
      }
    } else if (retry || wrong > 0) {
      primary = { title: reviewTitle, prefer: 'review' };
    }
  }

  return {
    title: `Задание: ${hw.title}`,
    subtitle: [hw.teacher ? `от: ${hw.teacher}` : null, hw.courseTitle].filter(Boolean).join(' · '),
    due: `до: ${formatDue(hw.dueAt)}`,
    dueHint: overdue
      ? 'Срок прошёл — сдать можно и сейчас, учитель увидит «с опозданием»'
      : `Осталось: ${dueRelative(hw.dueAt, now)}`,
    overdue,
    allWords: {
      label: `Пройти все ${words(hw.words)}`,
      value: `${done}/${hw.words}`,
      done: left === 0,
    },
    score:
      hw.minScore !== null
        ? {
            label: `Верно от ${hw.minScore}%`,
            value: hw.score === null ? '—' : `у тебя ${hw.score}%`,
            done: hw.score !== null && hw.score >= hw.minScore,
          }
        : null,
    rule: 'Засчитываются только законченные сессии «Изучить» и «Повторить»',
    group: `В группе уже сдали ${hw.group.submitted} из ${hw.group.assigned}`,
    primary,
    secondary,
  };
}
