import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUser, onAuthChange } from '@/services/auth/session';
import { profileApi } from '@/services/neon/profile';
import { previewMode } from '../preview';
import { resolveSession, type TeacherSession } from './resolveSession';

/** Только в разработке: подмена входа (см. ../preview.ts) */
function devPreview(): TeacherSession | null {
  const mode = previewMode();
  if (mode === 'teacher')
    return { status: 'teacher', user: { id: 'preview', email: 'teacher@example.com' } };
  if (mode === 'guest') return { status: 'guest' };
  if (mode === 'notTeacher') return { status: 'notTeacher', email: 'student@example.com' };
  if (mode === 'error') return { status: 'error' };
  return null;
}

/**
 * Состояние входа учителя: loading | out | guest | notTeacher | error | teacher.
 * Обновляется при любой смене сессии Supabase (вход, выход, обновление токена не трогает роль).
 */
export function useTeacherSession(): { session: TeacherSession; reload: () => void } {
  const preview = devPreview();
  const [session, setSession] = useState<TeacherSession>(preview ?? { status: 'loading' });
  const run = useRef(0);

  const reload = useCallback(() => {
    if (preview) return;
    const id = ++run.current;
    resolveSession({
      getUser: getCurrentUser,
      getIsTeacher: (userId) => profileApi.getIsTeacher(userId),
      ensureUser: async () => {
        const user = await getCurrentUser();
        if (user) await profileApi.ensureUserExists({ id: user.id, email: user.email });
      },
    }).then((next) => {
      // Устаревший ответ (пользователь успел выйти/войти снова) отбрасываем
      if (id === run.current) setSession(next);
    });
  }, []);

  useEffect(() => {
    if (preview) return;
    reload();
    return onAuthChange((event) => {
      // Обновление токена роль не меняет — не мигаем загрузкой
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      setSession({ status: 'loading' });
      reload();
    });
  }, [reload, preview]);

  return { session, reload };
}
