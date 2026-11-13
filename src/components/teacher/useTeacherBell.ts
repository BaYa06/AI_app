/**
 * Колокольчик учителя в шапке главной (plan/new/teacher_cabinet.md, Teacher 49): число
 * непросмотренных уведомлений. Обновляется при возврате на главную. Без флага этапа 4 или
 * вне своего курса ничего не грузит.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { TEACHER_INSIGHTS_ENABLED } from '@/config/features';
import { NeonService } from '@/services/NeonService';

export function useTeacherBell(active: boolean): { enabled: boolean; unseen: number } {
  const enabled = TEACHER_INSIGHTS_ENABLED && active;
  const [unseen, setUnseen] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let cancelled = false;
      NeonService.loadTeacherNotifications()
        .then((res) => {
          if (!cancelled && res) setUnseen(res.unseen);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [enabled])
  );
  return { enabled, unseen: enabled ? unseen : 0 };
}
