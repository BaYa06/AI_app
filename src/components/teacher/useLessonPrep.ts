/**
 * Данные экрана «Перед уроком» (plan/new/teacher_cabinet.md, Teacher 37): трудные слова,
 * готовность, разминка, ближайший урок. Кэш по курсу — экран не мигает при возврате;
 * обновление — свайпом вниз (refresh).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TEACHER_HOMEWORK_ENABLED } from '@/config/features';
import { NeonService } from '@/services/NeonService';
import { loadLessonPrep, warmupCards, type LessonPrepData } from '@/services/lessonPrep';
import { getNextLesson, type NextLesson, type ScheduleItem } from '@/utils/nextLesson';
import { currentHomework } from './teacherHomework';

const cache = new Map<string, { data: LessonPrepData; schedule: ScheduleItem[] | null }>();

export function useLessonPrep(courseId: string) {
  const cached = cache.get(courseId);
  const [data, setData] = useState<LessonPrepData | null>(cached?.data ?? null);
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(cached?.schedule ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [next, sched] = await Promise.all([
      loadLessonPrep(courseId, NeonService, {
        homeworkEnabled: TEACHER_HOMEWORK_ENABLED,
        pickCurrent: currentHomework,
      }),
      NeonService.getCourseSchedule(courseId).catch(() => null),
    ]);
    cache.set(courseId, { data: next, schedule: sched });
    return { next, sched };
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then(({ next, sched }) => {
        if (cancelled) return;
        setData(next);
        setSchedule(sched);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { next, sched } = await load();
      setData(next);
      setSchedule(sched);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const nextLesson: NextLesson | null = useMemo(() => getNextLesson(schedule), [schedule]);
  const warmup = useMemo(() => warmupCards(data?.hardCards ?? null), [data]);

  return { data, warmup, nextLesson, loading, refreshing, refresh };
}
