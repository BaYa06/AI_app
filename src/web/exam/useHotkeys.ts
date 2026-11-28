import { useEffect, useRef } from 'react';
import { hotkeyAction, type HotkeyAction } from './liveLogic';

/**
 * Горячие клавиши экзамена (Web 21): пробел — пауза, P — проектор. Не срабатывают в полях ввода, на
 * кнопках (пробел там нажимает кнопку) и при открытом окне подтверждения (aria-modal).
 */
export function useHotkeys(handlers: Partial<Record<Exclude<HotkeyAction, null>, () => void>>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const action = hotkeyAction({
        key: ev.key,
        ctrlKey: ev.ctrlKey,
        metaKey: ev.metaKey,
        altKey: ev.altKey,
        targetTag: (ev.target as HTMLElement | null)?.tagName,
      });
      const fn = action && ref.current[action];
      if (fn) {
        ev.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
