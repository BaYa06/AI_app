/**
 * Разминка — живой тест по трудным словам (plan/new/teacher_cabinet.md, Teacher 40–41).
 * Чистые правила монитора (П3) и итогов (П4): слова, «усвоили / трудное», лучшие, не были.
 */
import { pluralize } from '@/utils';

/** Слово в ответе monitor / results (byCard) */
export interface CardStat {
  cardId: string;
  word: string;
  hint: string;
  answers: number;
  correct: number;
  /** 0..100; null — ответов ещё нет */
  correctRate: number | null;
}

/** С этой доли верных слово «усвоили» (макет П4) */
export const LEARNED_RATE = 80;

export type WordStatus = 'learned' | 'hard' | 'waiting';

export function wordStatus(card: Pick<CardStat, 'correctRate'>): WordStatus {
  if (card.correctRate === null) return 'waiting';
  return card.correctRate >= LEARNED_RATE ? 'learned' : 'hard';
}

export const WORD_STATUS_LABEL: Record<WordStatus, string> = {
  learned: 'усвоили',
  hard: 'трудное',
  waiting: 'ждём',
};

/** Слова по возрастанию доли верных: трудные сверху, без ответов — в конце */
export function sortCardStats(cards: CardStat[]): CardStat[] {
  return [...cards].sort(
    (a, b) => (a.correctRate ?? 101) - (b.correctRate ?? 101) || a.word.localeCompare(b.word)
  );
}

/** «12 из 15 ответили» */
export function answeredText(card: Pick<CardStat, 'answers'>, students: number): string {
  return `${Math.min(card.answers, students)} из ${students} ответили`;
}

/** Кто подключился, но ещё не дал ни одного ответа */
export function notAnswered<T extends { answered: number; done: boolean; name: string }>(
  students: T[]
): T[] {
  return students.filter((s) => s.answered === 0 && !s.done);
}

// ─── Итоги (П4) ───────────────────────────────────────────────

export interface WarmupParticipant {
  userId?: string;
  name: string;
  correct: number;
  total: number;
}

export interface WarmupResults {
  byCard?: CardStat[];
  absent?: Array<{ userId: string; name: string }>;
  participants: WarmupParticipant[];
  startedAt?: string | null;
  finishedAt?: string | null;
  date?: string;
}

/** Доля верных по всем ответам разминки, 0..100 */
export function warmupCorrectRate(cards: CardStat[]): number {
  const answers = cards.reduce((n, c) => n + c.answers, 0);
  const correct = cards.reduce((n, c) => n + c.correct, 0);
  return answers > 0 ? Math.round((correct / answers) * 100) : 0;
}

export function warmupMinutesSpent(r: Pick<WarmupResults, 'startedAt' | 'finishedAt'>): number {
  const from = r.startedAt ? Date.parse(r.startedAt) : NaN;
  const to = r.finishedAt ? Date.parse(r.finishedAt) : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.max(1, Math.round((to - from) / 60000));
}

/** «15 учеников · 6 слов · 5 минут» */
export function warmupSummaryLine(r: WarmupResults): string {
  const students = r.participants.length;
  const words = r.byCard?.length ?? 0;
  const minutes = warmupMinutesSpent(r);
  return [
    `${students} ${pluralize(students, 'ученик', 'ученика', 'учеников')}`,
    `${words} ${pluralize(words, 'слово', 'слова', 'слов')}`,
    minutes > 0 ? `${minutes} ${pluralize(minutes, 'минута', 'минуты', 'минут')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const byScore = (a: WarmupParticipant, b: WarmupParticipant) =>
  b.correct - a.correct || a.name.localeCompare(b.name);

/** «Лучшие» — до трёх с наибольшим числом верных */
export function bestStudents(list: WarmupParticipant[], n = 3): WarmupParticipant[] {
  return [...list].sort(byScore).slice(0, n);
}

/**
 * «Нужна помощь» — до трёх с наименьшим числом верных, кроме тех, кто уже в «Лучших»
 * и кто ответил верно на всё.
 */
export function needHelpStudents(list: WarmupParticipant[], n = 3): WarmupParticipant[] {
  const best = new Set(bestStudents(list, n));
  return [...list]
    .filter((p) => !best.has(p) && p.correct < p.total)
    .sort((a, b) => a.correct - b.correct || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** «Kanayım · 6/6» */
export function studentScoreText(p: WarmupParticipant): string {
  return `${p.name} · ${p.correct}/${p.total}`;
}

/** Трудные слова разминки — их предлагаем задать на дом */
export function hardWarmupCards(cards: CardStat[]): CardStat[] {
  return cards.filter((c) => wordStatus(c) === 'hard');
}

/** «7 не были на разминке» */
export function absentTitle(n: number): string {
  return `${n} ${pluralize(n, 'не был', 'не были', 'не были')} на разминке`;
}

const DAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** «Задать 3 трудных слова к пн»; урока в расписании нет — без дня */
export function assignHardLabel(n: number, lessonDate: Date | null): string {
  const words = `${n} ${pluralize(n, 'трудное слово', 'трудных слова', 'трудных слов')}`;
  return lessonDate ? `Задать ${words} к ${DAY_SHORT[lessonDate.getDay()]}` : `Задать ${words}`;
}
