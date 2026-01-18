/**
 * useEdgeSwipeBack
 * @description Веб/PWA свайп от левого края назад (как в iOS). Игнорирует native, где жесты есть из коробки.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const EDGE_WIDTH = 40;     // px от левого края
const MIN_DELTA_X = 60;    // минимальный свайп вправо
const MAX_DELTA_Y = 40;    // допустимый вертикальный люфт

export function useEdgeSwipeBack(enabled = true) {
  const navigation = useNavigation();

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== 'web') return;
    if (!navigation || !(navigation as any).canGoBack?.()) return;

    let startX = 0;
    let startY = 0;
    let isEdge = false;

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      isEdge = startX <= EDGE_WIDTH;
    };

    const onEnd = (e: TouchEvent) => {
      if (!isEdge) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);

      if (dx > MIN_DELTA_X && dy < MAX_DELTA_Y) {
        if ((navigation as any).canGoBack?.()) {
          (navigation as any).goBack?.();
        }
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [enabled, navigation]);
}
