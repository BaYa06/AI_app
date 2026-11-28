/**
 * «Умные варианты (ИИ)» — правила экрана (plan/new/web_cabinet.md, Web 16–17).
 * ИИ готовит черновик, решает учитель: каждое предложение принимается вручную, сомнительный
 * вопрос нельзя открыть молча.
 */
import type { DraftItem } from '@/services/exam';

export type SmartReason = { code: string; text: string };

export type SmartSuggestion = {
  itemId: string;
  kind: 'gap' | 'choice';
  before: { prompt: string; options: string[] };
  after: { prompt: string; options: string[] };
  doubtful: boolean;
  reasons: SmartReason[];
};

export type SmartSkipped = { itemId: string; reason: string };

export type SmartResult = {
  suggestions: SmartSuggestion[];
  skipped: SmartSkipped[];
  usage: { used: number; limit: number; resetAt: string } | null;
};

type EditMark = { edited?: boolean; source?: 'ai' | 'teacher'; doubtful?: boolean };

export function editMark(item: DraftItem): EditMark | null {
  const e = (item.extra as { edit?: EditMark } | undefined)?.edit;
  return e && typeof e === 'object' ? e : null;
}

/** Принятые предложения ИИ, в которых остались сомнения: перед открытием экзамена спрашиваем */
export function pendingDoubtful(items: DraftItem[]): DraftItem[] {
  return items.filter((it) => {
    const m = editMark(it);
    return m?.source === 'ai' && m.doubtful === true;
  });
}

export function isEdited(item: DraftItem): boolean {
  return editMark(item)?.edited === true;
}

/** Почему ИИ ничего не предложил для вопроса — человеческим языком */
export function describeSkipped(reason: string): string {
  if (reason === 'long_answer') return 'Ответ длинный — варианты по смыслу ИИ не подберёт';
  if (reason === 'no_options') return 'У вопроса нет вариантов';
  if (reason === 'wrong_language') return 'ИИ предложил варианты на другом языке — отброшено';
  if (reason === 'no_word_in_sentence') return 'В предложении ИИ нет нужного слова — отброшено';
  if (reason.startsWith('sentence_')) return 'Предложение ИИ не подошло — отброшено';
  if (reason.startsWith('distractors_')) return 'Варианты ИИ не подошли — отброшено';
  return 'ИИ не справился с этим вопросом';
}

/** Сообщение об ошибке запроса к ИИ */
export function describeSmartError(status: number, serverError?: string): string {
  if (serverError === 'hourly_limit' || status === 429) {
    return 'Умные варианты можно запускать несколько раз в час, лимит исчерпан. Попробуй позже.';
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
