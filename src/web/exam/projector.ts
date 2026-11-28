/**
 * Окно проектора (plan/new/web_cabinet.md, Web 19). Окно учителя шлёт ему готовое состояние через
 * BroadcastChannel — сам проектор на сервер не ходит, токена не имеет и ничего лишнего знать не может.
 * В сообщение попадают только безопасные поля: код, число зашедших, имена (если можно), время.
 * Проблемы учеников (выходы, старая версия) сюда не передаются никогда.
 */

export type ProjectorPhase = 'lobby' | 'active' | 'paused' | 'finished' | 'offline';

export type ProjectorState = {
  phase: ProjectorPhase;
  code: string;
  /** Сколько зашло */
  joined: number;
  /** Имена; null — курс младше 18, имена на проекторе не показываем */
  names: string[] | null;
  /** Сколько секунд осталось (идущий экзамен); null — не считаем */
  timeLeftSec: number | null;
  setTitle: string;
};

export type ProjectorMessage =
  | { type: 'state'; state: ProjectorState }
  | { type: 'hello' }
  | { type: 'closed' };

export const EMPTY_STATE: ProjectorState = {
  phase: 'offline',
  code: '',
  joined: 0,
  names: null,
  timeLeftSec: null,
  setTitle: '',
};

const MAX_NAMES = 200;
const MAX_NAME_LEN = 40;
const PHASES: ProjectorPhase[] = ['lobby', 'active', 'paused', 'finished', 'offline'];

export function channelName(sessionId: string): string {
  return `teach-projector:${sessionId}`;
}

export function projectorUrl(sessionId: string): string {
  const base =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/teach') ? '/teach' : '';
  return `${base}/projector/${encodeURIComponent(sessionId)}`;
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Любое пришедшее сообщение проверяем и обрезаем: окно не доверяет содержимому канала */
export function parseMessage(raw: unknown): ProjectorMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as { type?: unknown; state?: Record<string, unknown> };
  if (msg.type === 'hello') return { type: 'hello' };
  if (msg.type === 'closed') return { type: 'closed' };
  if (msg.type !== 'state' || !msg.state || typeof msg.state !== 'object') return null;
  const s = msg.state;
  const phase = PHASES.includes(s.phase as ProjectorPhase)
    ? (s.phase as ProjectorPhase)
    : 'offline';
  const names = Array.isArray(s.names)
    ? s.names
        .filter((n): n is string => typeof n === 'string')
        .slice(0, MAX_NAMES)
        .map((n) => n.slice(0, MAX_NAME_LEN))
    : null;
  const joined = Number(s.joined);
  // null/undefined — «время не считаем»; Number(null) дал бы 0 и проектор показал бы «0:00»
  const left = typeof s.timeLeftSec === 'number' ? s.timeLeftSec : NaN;
  return {
    type: 'state',
    state: {
      phase,
      code: text(s.code, 64)
        .replace(/[^0-9A-Za-z]/g, '')
        .slice(0, 8),
      joined: Number.isFinite(joined) && joined >= 0 ? Math.min(Math.floor(joined), 9999) : 0,
      names,
      timeLeftSec:
        Number.isFinite(left) && left >= 0 ? Math.min(Math.floor(left), 24 * 3600) : null,
      setTitle: text(s.setTitle, 80),
    },
  };
}

/** Что показывать на проекторе: имена только если курс не младше 18 и имён не слишком много */
export function visibleNames(
  participants: { name: string }[],
  hideNames: boolean
): string[] | null {
  if (hideNames) return null;
  return participants.map((p) => p.name).filter(Boolean);
}

export function supportsProjector(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/** Собрать состояние проектора из ответа монитора (то, что видит класс, — и ничего больше) */
export function buildState(
  m: { status: string; paused?: boolean; participants: { name: string }[] } | null,
  opts: { code: string; setTitle: string; showNames: boolean; timeLeftSec: number | null }
): ProjectorState {
  if (!m) return { ...EMPTY_STATE, code: opts.code, setTitle: opts.setTitle };
  const phase: ProjectorPhase =
    m.status === 'waiting'
      ? 'lobby'
      : m.status === 'active'
        ? m.paused
          ? 'paused'
          : 'active'
        : m.status === 'finished'
          ? 'finished'
          : 'offline';
  return {
    phase,
    code: opts.code,
    joined: m.participants.length,
    names: visibleNames(m.participants, !opts.showNames),
    timeLeftSec: phase === 'active' || phase === 'paused' ? opts.timeLeftSec : null,
    setTitle: opts.setTitle,
  };
}
