/**
 * Итоги и разбор экзамена в вебе (plan/new/web_cabinet.md, Web 23–25): чистые правила — цвета баллов,
 * подозрительные слова, таблица CSV, решения по вопросу, проверка балла. Без React и сети; тесты —
 * src/web/__tests__/resultsLogic.test.ts. Тексты и пороги — как в телефонных ExamResultsScreen,
 * ExamQuestionScreen, ExamStudentScreen.
 */
import type {
  ExamResults,
  ExamStudentCard,
  QuestionReview,
  ResultStudent,
  ResultWord,
  Simulation,
  Verdict,
} from '@/services/exam';

export type ScoreTone = 'success' | 'neutral' | 'error';

/** От 75 — хорошо, от 50 — обычный цвет, ниже — красным (текстовые токены, не заливки) */
export function scoreTone(score: number): ScoreTone {
  if (score >= 75) return 'success';
  if (score >= 50) return 'neutral';
  return 'error';
}

export const VERDICT_ORDER: Verdict[] = ['correct', 'typo', 'wrong_form', 'wrong', 'none'];

export const VERDICT_CHIP: Record<Verdict, string> = {
  correct: 'Верно',
  typo: 'Опечатка',
  wrong_form: 'Не та форма',
  wrong: 'Ошибки',
  none: 'Нет ответа',
};

/** Ярлык у ошибки в разборе ученика */
export const VERDICT_LABEL: Record<string, string> = {
  wrong: 'ошибка',
  typo: 'опечатка',
  wrong_form: 'не та форма',
  none: 'без ответа',
  correct: 'верно',
};

/** Сколько у ученика слов не на «верно» */
export function errorCount(st: Pick<ResultStudent, 'counts'>): number {
  return st.counts.wrong + st.counts.typo + st.counts.wrong_form + st.counts.none;
}

/** Ученики, которым нужна домашка по ошибкам */
export function studentsWithErrors(data: Pick<ExamResults, 'students'>): number {
  return data.students.filter((s) => errorCount(s) > 0).length;
}

/** Слова, по которым ошиблись заметно чаще обычного (сервер ставит suspicious) */
export function suspiciousWords(words: ResultWord[]): ResultWord[] {
  return words.filter((w) => w.suspicious);
}

/** Слова от самых трудных: ниже доля верных — выше в списке; одинаково — по алфавиту */
export function sortWords(words: ResultWord[]): ResultWord[] {
  const rate = (w: ResultWord) => w.correct / Math.max(1, w.answered);
  return [...words].sort((a, b) => rate(a) - rate(b) || a.prompt.localeCompare(b.prompt, 'ru'));
}

export function distributionMax(dist: { n: number }[]): number {
  return Math.max(1, ...dist.map((d) => d.n));
}

// ─── CSV ────────────────────────────────────────────────────────────────

const cell = (v: string | number) => {
  const s = String(v);
  // Ячейка, начинающаяся с = + - @, в Excel считается формулой: имя ученика этим пользоваться не должно
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * Таблица итогов для Excel и Google Таблиц. Разделитель «;» и метка BOM — русская локаль Excel
 * иначе открывает всё в одной колонке и ломает кириллицу.
 */
export function resultsCsv(
  data: ExamResults,
  courseTitle: string,
  date = new Date(data.date)
): string {
  const sep = ';';
  const head = [
    `Экзамен: ${data.setTitle}`,
    courseTitle ? `Курс: ${courseTitle}` : null,
    `Дата: ${date.toLocaleDateString('ru-RU')}`,
    `Слов: ${data.totalQuestions}; средний балл: ${data.avgScore}`,
    '',
    [
      'Ученик',
      'Балл из 100',
      'Верно',
      'Ошибки',
      'Опечатка',
      'Не та форма',
      'Нет ответа',
      'Изменён учителем',
      'Комментарий',
      'Вышел из приложения',
    ].join(sep),
  ].filter((l) => l !== null) as string[];
  const rows = data.students.map((s) =>
    [
      s.name,
      s.score,
      s.counts.correct,
      s.counts.wrong,
      s.counts.typo,
      s.counts.wrong_form,
      s.counts.none,
      s.overridden ? `Да (было ${s.computedScore})` : 'Нет',
      s.comment || '',
      s.leftReason ? 'Да' : s.awayCount ? `Выходил ×${s.awayCount}` : 'Нет',
    ]
      .map(cell)
      .join(sep)
  );
  const absent = data.absent.map((a) => [a.name, 'не пришёл'].map(cell).join(sep));
  return '﻿' + [...head, ...rows, ...absent].join('\r\n');
}

/** Имя файла: «экзамен-Unit-4-2026-11-28.csv» — без символов, которые ломают имя файла */
export function csvFilename(setTitle: string, iso: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : 'итоги';
  const name = setTitle
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `экзамен-${name || 'без-названия'}-${day}.csv`;
}

// ─── Разбор вопроса ─────────────────────────────────────────────────────

export type Choice = 'void' | 'accept' | 'keep';

/** Что отмечено по умолчанию: то, что советуют подсказки, иначе — что доступно */
export function defaultChoice(data: Pick<QuestionReview, 'hints' | 'actions'>): Choice {
  const suggest = data.hints.find((h) => h.suggest)?.suggest;
  if (suggest === 'accept' && data.actions.accept) return 'accept';
  if (suggest === 'keep') return 'keep';
  if (data.actions.void) return 'void';
  return 'keep';
}

export function simulationFor(
  data: Pick<QuestionReview, 'actions'>,
  choice: Choice
): Simulation | null {
  if (choice === 'keep') return null;
  return choice === 'void' ? data.actions.void : data.actions.accept;
}

export type ChoiceView = { key: Choice; title: string; detail: string; disabled: boolean };

export function choiceViews(data: Pick<QuestionReview, 'item' | 'actions'>): ChoiceView[] {
  const { item, actions } = data;
  const answer = actions.accept?.answer;
  return [
    {
      key: 'void',
      title: item.voided ? 'Вопрос уже аннулирован' : 'Аннулировать вопрос',
      detail: actions.void
        ? `Вопрос не считается: 100 баллов делятся на оставшиеся вопросы. Балл изменится у ${actions.void.rows.length}.`
        : 'Вопрос уже не считается.',
      disabled: !actions.void,
    },
    {
      key: 'accept',
      title: answer ? `Засчитать «${answer}»` : 'Засчитать ответ',
      detail: actions.accept
        ? `Балл вырастет у ${actions.accept.rows.length} — у всех, кто ответил так же. Подходит, если на уроке давали такой перевод.`
        : 'Неверных ответов нет.',
      disabled: !actions.accept,
    },
    {
      key: 'keep',
      title: 'Оставить как есть',
      detail: 'Баллы не меняются. Предупреждение уйдёт из итогов.',
      disabled: false,
    },
  ];
}

/** Подпись принятого решения в журнале («Вопрос аннулирован», «Ответ «…» засчитан») */
export function decisionTitle(action: string, payload: Record<string, unknown>): string {
  if (action === 'void') return 'Вопрос аннулирован';
  if (action === 'accept') return `Ответ «${String(payload?.answer ?? '')}» засчитан`;
  if (action === 'keep') return 'Вопрос оставлен как есть';
  if (action === 'override') return 'Балл ученика изменён';
  return 'Решение учителя';
}

export function decisionNote(action: string): string {
  if (action === 'void')
    return 'Баллы пересчитаны. В разборе ученики увидят «вопрос аннулирован учителем».';
  if (action === 'accept') return 'Баллы пересчитаны. В разборе — «ответ засчитан учителем».';
  if (action === 'keep') return 'Предупреждение скрыто из итогов, баллы не менялись.';
  return '';
}

// ─── Карточка ученика ───────────────────────────────────────────────────

/** Балл от 0 до 100, целый; запятая вместо точки допустима. Иначе — null */
export function parseScore(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t));
  return n >= 0 && n <= 100 ? n : null;
}

/** Ошибки ученика: неверные, без отмены вопросов, которые учитель аннулировал */
export function mistakes(card: Pick<ExamStudentCard, 'items'>) {
  return (card.items ?? []).filter((i) => !i.voided && i.verdict !== 'correct');
}

/** Готовился заметно меньше класса: повторений меньше трети от среднего по классу */
export function lowPreparation(prep: ExamStudentCard['preparation']): boolean {
  return prep.reviews < prep.classReviews / 3;
}

/** Срок домашки: через N дней в 20:00 по часам браузера */
export function homeworkDue(now: Date = new Date(), days = 3): Date {
  const due = new Date(now.getTime() + days * 24 * 3600 * 1000);
  due.setHours(20, 0, 0, 0);
  return due;
}
