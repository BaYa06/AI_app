import { describe, expect, it } from '@jest/globals';
import { parseSetOrigin, setOriginIcon } from '../setOrigin';

describe('setOrigin', () => {
  it('известные значения проходят, остальное — undefined', () => {
    expect(parseSetOrigin('ai')).toBe('ai');
    expect(parseSetOrigin('share')).toBe('share');
    expect(parseSetOrigin(null)).toBeUndefined();
    expect(parseSetOrigin('telepathy')).toBeUndefined();
  });

  it('учебник важнее origin; старый набор — общий значок', () => {
    expect(setOriginIcon({ isOfficial: true, origin: 'manual' })).toBe('book');
    expect(setOriginIcon({ origin: 'file' })).toBe('file');
    expect(setOriginIcon({})).toBe('set');
  });
});
