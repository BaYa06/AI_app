/**
 * Состояние входа учителя (plan/new/web_cabinet.md, Web 3). Чистая функция — зависимости передаются
 * снаружи, чтобы проверить все состояния тестом без Supabase и сети.
 *
 * Роль берём из профиля на сервере, а не из токена: роль в токене может устареть.
 */

export type SessionUser = { id: string; email: string | null; isAnonymous: boolean };

export type TeacherSession =
  | { status: 'loading' }
  | { status: 'out' }
  /** Гостевой аккаунт: нужно привязать Google или Apple, иначе курсы потеряются */
  | { status: 'guest' }
  /** Вошёл, но не учитель */
  | { status: 'notTeacher'; email: string | null }
  /** Профиль не загрузился (нет сети, сервер недоступен) */
  | { status: 'error' }
  | { status: 'teacher'; user: { id: string; email: string | null } };

export type ResolveDeps = {
  getUser: () => Promise<SessionUser | null>;
  /** true/false — роль известна, null — профиль не загрузился или его ещё нет */
  getIsTeacher: (userId: string) => Promise<boolean | null>;
  /** Создать строку профиля у нового пользователя (идемпотентно, роль не выдаёт) */
  ensureUser: () => Promise<void>;
};

export async function resolveSession(deps: ResolveDeps): Promise<TeacherSession> {
  let user: SessionUser | null;
  try {
    user = await deps.getUser();
  } catch {
    return { status: 'error' };
  }
  if (!user) return { status: 'out' };
  if (user.isAnonymous) return { status: 'guest' };

  try {
    let isTeacher = await deps.getIsTeacher(user.id);
    if (isTeacher === null) {
      // Новый пользователь без профиля: создаём строку (роль «ученик» по умолчанию) и спрашиваем ещё раз
      await deps.ensureUser();
      isTeacher = await deps.getIsTeacher(user.id);
    }
    if (isTeacher === null) return { status: 'error' };
    if (!isTeacher) return { status: 'notTeacher', email: user.email };
    return { status: 'teacher', user: { id: user.id, email: user.email } };
  } catch {
    return { status: 'error' };
  }
}

/**
 * Что делать с событием Supabase. Важно: при возврате на вкладку Supabase сам перепроверяет сессию и
 * присылает SIGNED_IN заново (auth-js, _onVisibilityChanged → _recoverAndRefresh). Если в ответ
 * показывать загрузку, кабинет целиком перерисовывается и теряет всё, что было на странице
 * (введённое, предложения ИИ). Поэтому тот же пользователь — ничего не делаем.
 *   ignore  — ничего не меняется;
 *   out     — вышел (на любой вкладке);
 *   resolve — сменился пользователь: тихо перепроверить роль, текущий экран не трогать.
 */
export function authEventAction(
  current: TeacherSession,
  event: string,
  sessionUserId: string | null
): 'ignore' | 'out' | 'resolve' {
  if (event === 'SIGNED_OUT' || (!sessionUserId && current.status !== 'loading')) return 'out';
  if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return 'ignore';
  if (current.status === 'teacher' && current.user.id === sessionUserId) return 'ignore';
  return 'resolve';
}
