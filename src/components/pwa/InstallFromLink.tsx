/**
 * Окно установки по ссылке с сайта (plan/new/seo_launch.md, шаг SEO 3)
 * @description Кнопка «Установить» на flashlycards.app для Android ведёт на app.flashlycards.app/?install=1.
 * Здесь параметр убирается из адреса и показывается окно:
 * - браузер умеет ставить приложение (Chrome, Edge, Samsung Internet) — кнопка «Установить»
 *   вызывает системное окно установки;
 * - iPhone — предлагаем приложение из App Store;
 * - другие браузеры — инструкция «Меню → Добавить на главный экран».
 * Если приложение уже открыто как установленное, окно не показывается. Только веб.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { CheckCircle2, MoreVertical, PlusSquare } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Dialog, type IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { iconSize, spacing } from '@/constants';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const APP_STORE_URL = 'https://apps.apple.com/app/id6808731151';

/** Сколько ждём событие установки от браузера, прежде чем показать инструкцию */
const PROMPT_WAIT_MS = 2500;

const MANUAL_STEPS: { icon: IconComponent; text: string }[] = [
  { icon: MoreVertical, text: 'Открой меню браузера (⋮ или ⋯)' },
  { icon: PlusSquare, text: 'Выбери «Установить приложение» или «Добавить на главный экран»' },
  { icon: CheckCircle2, text: 'Подтверди установку' },
];

/** Пришли по ссылке с ?install=1 — убираем параметр из адреса и сообщаем об этом один раз */
function consumeInstallParam(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('install') !== '1') return false;
  params.delete('install');
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  );
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function InstallFromLink() {
  const colors = useThemeColors();
  const { canInstall, promptInstall, isIosSafari } = usePwaInstall();
  const [requested, setRequested] = useState(false);
  const [waited, setWaited] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!consumeInstallParam()) return;
    setRequested(true);
    const timer = setTimeout(() => setWaited(true), PROMPT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const close = useCallback(() => setClosed(true), []);

  const install = useCallback(async () => {
    await promptInstall();
    setClosed(true);
  }, [promptInstall]);

  const openAppStore = useCallback(() => {
    Linking.openURL(APP_STORE_URL).catch(() => {});
    setClosed(true);
  }, []);

  if (Platform.OS !== 'web' || !requested) return null;

  // Пока браузер не прислал событие установки, ждём, чтобы не мигнуть инструкцией
  const visible = !closed && (canInstall || isIosSafari || waited);
  const mode = canInstall ? 'prompt' : isIosSafari ? 'ios' : 'manual';

  return (
    <Dialog
      visible={visible}
      onClose={close}
      title="Установить Flashly"
      footer={
        <View style={styles.footer}>
          {mode === 'prompt' && <Button title="Установить" onPress={install} fullWidth />}
          {mode === 'ios' && <Button title="Открыть App Store" onPress={openAppStore} fullWidth />}
          {mode === 'manual' && <Button title="Понятно" onPress={close} fullWidth />}
          {mode !== 'manual' && (
            <Button title="Не сейчас" variant="quiet" onPress={close} fullWidth />
          )}
        </View>
      }
    >
      {mode === 'prompt' && (
        <Text variant="body" style={{ color: colors.textSecondary }}>
          Flashly появится на главном экране и будет открываться как обычное приложение.
        </Text>
      )}
      {mode === 'ios' && (
        <Text variant="body" style={{ color: colors.textSecondary }}>
          На iPhone удобнее приложение из App Store: с напоминаниями и виджетом на главном экране.
        </Text>
      )}
      {mode === 'manual' && (
        <View style={styles.steps}>
          {MANUAL_STEPS.map(({ icon: Glyph, text }) => (
            <View key={text} style={styles.step}>
              <Glyph size={iconSize.m} color={colors.primary} />
              <Text variant="body" style={[styles.stepText, { color: colors.textPrimary }]}>
                {text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.s,
  },
  steps: {
    gap: spacing.m,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  stepText: {
    flex: 1,
  },
});
