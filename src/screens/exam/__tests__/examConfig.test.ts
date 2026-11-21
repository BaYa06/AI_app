/**
 * Клиентские настройки экзамена совпадают с серверными (api/_exam/build.js) — иначе «Советуем»
 * на экране разойдётся с тем, что посчитает сервер.
 */
import { describe, expect, it } from '@jest/globals';
import {
  SECONDS,
  TIME_RESERVE,
  defaultFormats,
  recommendedTime,
  timeExplanation,
} from '../examConfig';
import * as server from '../../../../api/_exam/build.js';

describe('настройки экзамена: клиент = сервер', () => {
  it('секунды и запас', () => {
    expect(SECONDS).toEqual(server.SECONDS);
    expect(TIME_RESERVE).toBe(server.TIME_RESERVE);
  });
  it('доли форматов и время для 5…40 слов', () => {
    for (let n = 5; n <= 40; n++) {
      const f = defaultFormats(n);
      expect(f).toEqual(server.defaultFormats(n));
      expect(recommendedTime(f)).toEqual(server.recommendedTime(f));
    }
  });
  it('пояснение «Как посчитали»: 20 слов → 7 минут', () => {
    expect(timeExplanation(defaultFormats(20))).toBe(
      '8 выбор × 13 с + 5 письмо × 28 с + 3 собери × 23 с + 4 пары × 8 с = 5 мин 45 с, плюс 20% запаса — 6 мин 54 с, округляем до 7 мин.'
    );
  });
});
