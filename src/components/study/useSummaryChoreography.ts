/**
 * useSummaryChoreography
 * @description Хореография итогов сессии (plan/new/session_results.md, решения 9–13): картинка → плитки по
 * очереди считают от нуля → строка со словами. Одна шкала времени — от неё цифры, звуки и вибрация,
 * чтобы они не разъехались. Движение (прозрачность, подскок) — на UI-потоке, цифры — по кадрам JS.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { triggerHaptic } from '@/utils/haptic';
import {
  SESSION_SFX_HIT_MS,
  playSessionSfx,
  preloadSessionSfx,
  stopSessionSfx,
  type SessionSfx,
} from '@/utils/sound';

/** Тайминги, мс от открытия экрана */
const T = {
  heroMs: 450,
  /** Старт первой плитки */
  start: 600,
  /** Счёт одной плитки; звук счёта (0,49 с) ставим так, чтобы он закончился вместе с цифрой */
  countMs: 600,
  gapMs: 250,
  popMs: 280,
  tailMs: 300,
  /** Финал — после третьего «дзынь» */
  finishAfterMs: 150,
  countSfxMs: 490,
  /** Звук на iPhone стартует позже вызова — вибрацию под звук сдвигаем на столько же */
  hapticLagMs: 30,
  /** «Тики» счёта: не чаще раза в 60 мс и не больше 10 за плитку */
  tickMinMs: 60,
  ticksMax: 10,
} as const;

const SFX: SessionSfx[] = ['reveal', 'count', 'ding', 'finish'];
const TILES = 3;

const tileStart = (i: number) => T.start + i * (T.countMs + T.gapMs);
const tileDone = (i: number) => tileStart(i) + T.countMs;
const FINISH_AT = tileDone(TILES - 1) + T.finishAfterMs;
const END_AT = FINISH_AT + (SESSION_SFX_HIT_MS.finish ?? 0) + T.hapticLagMs + 50;

/** Длительность всей анимации итогов — раньше другие окна поверх не открываем */
export const SUMMARY_ANIMATION_MS = END_AT;

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export interface TileMotion {
  opacity: SharedValue<number>;
  scale: SharedValue<number>;
}

/** targets — итоговые числа плиток по порядку (опыт, точность, секунды) */
export function useSummaryChoreography(targets: number[]) {
  const reduced = useReducedMotion();
  const [values, setValues] = useState<number[]>(() => (reduced ? targets : targets.map(() => 0)));

  const heroOpacity = useSharedValue(reduced ? 1 : 0);
  const heroScale = useSharedValue(reduced ? 1 : 0.6);
  const tailOpacity = useSharedValue(reduced ? 1 : 0);
  // Плитка ждёт очереди полупрозрачной
  const tile0 = { opacity: useSharedValue(reduced ? 1 : 0.4), scale: useSharedValue(1) };
  const tile1 = { opacity: useSharedValue(reduced ? 1 : 0.4), scale: useSharedValue(1) };
  const tile2 = { opacity: useSharedValue(reduced ? 1 : 0.4), scale: useSharedValue(1) };
  const tiles: TileMotion[] = [tile0, tile1, tile2];

  const frameRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  // Оборвать всё — «Продолжить» нажали посреди анимации или экран закрылся (решение 10)
  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    stopSessionSfx(SFX);
  }, []);

  useEffect(() => {
    preloadSessionSfx(SFX);

    // «Уменьшение движения» — цифры сразу, один финальный звук и одна вибрация (решение 13)
    if (reduced) {
      playSessionSfx('finish');
      triggerHaptic('notificationSuccess');
      return stop;
    }

    heroOpacity.value = withTiming(1, { duration: T.heroMs });
    heroScale.value = withTiming(1, { duration: T.heroMs });

    // События шкалы: звук и вибрация в нужную миллисекунду
    const events: Array<{ at: number; run: () => void }> = [
      { at: 0, run: () => playSessionSfx('reveal') },
      {
        at: (SESSION_SFX_HIT_MS.reveal ?? 0) + T.hapticLagMs,
        run: () => triggerHaptic('impactLight'),
      },
    ];
    for (let i = 0; i < TILES; i++) {
      const tile = tiles[i];
      events.push(
        {
          at: tileStart(i),
          run: () => {
            tile.opacity.value = withTiming(1, { duration: 150 });
          },
        },
        { at: tileDone(i) - T.countSfxMs, run: () => playSessionSfx('count') },
        {
          at: tileDone(i),
          run: () => {
            playSessionSfx('ding');
            tile.scale.value = withSequence(
              withTiming(1.08, { duration: T.popMs / 2 }),
              withTiming(1, { duration: T.popMs / 2 })
            );
          },
        },
        // На третьей плитке удар чуть резче
        {
          at: tileDone(i) + T.hapticLagMs,
          run: () => triggerHaptic(i === TILES - 1 ? 'rigid' : 'impactMedium'),
        }
      );
    }
    events.push(
      {
        at: tileDone(TILES - 1),
        run: () => {
          tailOpacity.value = withTiming(1, { duration: T.tailMs });
        },
      },
      { at: FINISH_AT, run: () => playSessionSfx('finish') },
      {
        at: FINISH_AT + (SESSION_SFX_HIT_MS.finish ?? 0) + T.hapticLagMs,
        run: () => triggerHaptic('notificationSuccess'),
      }
    );
    events.sort((a, b) => a.at - b.at);

    const startedAt = Date.now();
    let next = 0;
    let shown = targets.map(() => 0);
    const ticks = targets.map(() => 0);
    let lastTickAt = -Infinity;

    const frame = () => {
      if (stoppedRef.current) return;
      const t = Date.now() - startedAt;
      while (next < events.length && events[next].at <= t) events[next++].run();

      const current = targets.map((target, i) => {
        const p = Math.min(1, Math.max(0, (t - tileStart(i)) / T.countMs));
        return Math.round(target * easeOut(p));
      });
      if (current.some((v, i) => v !== shown[i])) {
        // «Тик» на изменение цифры — к концу счёта цифра замедляется, и тики редеют вместе с ней
        current.forEach((v, i) => {
          if (v === shown[i] || v === targets[i]) return;
          if (t - lastTickAt < T.tickMinMs || ticks[i] >= T.ticksMax) return;
          ticks[i] += 1;
          lastTickAt = t;
          triggerHaptic('soft');
        });
        shown = current;
        setValues(current);
      }

      if (t < END_AT) frameRef.current = requestAnimationFrame(frame);
      else frameRef.current = null;
    };
    frameRef.current = requestAnimationFrame(frame);
    return stop;
  }, []);

  return { values, heroOpacity, heroScale, tailOpacity, tiles, stop };
}
