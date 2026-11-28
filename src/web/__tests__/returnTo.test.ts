import { describe, expect, it } from '@jest/globals';
import { sanitizeReturnTo } from '../auth/returnTo';

describe('sanitizeReturnTo', () => {
  it('пускает свои пути', () => {
    expect(sanitizeReturnTo('/')).toBe('/');
    expect(sanitizeReturnTo('/courses/12?tab=exams')).toBe('/courses/12?tab=exams');
  });
  it('отбрасывает чужие адреса и схемы', () => {
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/javascript:alert(1)',
      'courses',
      '',
      null,
      undefined,
    ]) {
      expect(sanitizeReturnTo(bad as string | null)).toBeNull();
    }
  });
  it('отбрасывает управляющие символы и слишком длинное', () => {
    expect(sanitizeReturnTo('/a\nb')).toBeNull();
    expect(sanitizeReturnTo('/' + 'a'.repeat(400))).toBeNull();
  });
  it('не запоминает страницы входа — иначе петля', () => {
    expect(sanitizeReturnTo('/sign-in')).toBeNull();
    expect(sanitizeReturnTo('/auth-callback?code=1')).toBeNull();
  });
});
