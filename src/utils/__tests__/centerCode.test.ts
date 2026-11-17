import { describe, expect, it } from '@jest/globals';
import {
  daysLeft,
  describeCenterReason,
  formatAccessDate,
  isCenterCode,
  isCourseCode,
  isJoinCodeReady,
  normalizeJoinCode,
  parseCenterJoin,
  parseTeacherInvite,
} from '../centerCode';

describe('код учителя или центра в одном поле (Center 5)', () => {
  it('нормализует ввод: заглавные, только буквы, цифры и дефис, до 14', () => {
    expect(normalizeJoinCode('alfa-dec-7k')).toBe('ALFA-DEC-7K');
    expect(normalizeJoinCode(' a l f a—dec ')).toBe('ALFADEC');
    expect(normalizeJoinCode('LINGUA-JAN-4F-EXTRA')).toBe('LINGUA-JAN-4F-');
  });

  it('отличает код курса от кода центра', () => {
    expect(isCourseCode('K7M2QX')).toBe(true);
    expect(isCenterCode('K7M2QX')).toBe(false);
    expect(isCenterCode('ALFA-DEC-7K')).toBe(true);
    expect(isCourseCode('ALFA-DEC-7K')).toBe(false);
  });

  it('незаконченный код искать нельзя', () => {
    expect(isJoinCodeReady('K7M2')).toBe(false);
    expect(isJoinCodeReady('ALFA-')).toBe(false);
    expect(isJoinCodeReady('-DEC')).toBe(false);
    expect(isJoinCodeReady('A-B')).toBe(false);
    expect(isJoinCodeReady('ALFA-DEC-7K')).toBe(true);
    expect(isJoinCodeReady('K7M2QX')).toBe(true);
  });

  it('у каждой причины свой понятный текст', () => {
    const texts = ['not_found', 'expired', 'full', 'contract_ended', 'rate_limited', 'network'].map(
      (r) => describeCenterReason(r as never)
    );
    expect(new Set(texts).size).toBe(texts.length);
    expect(describeCenterReason('expired')).toMatch(/менеджера курса/);
  });

  it('дата и дни доступа', () => {
    expect(formatAccessDate('2027-02-15T10:00:00Z')).toBe('15 февраля');
    expect(formatAccessDate(null)).toBe('');
    const now = Date.parse('2026-11-16T00:00:00Z');
    expect(daysLeft('2027-02-14T00:00:00Z', now)).toBe(90);
    expect(daysLeft('2026-11-01T00:00:00Z', now)).toBe(0);
  });

  it('ссылка /join/<код центра>: https и flashly://, токен курса — не центр', () => {
    expect(parseCenterJoin('https://flashlycards.app/join/ALFA-DEC-7K')).toBe('ALFA-DEC-7K');
    expect(parseCenterJoin('flashly://join/alfa-dec-7k')).toBe('ALFA-DEC-7K');
    expect(parseCenterJoin('https://x.app/join/ALFA-DEC-7K?utm=qr')).toBe('ALFA-DEC-7K');
    expect(parseCenterJoin(`https://x.app/join/${'a'.repeat(64)}`)).toBeNull();
    expect(parseCenterJoin('https://x.app/join/K7M2QX')).toBeNull();
    expect(parseCenterJoin('https://x.app/s/ABC-DEF')).toBeNull();
  });
});

describe('ссылка для учителей центра (Center 13)', () => {
  it('https, flashly:// и путь на вебе', () => {
    expect(parseTeacherInvite('https://flashlycards.app/t/Ab3_x-9QzK1mNpLs')).toBe(
      'Ab3_x-9QzK1mNpLs'
    );
    expect(parseTeacherInvite('flashly://t/Ab3_x-9QzK1mNpLs')).toBe('Ab3_x-9QzK1mNpLs');
    expect(parseTeacherInvite('/t/Ab3_x-9QzK1mNpLs')).toBe('Ab3_x-9QzK1mNpLs');
    expect(parseTeacherInvite('https://flashlycards.app/t/Ab3_x-9QzK1mNpLs?x=1')).toBe(
      'Ab3_x-9QzK1mNpLs'
    );
  });
  it('чужие адреса и короткий код — нет', () => {
    expect(parseTeacherInvite('https://evil.example/t/Ab3_x-9QzK1mNpLs')).toBeNull();
    expect(parseTeacherInvite('https://flashlycards.app/t/abc')).toBeNull();
    expect(parseTeacherInvite('https://flashlycards.app/join/ALFA-DEC-7K')).toBeNull();
  });
});
