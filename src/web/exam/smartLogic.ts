/**
 * ИИ в экзамене (решение пользователя 28.11.2026): только «вставь слово» — предложение, форма слова и
 * неверные варианты пишутся при сборке автоматически (api/_ai/exam-gap.js). Остальные форматы — код.
 */
import type { DraftItem } from '@/services/exam';
import { pluralize } from '@/utils';

type EditMark = { edited?: boolean; source?: 'ai' | 'teacher'; doubtful?: boolean };

export function editMark(item: DraftItem): EditMark | null {
  const e = (item.extra as { edit?: EditMark } | undefined)?.edit;
  return e && typeof e === 'object' ? e : null;
}

/** Состояние вопроса «вставь слово», который пишет ИИ: pending — ждёт ИИ, done — написан, fallback — заменён письмом */
export function aiState(item: DraftItem): 'pending' | 'done' | 'fallback' | null {
  const v = (item.extra as { ai?: unknown } | undefined)?.ai;
  return v === 'pending' || v === 'done' || v === 'fallback' ? v : null;
}

/** Вопросы, которые ИИ ещё не дописал: экзамен с ними открыть нельзя */
export function aiPendingItems(items: DraftItem[]): DraftItem[] {
  return items.filter((it) => aiState(it) === 'pending');
}

export function isEdited(item: DraftItem): boolean {
  return editMark(item)?.edited === true;
}

/** Сообщение об ошибке запроса к ИИ */
export function describeSmartError(status: number, serverError?: string): string {
  if (serverError === 'hourly_limit' || status === 429) {
    return 'ИИ можно запускать ограниченное число раз в час, лимит исчерпан. Попробуй позже или замени эти вопросы письменными.';
  }
  if (status === 409) return 'Экзамен уже начался — менять вопросы нельзя.';
  if (status === 403) return 'Это не твой экзамен.';
  if (status === 0) return 'Нет связи. Проверь интернет и попробуй ещё раз.';
  return 'ИИ сейчас не отвечает. Попробуй ещё раз через минуту.';
}

/** Сообщение об ошибке правки вопроса (коды из api/_exam/edit.js) */
export function describeEditError(code: string | undefined, index?: number): string {
  const n = typeof index === 'number' ? ` (вариант ${index + 1})` : '';
  switch (code) {
    case 'empty':
      return `Поле пустое${n}.`;
    case 'too_long':
      return `Слишком длинно${n}.`;
    case 'same_as_answer':
      return `Этот вариант совпадает с правильным ответом${n}.`;
    case 'duplicate':
      return `Такой вариант уже есть${n}.`;
    case 'wrong_count':
      return 'Число вариантов менять нельзя.';
    case 'no_gap':
      return 'В предложении нужен пропуск _____.';
    case 'many_gaps':
      return 'Пропуск должен быть один.';
    case 'too_short':
      return 'Предложение слишком короткое.';
    case 'answer_in_sentence':
      return 'Правильный ответ не должен встречаться в предложении — это подсказка.';
    case 'not_editable':
      return 'Этот вопрос править нельзя.';
    default:
      return 'Не получилось сохранить. Попробуй ещё раз.';
  }
}

/** «Готово: 3 вопроса. Для 1 слова ИИ не написал надёжный вопрос — там письменный ответ.» */
export function gapAiSummary(written: number, fallback: number): string {
  const parts: string[] = [];
  if (written > 0)
    parts.push(`Готово: ${written} ${pluralize(written, 'вопрос', 'вопроса', 'вопросов')}.`);
  if (fallback > 0)
    parts.push(
      `Для ${fallback} ${pluralize(fallback, 'слова', 'слов', 'слов')} ИИ не написал надёжный вопрос — там письменный ответ.`
    );
  else parts.push('Проверь предложения и при желании поправь карандашом.');
  return parts.join(' ');
}
