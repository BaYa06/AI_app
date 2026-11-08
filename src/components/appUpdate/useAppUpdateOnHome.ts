/**
 * Мягкое окно «Вышла новая версия» на главной (plan/new/app_update_prompt.md, Update 4)
 * @description Раз за заход (их отмечает AppUpdateGuard), как «Что нового»:
 * 1. главная на экране и загрузилась, на ней не открыто своё окно;
 * 2. приложение открыли обычным способом, а не по ссылке, пушу или виджету (modalGate);
 * 3. не открыто окно важнее — обязательное обновление, приглашение в курс, набор по ссылке;
 * 4. ждём ответ сервера этого захода и ещё не меньше секунды от прихода на главную;
 * 5. решает decideUpdatePrompt. Пока решает — занимает очередь, чтобы «Что нового» не
 *    открылось раньше (хук вызывается на главной до useWhatsNewOnHome).
 * На главной человек не в тесте и не в сессии, поэтому эти проверки здесь не нужны.
 * Заход снимается после решения, каким бы оно ни было: остальные причины «не показывать»
 * (версия последняя, 3 дня тишины, 6 часов после «Обновить») до следующего захода не изменятся.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  consumeEntry,
  decideUpdatePrompt,
  entryRefresh,
  isEntryPending,
  markSoftShownThisRun,
  markUpdatePromptShown,
  type AppVersionInfo,
} from '@/services/appUpdate';
import {
  isBlockedFor,
  isLaunchInterrupted,
  setGateOpen,
  subscribeGate,
} from '@/services/modalGate';
import { useNativeAppUpdateSheet } from './nativeAppUpdateSheet';
import { APP_VERSION, openAppStore } from './openAppStore';

/** Пауза после прихода на главную, чтобы окно не выскакивало вместе с ней */
const SHOW_DELAY_MS = 1000;

const enabled = Platform.OS === 'ios';

interface Options {
  /** Главная загрузилась (роль известна) */
  ready: boolean;
  /** На главной открыто своё окно (поиск, меню, шторка) */
  blocked: boolean;
}

export function useAppUpdateOnHome({ ready, blocked }: Options): void {
  const isFocused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AppVersionInfo>();
  const [gateTick, setGateTick] = useState(0);
  const deciding = useRef(false);
  const mounted = useRef(true);
  const live = useRef({ isFocused, ready, blocked });
  live.current = { isFocused, ready, blocked };

  useEffect(() => subscribeGate(() => setGateTick((t) => t + 1)), []);

  const close = useCallback(() => {
    setVisible(false);
    setGateOpen('appUpdate', false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setGateOpen('appUpdate', false);
    };
  }, []);

  useEffect(() => {
    if (!enabled || visible || deciding.current) return;
    if (!isFocused || !ready || blocked) return;
    if (!isEntryPending() || isLaunchInterrupted() || isBlockedFor('appUpdate')) return;

    // Занимаем очередь сразу, в этом же кадре: эффект «Что нового» идёт следом и увидит её
    deciding.current = true;
    setGateOpen('appUpdate', true);
    const startedAt = Date.now();

    (async () => {
      const state = await entryRefresh();
      const rest = SHOW_DELAY_MS - (Date.now() - startedAt);
      if (rest > 0) await new Promise((resolve) => setTimeout(resolve, rest));
      deciding.current = false;
      if (!mounted.current) return;

      // За это время человек мог уйти с главной или открыть своё окно — попробуем при возвращении
      const now = live.current;
      if (
        !now.isFocused ||
        !now.ready ||
        now.blocked ||
        isLaunchInterrupted() ||
        isBlockedFor('appUpdate') ||
        !isEntryPending()
      ) {
        setGateOpen('appUpdate', false);
        return;
      }

      const decision = decideUpdatePrompt({
        appVersion: APP_VERSION,
        state,
        now: Date.now(),
        entryPending: true,
        inTest: false,
        inSession: false,
        launchInterrupted: false,
      });
      consumeEntry();
      if (decision !== 'soft' || !state?.config) {
        setGateOpen('appUpdate', false);
        return;
      }
      markUpdatePromptShown();
      markSoftShownThisRun();
      setConfig(state.config);
      setVisible(true);
    })();
  }, [visible, isFocused, ready, blocked, gateTick]);

  // Пришло окно важнее (обязательное обновление, приглашение, набор по ссылке) — уступаем
  useEffect(() => {
    if (visible && isBlockedFor('appUpdate')) close();
  }, [visible, gateTick, close]);

  useNativeAppUpdateSheet({
    visible,
    variant: 'soft',
    current: APP_VERSION,
    latest: config?.latest ?? null,
    onUpdate: () => {
      close();
      openAppStore(config);
    },
    onClose: close,
  });
}
