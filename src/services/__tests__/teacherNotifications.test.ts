import { describe, expect, it } from '@jest/globals';
import { notificationTime, rewriteTeacherLink, teacherLinkTarget } from '../teacherNotifications';

const on = { lessonPrep: true, insights: true };
const off = { lessonPrep: false, insights: false };

describe('ссылки уведомлений учителя', () => {
  it('куда ведёт тап при включённых этапах', () => {
    expect(teacherLinkTarget('flashly://lesson-prep/c1?from=push', on)).toEqual({
      screen: 'TeacherLessonPrep',
      params: { courseId: 'c1' },
    });
    expect(teacherLinkTarget('flashly://teacher/c1?from=push', on)).toEqual({
      screen: 'TeacherCourseStats',
      params: { courseId: 'c1' },
    });
    expect(teacherLinkTarget('flashly://teacher/c1/students', on)).toEqual({
      screen: 'TeacherStudents',
      params: { courseId: 'c1' },
    });
    expect(teacherLinkTarget('flashly://teacher-homework/c1/h1?from=push', on)).toEqual({
      screen: 'TeacherHomework',
      params: { courseId: 'c1', homeworkId: 'h1' },
    });
    expect(teacherLinkTarget('flashly://teacher-student/c1/u1', on)).toEqual({
      screen: 'StudentDetail',
      params: { courseId: 'c1', studentId: 'u1' },
    });
    expect(teacherLinkTarget('flashly://teacher-notifications?from=push', on)).toEqual({
      screen: 'TeacherNotifications',
      params: undefined,
    });
  });

  it('выключенный этап — ближайший работающий экран', () => {
    expect(teacherLinkTarget('flashly://lesson-prep/c1', off)?.screen).toBe('TeacherCourseStats');
    expect(teacherLinkTarget('flashly://teacher-student/c1/u1', off)?.screen).toBe(
      'TeacherStudents'
    );
    expect(teacherLinkTarget('flashly://teacher-notifications', off)).toBeNull();
  });

  it('чужие и пустые ссылки — null', () => {
    expect(teacherLinkTarget(null, on)).toBeNull();
    expect(teacherLinkTarget('https://example.com/teacher/c1', on)).toBeNull();
    expect(teacherLinkTarget('flashly://lesson?from=push', on)).toBeNull();
    expect(teacherLinkTarget('flashly://teacher-homework/c1', on)).toBeNull();
  });

  it('ссылка пуша переписывается только для выключенных экранов', () => {
    expect(rewriteTeacherLink('flashly://lesson-prep/c1?from=push', off)).toBe(
      'flashly://teacher/c1?from=push'
    );
    expect(rewriteTeacherLink('flashly://teacher-student/c1/u1?from=push', off)).toBe(
      'flashly://teacher/c1/students?from=push'
    );
    expect(rewriteTeacherLink('flashly://lesson-prep/c1?from=push', on)).toBe(
      'flashly://lesson-prep/c1?from=push'
    );
    expect(rewriteTeacherLink('flashly://lesson?from=push', off)).toBe(
      'flashly://lesson?from=push'
    );
  });
});

describe('время уведомления', () => {
  const now = new Date(2026, 10, 12, 18, 0);
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();

  it('сейчас, сегодня, вчера, на неделе, давно', () => {
    expect(notificationTime(at(12, 17, 58), now)).toBe('сейчас');
    expect(notificationTime(at(12, 17, 20), now)).toBe('17:20');
    expect(notificationTime(at(11, 12), now)).toBe('вчера');
    expect(notificationTime(at(9, 9), now)).toBe('пн, 09:00');
    expect(notificationTime(at(3, 9), now)).toBe('03.11');
    expect(notificationTime('нет', now)).toBe('');
  });
});
