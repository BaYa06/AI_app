/**
 * Лобби и монитор экзамена (plan/new/web_cabinet.md, Web 18–21): чистые правила — таймер, статусы
 * учеников, «нужно внимание», данные для проектора. Без React и сети, проверяются тестами.
 */
import { pluralize } from '@/utils';
import type { ExamEvent } from '@/services/exam';

export type Participant = {
  userId: string;
  name: string;
  initials?: string;
  answered: number;
  total: number;
  done: boolean;
  /** Почему вышел досрочно: background | manual | …; null — не выходил */
  leftReason?: string | null;
  awayCount?: number;
  /** Сейчас вне приложения */
  away?: boolean;
  clientExitControl?: boolean;
};

export type Monitor = {
  status: 'waiting' | 'active' | 'finished' | string;
  startedAt: string | null;
  questionCount: number;
  exitControl: boolean;
  engine?: number;
  /** Экзамен: общий срок; быстрый тест — время на вопрос в timePerQuestion */
  durationSec?: number | null;
  timePerQuestion?: number;
  paused?: boolean;
  pausedAt?: string | null;
  pausedTotalSec?: number;
  serverNow?: string;
  participants: Participant[];
};

/** Таймер красный, когда осталось не больше трёх минут (решение пользователя 17.11.2026) */
export const WARN_SEC = 180;

/** Сколько секунд осталось общего срока на момент ответа сервера; null — срока нет или экзамен не начат */
export function timeLeftSec(
  m: Pick<Monitor, 'durationSec' | 'startedAt' | 'serverNow' | 'pausedAt' | 'pausedTotalSec'>
): number | null {
  if (!m.durationSec || !m.startedAt) return null;
  const now = m.serverNow ? new Date(m.serverNow).getTime() : Date.now();
  const started = new Date(m.startedAt).getTime();
  if (Number.isNaN(now) || Number.isNaN(started)) return null;
  const pausedNow = m.pausedAt ? now - new Date(m.pausedAt).getTime() : 0;
  const elapsed = Math.floor((now - started - pausedNow) / 1000 - (m.pausedTotalSec || 0));
  return Math.max(0, m.durationSec - elapsed);
}

/**
 * Быстрый тест (движок 1): общее время = секунды на вопрос × число вопросов, считаем с момента старта.
 * Пауз у такого теста нет. null — без лимита времени или тест ещё не начат.
 */
export function quickTimeLeftSec(
  m: Pick<Monitor, 'timePerQuestion' | 'questionCount' | 'startedAt' | 'serverNow'>
): number | null {
  if (!m.timePerQuestion || !m.questionCount || !m.startedAt) return null;
  const now = m.serverNow ? new Date(m.serverNow).getTime() : Date.now();
  const started = new Date(m.startedAt).getTime();
  if (Number.isNaN(now) || Number.isNaN(started)) return null;
  const elapsed = Math.floor((now - started) / 1000);
  return Math.max(0, m.timePerQuestion * m.questionCount - elapsed);
}

/** «6:54», «0:05», «12:00» — минуты без нуля впереди */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function isTimeWarning(sec: number | null): boolean {
  return sec !== null && sec <= WARN_SEC;
}

export type StudentState = 'left' | 'away' | 'done' | 'working' | 'waiting';

export function studentState(p: Participant): StudentState {
  if (p.leftReason) return 'left';
  if (p.done) return 'done';
  if (p.away) return 'away';
  if (p.answered <= 0) return 'waiting';
  return 'working';
}

export const STATE_LABEL: Record<StudentState, string> = {
  left: 'Вышел',
  away: 'Вне приложения',
  done: 'Сдал',
  working: 'Пишет',
  waiting: 'Не начал',
};

export function progressPct(p: Participant): number {
  if (!p.total) return 0;
  return Math.max(0, Math.min(100, Math.round((p.answered / p.total) * 100)));
}

export type Summary = { total: number; working: number; done: number; left: number; away: number };

export function summarize(list: Participant[]): Summary {
  const out: Summary = { total: list.length, working: 0, done: 0, left: 0, away: 0 };
  for (const p of list) {
    const st = studentState(p);
    if (st === 'left') out.left++;
    else if (st === 'done') out.done++;
    else {
      out.working++;
      if (st === 'away') out.away++;
    }
  }
  return out;
}

/** Все сдали и никто не вышел досрочно: экзамен можно закрывать сам (вышедшему учитель может разрешить продолжить) */
export function shouldAutoFinish(list: Participant[]): boolean {
  return list.length > 0 && list.every((p) => p.done) && !list.some((p) => p.leftReason);
}

const LEFT_TEXT: Record<string, string> = {
  background: 'вышел из приложения',
  manual: 'завершил сам',
  split: 'разделил экран',
};

export function leftReasonText(reason: string | null | undefined): string {
  return (reason && LEFT_TEXT[reason]) || 'вышел из экзамена';
}

export type Problem = {
  key: string;
  userId: string | null;
  name: string;
  kind: 'left' | 'away' | 'old_version' | 'away_often';
  text: string;
};

const OFTEN = 2;

/**
 * Что нужно увидеть учителю: вышел, сейчас вне приложения, часто выходил, не смог войти со старой версией.
 * Это видит только учитель — в окно проектора такие данные не попадают.
 */
export function problems(list: Participant[], events: ExamEvent[]): Problem[] {
  const out: Problem[] = [];
  for (const p of list) {
    if (p.leftReason) {
      out.push({
        key: `left-${p.userId}`,
        userId: p.userId,
        name: p.name,
        kind: 'left',
        text: leftReasonText(p.leftReason),
      });
    } else if (p.away && !p.done) {
      out.push({
        key: `away-${p.userId}`,
        userId: p.userId,
        name: p.name,
        kind: 'away',
        text: 'сейчас вне приложения',
      });
    } else if ((p.awayCount || 0) >= OFTEN && !p.done) {
      out.push({
        key: `often-${p.userId}`,
        userId: p.userId,
        name: p.name,
        kind: 'away_often',
        text: `выходил из приложения ${p.awayCount} ${pluralize(p.awayCount || 0, 'раз', 'раза', 'раз')}`,
      });
    }
  }
  out.push(...oldVersionProblems(events, new Set(list.map((p) => p.userId))));
  return out;
}

/** Кто пытался войти со старой версией и всё ещё не в списке участников */
export function oldVersionProblems(events: ExamEvent[], joined: Set<string>): Problem[] {
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (const e of events) {
    if (e.kind !== 'old_version' || !e.userId || joined.has(e.userId) || seen.has(e.userId))
      continue;
    seen.add(e.userId);
    out.push({
      key: `old-${e.userId}`,
      userId: e.userId,
      name: e.name,
      kind: 'old_version',
      text: 'не смог войти: нужно обновить Flashly',
    });
  }
  return out;
}

/** Подпись события журнала для учителя */
export function eventText(e: ExamEvent): string {
  switch (e.kind) {
    case 'old_version':
      return `${e.name}: не смог войти, старая версия приложения`;
    case 'away': {
      const reason = (e.detail as { reason?: string }).reason;
      return `${e.name}: ушёл из приложения${reason === 'split' ? ' (разделил экран)' : ''}`;
    }
    case 'back': {
      const sec = Number((e.detail as { sec?: number }).sec);
      return `${e.name}: вернулся${Number.isFinite(sec) && sec > 0 ? ` через ${sec} с` : ''}`;
    }
    case 'paused':
      return 'Пауза для всех';
    case 'resumed':
      return 'Экзамен продолжился';
    case 'extra_time': {
      const min = Number((e.detail as { minutes?: number }).minutes) || 2;
      return `${e.name}: добавили ${min} ${pluralize(min, 'минуту', 'минуты', 'минут')}`;
    }
    case 'reinstated':
      return `${e.name}: разрешили продолжить`;
    default:
      return e.name;
  }
}

/** Клавиши монитора: пробел — пауза, P — проектор; в полях ввода и с модификаторами не срабатывают */
export type HotkeyAction = 'pause' | 'projector' | null;

export function hotkeyAction(ev: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  targetTag?: string;
}): HotkeyAction {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;
  const tag = (ev.targetTag || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return null;
  if (ev.key === ' ' || ev.key === 'Spacebar') return 'pause';
  if (ev.key === 'p' || ev.key === 'P' || ev.key === 'з' || ev.key === 'З') return 'projector';
  return null;
}
