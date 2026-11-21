/**
 * Настройки экзамена на клиенте (plan/new/live_exam.md, B4 и B9) — чтобы «Советуем» и
 * доли форматов пересчитывались сразу, без запроса. Копия констант api/_exam/build.js;
 * совпадение проверяет src/screens/exam/__tests__/examConfig.test.ts.
 */
import type { ExamFormat } from '@/services/exam';

export const FORMATS: ExamFormat[] = ['choice', 'write', 'scramble', 'match', 'gap'];

/** Секунды на вопрос (на пару — для match). Решение пользователя 17.11.2026. */
export const SECONDS: Record<ExamFormat, number> = {
  choice: 13,
  write: 28,
  scramble: 23,
  gap: 18,
  match: 8,
};
export const TIME_RESERVE = 1.2;
export const PAIR_MIN = 3;

export const FORMAT_LABELS: Record<ExamFormat, string> = {
  choice: 'Выбор ответа',
  write: 'Письменный ответ',
  scramble: 'Собери слово',
  match: 'Соедини пары',
  gap: 'Вставь слово',
};

export const FORMAT_SHORT: Record<ExamFormat, string> = {
  choice: 'выбор',
  write: 'письмо',
  scramble: 'собери',
  match: 'пары',
  gap: 'вставь',
};

export type FormatCounts = Record<ExamFormat, number>;

/** Как defaultFormats на сервере (перевод): 40% выбор, 25% письмо, 15% собери, 20% пары */
export function defaultFormats(n: number): FormatCounts {
  const shares: FormatCounts = { choice: 0.4, write: 0.25, scramble: 0.15, match: 0.2, gap: 0 };
  const raw = FORMATS.map((f) => [f, shares[f] * n] as const);
  const out = Object.fromEntries(raw.map(([f, v]) => [f, Math.floor(v)])) as FormatCounts;
  let rest = n - FORMATS.reduce((a, f) => a + out[f], 0);
  for (const [f] of [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (rest <= 0) break;
    if (shares[f] === 0) continue;
    out[f]++;
    rest--;
  }
  if (out.match > 0 && out.match < PAIR_MIN) {
    out.choice += out.match;
    out.match = 0;
  }
  return out;
}

/** Рекомендованное время: сумма × 1,2, вверх до целой минуты */
export function recommendedTime(counts: FormatCounts) {
  const sec = FORMATS.reduce((sum, f) => sum + (counts[f] || 0) * SECONDS[f], 0);
  const withReserve = Math.round(sec * TIME_RESERVE);
  return { baseSec: sec, sec: withReserve, minutes: Math.max(1, Math.ceil(withReserve / 60)) };
}

/** «8 выборов × 13 с + … = 5 мин 45 с, плюс 20% запаса — 6 мин 54 с, округляем до 7 мин» */
export function timeExplanation(counts: FormatCounts): string {
  const t = recommendedTime(counts);
  const parts = FORMATS.filter((f) => counts[f] > 0).map(
    (f) => `${counts[f]} ${FORMAT_SHORT[f]} × ${SECONDS[f]} с`
  );
  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} мин ${r} с` : `${m} мин`;
  };
  return `${parts.join(' + ')} = ${mmss(t.baseSec)}, плюс 20% запаса — ${mmss(t.sec)}, округляем до ${t.minutes} мин.`;
}
