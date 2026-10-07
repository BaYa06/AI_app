import { describe, expect, it } from '@jest/globals';
import type { Card } from '@/types';
import { recordExposures, takeReview, type ExposureMap } from '../widgetExperiment';

const card = (id: string) => ({ id }) as Card;

describe('widgetExperiment', () => {
  it('запоминает обе группы и не переписывает слово, уже попавшее в группу', () => {
    let map: ExposureMap = {};
    map = recordExposures(map, { pool: [card('a')], control: [card('b')] }, '2026-10-07');
    expect(map).toEqual({ a: { inWidget: true, day: '2026-10-07' }, b: { inWidget: false, day: '2026-10-07' } });
    const same = recordExposures(map, { pool: [card('b')], control: [card('a')] }, '2026-10-08');
    expect(same).toBe(map);
  });

  it('считает только повторение в следующие дни и только первое', () => {
    const map = recordExposures({}, { pool: [card('a')], control: [] }, '2026-10-07');
    expect(takeReview(map, 'a', '2026-10-07')).toBeNull();
    const taken = takeReview(map, 'a', '2026-10-08')!;
    expect(taken.exposure.inWidget).toBe(true);
    expect(takeReview(taken.map, 'a', '2026-10-09')).toBeNull();
    expect(takeReview(map, 'z', '2026-10-08')).toBeNull();
  });

  it('забывает слова, которые не повторяли 14 дней', () => {
    const old = recordExposures({}, { pool: [card('a')], control: [] }, '2026-09-20');
    const next = recordExposures(old, { pool: [card('b')], control: [] }, '2026-10-07');
    expect(Object.keys(next)).toEqual(['b']);
  });
});
