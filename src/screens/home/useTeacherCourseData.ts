/**
 * Данные курса для главной учителя (plan/new/teacher_cabinet.md, Teacher 4–5): ученики и прогресс
 * группы по наборам. Один запрос каждого вида на курс — карточка урока и строки наборов берут
 * данные отсюда. courseId = null — учитель не в своём курсе, ничего не грузим.
 */
import { useEffect, useState } from 'react';
import { NeonService } from '@/services/NeonService';

export interface TeacherCourseMember {
  id: string;
  name: string;
  lastActiveDate: string | null;
}

/** Прогресс группы по набору: сколько начали и сколько прошли все карточки */
export interface GroupSetProgress {
  started: number;
  completed: number;
}

export interface TeacherCourseData {
  /** null — ещё грузится или не удалось загрузить */
  members: TeacherCourseMember[] | null;
  /** setId → прогресс группы; null — ещё грузится или не удалось загрузить */
  setProgress: Record<string, GroupSetProgress> | null;
}

export function useTeacherCourseData(courseId: string | null, refreshTick = 0): TeacherCourseData {
  const [members, setMembers] = useState<TeacherCourseMember[] | null>(null);
  const [setProgress, setSetProgress] = useState<Record<string, GroupSetProgress> | null>(null);

  useEffect(() => {
    if (!courseId) {
      setMembers(null);
      setSetProgress(null);
      return;
    }
    let cancelled = false;
    NeonService.loadCourseMembers(courseId)
      .then((list) => {
        if (cancelled) return;
        setMembers(
          list.map((m) => ({ id: m.id, name: m.displayName, lastActiveDate: m.lastActiveDate }))
        );
      })
      .catch(() => {
        // Нет учеников — блоки про учеников просто не показываются
      });
    NeonService.loadCourseSetStats(courseId)
      .then((rows) => {
        if (cancelled) return;
        const map: Record<string, GroupSetProgress> = {};
        for (const row of rows) {
          map[row.setId] = {
            started: Number(row.studentsStarted) || 0,
            completed: Number(row.studentsCompleted) || 0,
          };
        }
        setSetProgress(map);
      })
      .catch(() => {
        // Нет прогресса — у наборов остаётся обычная полоска
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, refreshTick]);

  // При смене курса — сразу сбрасываем, чтобы не показать цифры другого курса
  useEffect(() => {
    setMembers(null);
    setSetProgress(null);
  }, [courseId]);

  return { members, setProgress };
}
