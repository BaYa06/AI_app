/**
 * Быстрый тест в вебе (plan/new/web_cabinet.md, Web 26): настройка, итоги, таблица. Чистые функции.
 * Быстрый тест — это движок 1: вопросы ученик получает по набору, время — секунды на вопрос,
 * оценки учителя и разбор вопросов нет. Для оценки в 100 баллов и разбора — экзамен.
 */
import { pluralize } from '@/utils';

export const QUICK_MIN_QUESTIONS = 4;
export const QUICK_MAX_QUESTIONS = 50;
export const QUICK_TIMES = [
  { value: 0, label: 'Без лимита' },
  { value: 10, label: '10 с' },
  { value: 20, label: '20 с' },
  { value: 30, label: '30 с' },
] as const;

export type QuickParticipant = {
  userId?: string;
  name: string;
  score: number;
  correct: number;
  total: number;
  finished: boolean;
  leftReason?: string | null;
  awayCount?: number;
};

export type QuickResults = {
  setTitle: string;
  date: string;
  totalQuestions: number;
  avgScore: number;
  participants: QuickParticipant[];
  hardestCards: { word: string; hint: string; missed: number; total: number }[];
  absent?: { userId: string; name: string }[];
};

export type QuickHistoryItem = {
  sessionId: string;
  setTitle: string | null;
  finishedAt: string | null;
  participantCount: number;
  avgScore: number;
  questionCount: number;
  testMode: string;
  purpose?: string | null;
};

/** Сколько вопросов можно задать: из набора, но не больше предела и не меньше минимума */
export function quickMaxQuestions(setCards: number): number {
  return Math.max(
    QUICK_MIN_QUESTIONS,
    Math.min(QUICK_MAX_QUESTIONS, setCards || QUICK_MAX_QUESTIONS)
  );
}

export function clampQuestions(n: number, setCards: number): number {
  return Math.max(
    QUICK_MIN_QUESTIONS,
    Math.min(quickMaxQuestions(setCards), Math.round(n) || QUICK_MIN_QUESTIONS)
  );
}

/** «Всего 5 мин» или «Без лимита времени» */
export function totalTimeText(perQuestion: number, questions: number): string {
  if (!perQuestion) return 'Без лимита времени';
  const sec = perQuestion * questions;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min === 0) return `Всего ${rest} с`;
  return `Всего ${min} мин${rest ? ` ${rest} с` : ''}`;
}

export function quickSetupProblem(input: { setId: string | null; cards: number }): string | null {
  if (!input.setId) return 'Выбери набор.';
  if (input.cards < QUICK_MIN_QUESTIONS)
    return `В наборе меньше ${QUICK_MIN_QUESTIONS} слов — тест не из чего собрать.`;
  return null;
}

/** Место в таблице: ученики уже отсортированы сервером по баллу; одинаковый балл — одинаковое место */
export function ranks(list: { score: number }[]): number[] {
  const out: number[] = [];
  list.forEach((p, i) => {
    out.push(i > 0 && p.score === list[i - 1].score ? out[i - 1] : i + 1);
  });
  return out;
}

const LEFT: Record<string, string> = {
  background: 'Вышел из приложения',
  relaunch: 'Перезапустил приложение',
  manual: 'Завершил сам',
};

export function leftLabel(reason: string | null | undefined): string {
  return reason ? LEFT[reason] || 'Вышел из теста' : '';
}

/** Название строки в «Быстрых тестах» курса: «Unit 4 · 20 слов · 12 ноября» */
export function historyTitle(it: QuickHistoryItem): string {
  const date = it.finishedAt
    ? new Date(it.finishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : '';
  return [
    it.setTitle || 'Тест',
    `${it.questionCount} ${pluralize(it.questionCount, 'слово', 'слова', 'слов')}`,
    date,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Только быстрые тесты (у экзаменов своя страница итогов) */
export function onlyQuick(items: QuickHistoryItem[]): QuickHistoryItem[] {
  return items.filter((i) => i.testMode !== 'exam');
}

const cell = (v: string | number) => {
  const s = String(v);
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Таблица для Excel (BOM и «;» — как у итогов экзамена) */
export function quickCsv(data: QuickResults, courseTitle: string): string {
  const sep = ';';
  const lines: string[] = [
    `Тест: ${data.setTitle}`,
    ...(courseTitle ? [`Курс: ${courseTitle}`] : []),
    `Дата: ${new Date(data.date).toLocaleDateString('ru-RU')}`,
    `Вопросов: ${data.totalQuestions}; средний результат: ${data.avgScore}%`,
    '',
    [
      'Место',
      'Ученик',
      'Результат (%)',
      'Верно',
      'Всего',
      'Завершил',
      'Досрочный выход',
      'Коротких выходов',
    ].join(sep),
  ];
  const place = ranks(data.participants);
  data.participants.forEach((p, i) =>
    lines.push(
      [
        place[i],
        p.name,
        p.score,
        p.correct,
        p.total,
        p.finished ? 'Да' : 'Нет',
        p.leftReason ? leftLabel(p.leftReason) : 'Нет',
        p.awayCount || 0,
      ]
        .map(cell)
        .join(sep)
    )
  );
  (data.absent ?? []).forEach((a) => lines.push([a.name, 'не пришёл'].map(cell).join(sep)));
  if (data.hardestCards.length > 0) {
    lines.push('', 'Самые трудные слова', ['Слово', 'Подсказка', 'Ошибок', 'Всего'].join(sep));
    data.hardestCards.forEach((c) =>
      lines.push([c.word, c.hint, c.missed, c.total].map(cell).join(sep))
    );
  }
  return '﻿' + lines.join('\r\n');
}
