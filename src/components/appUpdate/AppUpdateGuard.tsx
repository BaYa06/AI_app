/**
 * Наблюдатель за версией и обязательное окно «Нужно обновить Flashly»
 * (plan/new/app_update_prompt.md, Update 4)
 * @description Стоит в корне приложения (AppRoot), поэтому работает на любом экране и даже до
 * входа: окно должно запирать приложение и тогда, когда сломан вход.
 * - Отмечает заходы (холодный запуск, возврат после 30+ минут в фоне) и на каждом спрашивает
 *   сервер. Мягкое окно по этим заходам показывает главная (useAppUpdateOnHome).
 * - Обязательное окно — ниже minVersion: везде, кроме идущего теста. Тест доводим до конца,
 *   окно появится на следующем экране.
 * Только iOS: Android пока не в Google Play, веб всегда свежий.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { navigationRef } from '@/navigation/navigationRef';
import {
  decideUpdatePrompt,
  loadAppUpdateState,
  markColdStart,
  onAppStateChange,
  refreshOnEntry,
  type AppUpdateState,
} from '@/services/appUpdate';
import { setGateOpen } from '@/services/modalGate';
import { useNativeAppUpdateSheet } from './nativeAppUpdateSheet';
import { APP_VERSION, openAppStore } from './openAppStore';

/** Экраны идущего теста: ни одно окно обновления их не перебивает */
export const TEST_ROUTES = new Set([
  'TestLobby',
  'LiveTest',
  'TestWaiting',
  'TestExam',
  'ExamLobby',
]);

const enabled = Platform.OS === 'ios';

function currentRouteIsTest(): boolean {
  if (!navigationRef.isReady()) return false;
  return TEST_ROUTES.has(navigationRef.getCurrentRoute()?.name ?? '');
}

export function AppUpdateGuard() {
  const [state, setState] = useState<AppUpdateState | undefined>(() =>
    enabled ? loadAppUpdateState() : undefined
  );
  const [inTest, setInTest] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    markColdStart();
    refreshOnEntry(Platform.OS).then(setState);
    const subscription = AppState.addEventListener('change', (next) => {
      if (onAppStateChange(next)) refreshOnEntry(Platform.OS).then(setState);
    });
    return () => subscription.remove();
  }, []);

  // До готовности навигации подписка ждёт её (React Navigation запоминает слушателей)
  useEffect(() => {
    if (!enabled) return;
    setInTest(currentRouteIsTest());
    return navigationRef.addListener('state', () => setInTest(currentRouteIsTest()));
  }, []);

  const force =
    !!state &&
    decideUpdatePrompt({
      appVersion: APP_VERSION,
      state,
      now: Date.now(),
      // Мягкое окно — дело главной; здесь только обязательное
      entryPending: false,
      inTest,
      inSession: false,
      launchInterrupted: false,
    }) === 'force';

  useEffect(() => {
    setGateOpen('appUpdateForce', force);
  }, [force]);

  useNativeAppUpdateSheet({
    visible: force,
    variant: 'force',
    current: APP_VERSION,
    latest: state?.config?.latest ?? null,
    onUpdate: () => openAppStore(state?.config),
    // Обязательное не закрывается
    onClose: () => {},
  });

  return null;
}
