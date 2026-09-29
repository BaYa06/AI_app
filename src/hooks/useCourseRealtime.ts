/**
 * Подписка ученика на изменения в курсах учителя (Supabase Realtime broadcast).
 *
 * Сервер после любой правки курса (наборы, карточки, скрытие, юниты учебника) шлёт в канал
 * `course:<courseId>` сигнал без данных (api/_realtime.js). Получив его, тихо подтягиваем
 * изменения — без перезапуска приложения и без мигания экрана. Работает, пока приложение
 * открыто; свёрнутое догоняет при возврате (App.tsx, AppState).
 */
import { useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { DatabaseService } from '@/services/DatabaseService';
import { useCoursesStore } from '@/store/coursesStore';

const COURSE_CHANGED_EVENT = 'course_changed';
// Учитель добавляет 30 карточек подряд — это 30 сигналов; обновляемся один раз после последнего
const SYNC_DEBOUNCE_MS = 1500;

export function useCourseRealtime(userId: string | null | undefined) {
  // Строка, а не массив — чтобы подписки не пересоздавались на каждое изменение store
  const courseIdsKey = useCoursesStore((s) =>
    s.courses
      .filter((c) => c.isStudentCourse)
      .map((c) => c.id)
      .sort()
      .join(','),
  );

  useEffect(() => {
    if (!userId || !courseIdsKey) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSync = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        DatabaseService.syncStudentCourses();
      }, SYNC_DEBOUNCE_MS);
    };

    const channels = courseIdsKey.split(',').map((courseId) =>
      supabase
        .channel(`course:${courseId}`)
        .on('broadcast', { event: COURSE_CHANGED_EVENT }, scheduleSync)
        .subscribe(),
    );

    return () => {
      if (timer) clearTimeout(timer);
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [userId, courseIdsKey]);
}
