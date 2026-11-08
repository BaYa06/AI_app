import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Событие установки может прийти раньше, чем React смонтирует экран: его ловит скрипт
 * в public/index.html и кладёт сюда (plan/new/seo_launch.md, SEO 3).
 */
type WindowWithPrompt = Window & { __flashlyInstallPrompt?: BeforeInstallPromptEvent | null };

function earlyPrompt(): BeforeInstallPromptEvent | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return (window as WindowWithPrompt).__flashlyInstallPrompt ?? null;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    earlyPrompt
  );
  const [isIosSafari, setIsIosSafari] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;

    if (isStandalone) return;

    // Detect iOS Safari (beforeinstallprompt is not supported on iOS)
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIos) {
      setIsIosSafari(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      // Событие одноразовое: второй prompt() у того же события браузер не покажет
      (window as WindowWithPrompt).__flashlyInstallPrompt = null;
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return {
    canInstall: Platform.OS === 'web' && deferredPrompt !== null,
    promptInstall,
    isIosSafari,
  };
}
