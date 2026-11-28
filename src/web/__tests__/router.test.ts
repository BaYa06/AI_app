import { describe, expect, it } from '@jest/globals';
import { detectBase, matchRoute, stripBase, withBase } from '../router';

const defs = [
  { name: 'home', pattern: '/' },
  { name: 'courses', pattern: '/courses' },
  { name: 'course', pattern: '/courses/:id' },
  { name: 'student', pattern: '/courses/:id/students/:studentId' },
];

describe('matchRoute', () => {
  it('корень и простые пути', () => {
    expect(matchRoute('/', defs)?.name).toBe('home');
    expect(matchRoute('/courses', defs)?.name).toBe('courses');
  });
  it('параметры, query и хвостовой слеш не мешают', () => {
    expect(matchRoute('/courses/42?tab=exams', defs)).toEqual({
      name: 'course',
      params: { id: '42' },
    });
    expect(matchRoute('/courses/42/', defs)?.name).toBe('course');
    expect(matchRoute('/courses/a/students/b', defs)?.params).toEqual({ id: 'a', studentId: 'b' });
  });
  it('декодирует параметры, битая кодировка — не совпадение', () => {
    expect(matchRoute('/courses/%D0%B0', defs)?.params.id).toBe('а');
    expect(matchRoute('/courses/%E0%A4%A', defs)).toBeNull();
  });
  it('лишние и неизвестные сегменты — null', () => {
    expect(matchRoute('/courses/1/extra', defs)).toBeNull();
    expect(matchRoute('/nope', defs)).toBeNull();
  });
});

describe('префикс /teach', () => {
  it('определяется по адресу', () => {
    expect(detectBase('/teach')).toBe('/teach');
    expect(detectBase('/teach/courses')).toBe('/teach');
    expect(detectBase('/teachers')).toBe('');
    expect(detectBase('/courses')).toBe('');
  });
  it('снимается и добавляется', () => {
    expect(stripBase('/teach', '/teach')).toBe('/');
    expect(stripBase('/teach/courses/1', '/teach')).toBe('/courses/1');
    expect(stripBase('/courses', '')).toBe('/courses');
    expect(withBase('/courses', '/teach')).toBe('/teach/courses');
    expect(withBase('/', '')).toBe('/');
  });
});
