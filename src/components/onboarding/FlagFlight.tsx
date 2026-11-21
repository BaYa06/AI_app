/**
 * Перелёт флага из строки списка в место на мосту языков (plan/new/new_user_activation.md,
 * Start 2.4). Слой поверх экрана; координаты — measureInWindow источника, цели и самого слоя.
 * При «Уменьшить движение» перелёта нет: место моста обновляется сразу.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/common/Text';

const FLIGHT_MS = 520;
const FLAG_SIZE = 32;

interface Point {
  x: number;
  y: number;
}

interface Flight {
  id: number;
  flag: string;
  from: Point;
  to: Point;
  done: () => void;
}

function measure(view: View): Promise<Point & { w: number; h: number }> {
  return new Promise((resolve) => {
    view.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}

function Flying({ flight, onEnd }: { flight: Flight; onEnd: () => void }) {
  const t = useSharedValue(0);
  const { from, to } = flight;
  // Дуга вверх: верхняя точка — на 40 pt выше выше из двух концов
  const peakY = Math.min(from.y, to.y) - 40;

  useEffect(() => {
    t.value = withTiming(
      1,
      { duration: FLIGHT_MS, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onEnd)();
      }
    );
  }, [t, onEnd]);

  const style = useAnimatedStyle(() => {
    const k = t.value;
    const x = from.x + (to.x - from.x) * k;
    const y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * peakY + k * k * to.y;
    const scale = 1 + 0.25 * Math.sin(Math.PI * k);
    return { transform: [{ translateX: x }, { translateY: y }, { scale }] };
  });

  return (
    <Animated.View style={[styles.flying, style]}>
      <Text variant="h2">{flight.flag}</Text>
    </Animated.View>
  );
}

/**
 * fly(источник, цель, флаг, done): done вызывается, когда флаг долетел (или сразу без анимации).
 * layer — положить последним ребёнком в корень экрана.
 */
export function useFlagFlight() {
  const reduceMotion = useReducedMotion();
  const layerRef = useRef<View>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const nextId = useRef(0);

  const fly = useCallback(
    async (
      source: View | null | undefined,
      target: View | null | undefined,
      flag: string,
      done: () => void
    ) => {
      const layer = layerRef.current;
      if (reduceMotion || !source || !target || !layer) {
        done();
        return;
      }
      const [l, a, b] = await Promise.all([measure(layer), measure(source), measure(target)]);
      if (!a.w || !b.w) {
        done();
        return;
      }
      const center = (p: Point & { w: number; h: number }): Point => ({
        x: p.x - l.x + p.w / 2 - FLAG_SIZE / 2,
        y: p.y - l.y + p.h / 2 - FLAG_SIZE / 2,
      });
      nextId.current += 1;
      // Новый перелёт поверх недолетевшего: прошлый сразу «долетает»
      flightRef.current?.done();
      const next = { id: nextId.current, flag, from: center(a), to: center(b), done };
      flightRef.current = next;
      setFlight(next);
    },
    [reduceMotion]
  );

  const end = useCallback(() => {
    const current = flightRef.current;
    flightRef.current = null;
    setFlight(null);
    current?.done();
  }, []);

  const layer = (
    <View ref={layerRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flight ? <Flying key={flight.id} flight={flight} onEnd={end} /> : null}
    </View>
  );

  return { fly, layer };
}

const styles = StyleSheet.create({
  flying: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: FLAG_SIZE,
    height: FLAG_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
