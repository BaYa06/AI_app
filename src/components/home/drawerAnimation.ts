/**
 * CoursesDrawer animation helpers
 * @description Общая физика для двух источников жеста — edge-swipe открытия (HomeScreen)
 * и drag-to-close по самой панели (CoursesDrawer). Вынесено отдельно, чтобы оба места
 * решали "открыть или закрыть" и доводили панель абсолютно одинаково.
 */
import { withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';

// Лёгкий, едва заметный overshoot при доводе — не "желешный" отскок.
export const DRAWER_SPRING_CONFIG = {
  damping: 32,
  stiffness: 280,
  mass: 0.9,
};

// Быстрый флик в сторону открытия/закрытия должен доводить панель до конца,
// даже если палец прошёл меньше 40% ширины панели.
const FLICK_VELOCITY = 500;
// Порог по пройденному расстоянию, если жест не был достаточно быстрым.
const OPEN_THRESHOLD_FRACTION = 0.4;

export function clampTranslateX(value: number, drawerWidth: number): number {
  'worklet';
  return Math.min(0, Math.max(-drawerWidth, value));
}

export function resolveDrawerOpen(
  currentTranslateX: number,
  velocityX: number,
  drawerWidth: number
): boolean {
  'worklet';
  if (velocityX > FLICK_VELOCITY) return true;
  if (velocityX < -FLICK_VELOCITY) return false;
  return currentTranslateX > -drawerWidth * (1 - OPEN_THRESHOLD_FRACTION);
}

/**
 * Доводит панель до открытого/закрытого положения через withSpring и уведомляет
 * JS-поток ровно один раз, когда пружина реально остановилась (а не на каждый кадр).
 */
export function animateDrawerTo(
  translateX: SharedValue<number>,
  open: boolean,
  drawerWidth: number,
  onSettled: (open: boolean) => void
) {
  'worklet';
  translateX.value = withSpring(open ? 0 : -drawerWidth, DRAWER_SPRING_CONFIG, (finished) => {
    if (finished) runOnJS(onSettled)(open);
  });
}
