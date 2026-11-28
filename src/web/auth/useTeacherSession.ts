import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUser, onAuthChange } from '@/services/auth/session';
import { profileApi } from '@/services/neon/profile';
import { previewMode } from '../preview';
import { authEventAction, resolveSession, type TeacherSession } from './resolveSession';

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
 * Экран загрузки — только при первом открытии. Возврат на вкладку, обновление токена и повторный
 * SIGNED_IN того же пользователя страницу не трогают (см. authEventAction).
 */
export function useTeacherSession(): { session: TeacherSession; reload: () => void } {
  const preview = devPreview();
  const [session, setSession] = useState<TeacherSession>(preview ?? { status: 'loading' });
  const run = useRef(0);
  const current = useRef(session);
  current.current = session;

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
      if (id !== run.current) return;
      // Учитель уже в кабинете, а перепроверка не удалась (сеть) — не выкидываем его на экран ошибки
      if (next.status === 'error' && current.current.status === 'teacher') return;
      setSession(next);
    });
  }, []);

  useEffect(() => {
    if (preview) return;
    reload();
    return onAuthChange((event, authSession) => {
      const action = authEventAction(current.current, event, authSession?.user?.id ?? null);
      if (action === 'out') {
        run.current++;
        setSession({ status: 'out' });
      } else if (action === 'resolve') {
        // Без экрана загрузки: страница остаётся на месте, пока роль перепроверяется
        reload();
      }
    });
  }, [reload, preview]);

  return { session, reload };
}
