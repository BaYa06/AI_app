/**
 * «У Flashly новый адрес» на старом ai-app-seven-zeta.vercel.app (plan/new/seo_launch.md, SEO 5;
 * plan/new/official_site.md, Site 9).
 * @description Старый адрес не перенаправляем: на нём установленные PWA, вход и push. Один раз
 * показываем тост, что сайт теперь flashlycards.app, а здесь всё продолжит работать.
 * Тост, а не окно: при запуске и так могут открыться обновление, «Что нового», приглашение.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { toast } from '@/components/ui';

const OLD_HOST = 'ai-app-seven-zeta.vercel.app';
const SEEN_KEY = 'flashly.oldDomainNoticeSeen';
/** Пауза после запуска, чтобы не накладываться на первые окна и загрузку */
const DELAY_MS = 6000;

export function OldDomainNotice({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (window.location.hostname !== OLD_HOST) return;
    try {
      if (window.localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    const timer = setTimeout(() => {
      toast.show(
        'У Flashly новый адрес: flashlycards.app. Здесь всё продолжит работать как раньше.',
        {
          tone: 'info',
          duration: 8000,
        }
      );
      try {
        window.localStorage.setItem(SEEN_KEY, '1');
      } catch {
        // Приватный режим: покажем ещё раз в следующий заход — не страшно
      }
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled]);

  return null;
}
