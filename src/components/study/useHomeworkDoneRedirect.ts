/**
 * Сервер подтвердил сдачу задания (homeworkStore.justSubmitted, Teacher 17) — открыть «Задание сдано!»
 * (Teacher 28). Подтверждение приходит через очередь синхронизации чуть позже конца сессии, поэтому
 * слушаем и на итогах сессии, и на главной: кто первым увидит, тот и откроет.
 */
import { useEffect } from 'react';
import { useHomeworkStore } from '@/store/homeworkStore';
import { TEACHER_HOMEWORK_ENABLED } from '@/config/features';

export function useHomeworkDoneRedirect(
  navigation: { navigate: (screen: 'HomeworkDone', params: object) => void },
  active: boolean
) {
  const pending = useHomeworkStore((s) => s.justSubmitted.length);
  useEffect(() => {
    if (!TEACHER_HOMEWORK_ENABLED || !active || pending === 0) return;
    const [first] = useHomeworkStore.getState().takeJustSubmitted();
    if (first) navigation.navigate('HomeworkDone', first);
  }, [pending, active]); // eslint-disable-line react-hooks/exhaustive-deps
}
