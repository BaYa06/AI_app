/**
 * Стопка «Начало пути» на главной (plan/new/new_user_activation.md, Start 3.2): загрузка,
 * задания, которые видно с главной (напоминания, виджет), кнопки заданий и анимация награды.
 * Вынесено из HomeScreen, чтобы он не рос.
 */
import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSession } from '@/services/auth/session';
import { getPushStatus, requestPushPermission } from '@/services/pushNotifications';
import { installedWidgets } from '@/services/widgetBridge';
import { isLockScreenWidgetAvailable } from '@/services/widgetPrompt';
import { currentSetSessionPlan, startSetSession } from '@/components/study/setSession';
import { useDiamondStore, useSetsStore, useStartTasksStore } from '@/store';
import type { StartTaskId } from '@/store/startTasksStore';
import type { RootStackParamList } from '@/types/navigation';
import { toast } from '@/components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Params {
  navigation: Nav;
  enabled: boolean;
  /** Набор «Первые слова» не нашёлся — запасной: первый свой набор */
  fallbackSetId: string | null;
  /** Задания, у которых своё место на главной (курс — в боковом меню и т. п.) */
  onCourse: () => void;
  onPhoto: (setId: string | null) => void;
  onLibrary: () => void;
  /** Алмазы прилетают из этой точки в счётчик шапки */
  playReward: (from: { x: number; y: number }) => void;
}

export function useStartTasks({
  navigation,
  enabled,
  fallbackSetId,
  onCourse,
  onPhoto,
  onLibrary,
  playReward,
}: Params) {
  const stackRef = useRef<View>(null);
  const [widgetSheet, setWidgetSheet] = useState(false);

  const starterSetId = useCallback((): string | null => {
    const id = useStartTasksStore.getState().starterSetId;
    if (id && useSetsStore.getState().getSet(id)) return id;
    return fallbackSetId;
  }, [fallbackSetId]);

  // Награда за задание, выполненное на другом экране: алмазы летят в счётчик, когда главная видна
  const showPendingReward = useCallback(() => {
    const reward = useStartTasksStore.getState().takePendingReward();
    if (!reward) return;
    const balance = useDiamondStore.getState().diamonds;
    useDiamondStore.getState().setDiamonds(balance - reward);
    setTimeout(() => {
      stackRef.current?.measureInWindow((x, y, w, h) => {
        useDiamondStore.getState().setDiamonds(balance);
        playReward({ x: x + w / 2, y: y + h / 2 });
      });
    }, 400);
  }, [playReward]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const tasks = useStartTasksStore.getState();
      tasks.load().then(async () => {
        const s = useStartTasksStore.getState();
        if (!s.startedAt) return;
        // То, что видно с главной: напоминания включены, виджет стоит
        if (!s.done.includes('push')) {
          const status = await getPushStatus().catch(() => null);
          if (status?.permission === 'granted') await s.complete('push');
        }
        if (!s.done.includes('widget') && isLockScreenWidgetAvailable()) {
          const widgets = await installedWidgets().catch(() => [] as string[]);
          if (widgets.length > 0) await s.complete('widget');
        }
        showPendingReward();
      });
      showPendingReward();
    }, [enabled, showPendingReward])
  );

  const handleStartTask = useCallback(
    async (task: StartTaskId) => {
      const complete = useStartTasksStore.getState().complete;
      switch (task) {
        case 'session': {
          const setId = starterSetId();
          if (!setId) return;
          const info = currentSetSessionPlan(setId);
          if (!info || !startSetSession(navigation, setId, info.plan)) {
            navigation.navigate('SetDetail', { setId });
          }
          return;
        }
        case 'voice': {
          const setId = starterSetId();
          if (setId) navigation.navigate('AudioLearning', { setId });
          return;
        }
        case 'photo':
          onPhoto(starterSetId());
          return;
        case 'library':
          onLibrary();
          return;
        case 'course':
          onCourse();
          return;
        case 'widget':
          setWidgetSheet(true);
          return;
        case 'push': {
          const session = await getSession();
          const status = await requestPushPermission(session?.user?.id ?? null);
          if (status.permission === 'granted') {
            toast.success('Напоминания включены');
            await complete('push');
            showPendingReward();
          }
          return;
        }
        default:
          return;
      }
    },
    [navigation, onCourse, onLibrary, onPhoto, showPendingReward, starterSetId]
  );

  const closeWidgetSheet = useCallback(() => {
    setWidgetSheet(false);
    installedWidgets()
      .then(async (w) => {
        if (w.length > 0) {
          await useStartTasksStore.getState().complete('widget');
          showPendingReward();
        }
      })
      .catch(() => {});
  }, [showPendingReward]);

  const openWidgetSheet = useCallback(() => setWidgetSheet(true), []);

  return { stackRef, handleStartTask, widgetSheet, openWidgetSheet, closeWidgetSheet };
}
