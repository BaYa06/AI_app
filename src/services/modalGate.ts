/**
 * Одно окно за раз (plan/new/whats_new.md, шаг News 3, слабое место 6)
 * @description Сами, без нажатия, поверх главной открываются приглашение в курс, набор по ссылке
 * и «Что нового». Приглашение и набор важнее: пока они открыты, «Что нового» ждёт, а если они
 * пришли, когда «Что нового» уже открыто, — оно закрывается.
 *
 * Отдельно — «прерванный запуск»: приложение открыли по ссылке, пушу или виджету. Человек пришёл
 * за конкретным делом, поэтому «Что нового» в этот раз не показываем. Метка снимается, когда
 * человек уходит с главной: при следующем заходе на неё окно покажется.
 */

export type GateOwner = 'courseInvite' | 'shareLink' | 'whatsNew';

/** Чем меньше, тем важнее */
const PRIORITY: Record<GateOwner, number> = { courseInvite: 0, shareLink: 1, whatsNew: 2 };

const open = new Set<GateOwner>();
const listeners = new Set<() => void>();
let interrupted = false;

const notify = () => listeners.forEach((l) => l());

/** Окно `owner` открыто / закрыто. Вызывать при каждом изменении видимости. */
export function setGateOpen(owner: GateOwner, isOpen: boolean): void {
  if (open.has(owner) === isOpen) return;
  if (isOpen) open.add(owner);
  else open.delete(owner);
  notify();
}

/** Открыто ли окно важнее, чем `owner` */
export function isBlockedFor(owner: GateOwner): boolean {
  for (const other of open) if (PRIORITY[other] < PRIORITY[owner]) return true;
  return false;
}

/** Приложение открыли по ссылке, пушу или виджету */
export function markLaunchInterrupted(): void {
  if (interrupted) return;
  interrupted = true;
  notify();
}

export function isLaunchInterrupted(): boolean {
  return interrupted;
}

/** Человек ушёл с главной — следующий заход на неё обычный */
export function clearLaunchInterrupted(): void {
  if (!interrupted) return;
  interrupted = false;
  notify();
}

export function subscribeGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Для тестов */
export function resetGate(): void {
  open.clear();
  interrupted = false;
}
