/**
 * Список экзаменов: группы, подписи, статус (plan/new/web_cabinet.md, Web 12). Чистые функции.
 */
import { pluralize } from '@/utils';
import type { ExamListItem } from '@/services/exam';

export type ExamGroup = { key: 'running' | 'draft' | 'done'; title: string; items: ExamListItem[] };

const byCreatedDesc = (a: ExamListItem, b: ExamListItem) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/** Идущие (лобби и экзамен) — сверху, затем черновики, затем прошедшие; пустые группы не показываем */
export function examGroups(items: ExamListItem[]): ExamGroup[] {
  const running = items.filter((i) => i.status === 'waiting' || i.status === 'active');
  const draft = items.filter((i) => i.status === 'draft');
  const done = items.filter((i) => i.status === 'finished');
  return (
    [
      { key: 'running', title: 'Идут сейчас', items: running },
      { key: 'draft', title: 'Черновики', items: draft },
      { key: 'done', title: 'Прошедшие', items: done },
    ] as ExamGroup[]
  )
    .map((g) => ({ ...g, items: [...g.items].sort(byCreatedDesc) }))
    .filter((g) => g.items.length > 0);
}

export function statusBadge(status: string): {
  label: string;
  tone: 'neutral' | 'primary' | 'success';
} {
  if (status === 'draft') return { label: 'Черновик', tone: 'neutral' };
  if (status === 'waiting') return { label: 'Ждёт учеников', tone: 'primary' };
  if (status === 'active') return { label: 'Идёт', tone: 'primary' };
  if (status === 'finished') return { label: 'Завершён', tone: 'success' };
  return { label: 'Экзамен', tone: 'neutral' };
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** «20 слов · 10 мин · 31 ученик · средний балл 74 · 19 ноября» */
export function examMeta(it: ExamListItem): string {
  const parts = [
    `${it.questionCount} ${pluralize(it.questionCount, 'слово', 'слова', 'слов')}`,
    it.durationSec > 0 ? `${Math.round(it.durationSec / 60)} мин` : null,
  ];
  if (it.status === 'finished') {
    parts.push(
      `${it.participantCount} ${pluralize(it.participantCount, 'ученик', 'ученика', 'учеников')}`
    );
    if (it.participantCount > 0) parts.push(`средний балл ${it.avgScore}`);
    parts.push(shortDate(it.finishedAt));
  } else if (it.status === 'active' || it.status === 'waiting') {
    parts.push(`${it.participantCount} в тесте`);
    if (it.code) parts.push(`код ${it.code}`);
  } else {
    parts.push(`создан ${shortDate(it.createdAt)}`);
  }
  return parts.filter(Boolean).join(' · ');
}
