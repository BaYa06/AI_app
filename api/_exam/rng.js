/**
 * Детерминированный генератор случайных чисел для экзамена (plan/new/live_exam.md, раздел C).
 * Одно и то же зерно → одна и та же последовательность: переподключение ученика даёт тот же
 * порядок, сборка с тем же зерном — тот же состав (для тестов).
 */

/** 32-битный хеш строки (FNV-1a) */
export function hashString(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: функция без аргументов → число в [0, 1) */
export function makeRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashString(seed)) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перемешивание Фишера–Йетса с заданным генератором (исходный массив не меняется) */
export function shuffleWith(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
