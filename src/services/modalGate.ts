/**
 * Одно окно за раз (plan/new/whats_new.md, шаг News 3, слабое место 6)
 * @description Сами, без нажатия, поверх главной открываются приглашение в курс, набор по ссылке,
 * «Вышла новая версия» и «Что нового». Порядок важности (plan/new/app_update_prompt.md, Update 4):
 * обязательное обновление → приглашение → набор по ссылке → мягкое обновление → «Что нового».
 * Пока открыто окно важнее, остальные ждут; если оно пришло, когда «Что нового» уже открыто, —
 * то закрывается. Мягкое обновление занимает очередь ещё и пока решает (ждёт ответ сервера),
 * чтобы «Что нового» не успело открыться раньше.
 *
 * Отдельно — «прерванный запуск»: приложение открыли по ссылке, пушу или виджету. Человек пришёл
 * за конкретным делом, поэтому «Что нового» в этот раз не показываем. Метка снимается, когда
 * человек уходит с главной: при следующем заходе на неё окно покажется.
 */

export type GateOwner = 'appUpdateForce' | 'courseInvite' | 'shareLink' | 'appUpdate' | 'whatsNew';

/** Чем меньше, тем важнее */
const PRIORITY: Record<GateOwner, number> = {
  appUpdateForce: -1,
  courseInvite: 0,
  shareLink: 1,
  appUpdate: 2,
  whatsNew: 3,
};

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
