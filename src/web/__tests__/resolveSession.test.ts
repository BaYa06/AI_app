import { describe, expect, it, jest } from '@jest/globals';
import { resolveSession, type ResolveDeps, type SessionUser } from '../auth/resolveSession';

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: 'u1',
  email: 'a@b.c',
  isAnonymous: false,
  ...over,
});

function deps(over: Partial<ResolveDeps>): ResolveDeps {
  return {
    getUser: async () => user(),
    getIsTeacher: async () => true,
    ensureUser: async () => {},
    ...over,
  };
}

describe('resolveSession', () => {
  it('нет сессии — out', async () => {
    expect(await resolveSession(deps({ getUser: async () => null }))).toEqual({ status: 'out' });
  });
  it('гость — guest, роль не спрашиваем', async () => {
    const getIsTeacher = jest.fn(async () => true);
    const r = await resolveSession(
      deps({ getUser: async () => user({ isAnonymous: true }), getIsTeacher })
    );
    expect(r.status).toBe('guest');
    expect(getIsTeacher).not.toHaveBeenCalled();
  });
  it('учитель', async () => {
    expect(await resolveSession(deps({}))).toEqual({
      status: 'teacher',
      user: { id: 'u1', email: 'a@b.c' },
    });
  });
  it('ученик — notTeacher с почтой', async () => {
    expect(await resolveSession(deps({ getIsTeacher: async () => false }))).toEqual({
      status: 'notTeacher',
      email: 'a@b.c',
    });
  });
  it('нет профиля: создаём и спрашиваем ещё раз', async () => {
    const answers = [null, false];
    const ensureUser = jest.fn(async () => {});
    const r = await resolveSession(
      deps({ getIsTeacher: async () => answers.shift() ?? null, ensureUser })
    );
    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(r.status).toBe('notTeacher');
  });
  it('профиль так и не загрузился — error', async () => {
    expect((await resolveSession(deps({ getIsTeacher: async () => null }))).status).toBe('error');
  });
  it('исключения — error, а не падение', async () => {
    expect(
      (await resolveSession(deps({ getUser: async () => Promise.reject(new Error('x')) }))).status
    ).toBe('error');
    expect(
      (await resolveSession(deps({ getIsTeacher: async () => Promise.reject(new Error('x')) })))
        .status
    ).toBe('error');
  });
});

import { authEventAction } from '../auth/resolveSession';

describe('authEventAction — возврат на вкладку не перерисовывает кабинет', () => {
  const teacher = { status: 'teacher' as const, user: { id: 'u1', email: null } };
  it('повторный SIGNED_IN того же учителя (Supabase шлёт его при возврате на вкладку) — ничего', () => {
    expect(authEventAction(teacher, 'SIGNED_IN', 'u1')).toBe('ignore');
    expect(authEventAction(teacher, 'USER_UPDATED', 'u1')).toBe('ignore');
  });
  it('обновление токена — ничего', () => {
    expect(authEventAction(teacher, 'TOKEN_REFRESHED', 'u1')).toBe('ignore');
  });
  it('выход — на экран входа', () => {
    expect(authEventAction(teacher, 'SIGNED_OUT', null)).toBe('out');
    expect(authEventAction(teacher, 'SIGNED_IN', null)).toBe('out');
  });
  it('другой пользователь или первый вход — тихая перепроверка', () => {
    expect(authEventAction(teacher, 'SIGNED_IN', 'u2')).toBe('resolve');
    expect(authEventAction({ status: 'out' }, 'SIGNED_IN', 'u1')).toBe('resolve');
    expect(authEventAction({ status: 'guest' }, 'USER_UPDATED', 'u1')).toBe('resolve');
  });
});
