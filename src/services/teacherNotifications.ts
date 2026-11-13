/**
 * Колокольчик учителя (plan/new/teacher_cabinet.md, Teacher 49): записи журнала уведомлений,
 * куда ведёт тап и подпись времени. Без RN — проверяется тестами.
 * Ссылки — те же flashly://, что уходят в пушах (api/push/_registry.js, teacherLink).
 */
export interface TeacherNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  seen: boolean;
  /** Ушло пушем; false — запись только в колокольчике */
  pushed: boolean;
}

export interface TeacherLinkFlags {
  /** Этап 3 — экран «Перед уроком» */
  lessonPrep: boolean;
  /** Этап 4 — новый экран ученика и колокольчик */
  insights: boolean;
}

export type TeacherLinkTarget =
  | { screen: 'TeacherLessonPrep'; params: { courseId: string } }
  | { screen: 'TeacherCourseStats'; params: { courseId: string } }
  | { screen: 'TeacherStudents'; params: { courseId: string } }
  | { screen: 'TeacherHomework'; params: { courseId: string; homeworkId: string } }
  | { screen: 'StudentDetail'; params: { courseId: string; studentId: string } }
  | { screen: 'TeacherNotifications'; params: undefined };

const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** flashly://<путь>?… → части пути; не наша ссылка — null */
function pathParts(link: string | null | undefined): string[] | null {
  const m = /^flashly:\/\/([^?#]*)/.exec(link || '');
  if (!m) return null;
  return m[1].split('/').filter(Boolean).map(dec);
}

/**
 * Куда ведёт ссылка уведомления. Экран этапа, который выключен флагом, заменяется ближайшим
 * работающим: «Перед уроком» → страница курса, экран ученика → список учеников.
 */
export function teacherLinkTarget(
  link: string | null | undefined,
  flags: TeacherLinkFlags
): TeacherLinkTarget | null {
  const p = pathParts(link);
  if (!p || p.length === 0) return null;
  const [head, a, b] = p;
  if (head === 'lesson-prep' && a) {
    return flags.lessonPrep
      ? { screen: 'TeacherLessonPrep', params: { courseId: a } }
      : { screen: 'TeacherCourseStats', params: { courseId: a } };
  }
  if (head === 'teacher' && a) {
    return b === 'students'
      ? { screen: 'TeacherStudents', params: { courseId: a } }
      : { screen: 'TeacherCourseStats', params: { courseId: a } };
  }
  if (head === 'teacher-homework' && a && b) {
    return { screen: 'TeacherHomework', params: { courseId: a, homeworkId: b } };
  }
  if (head === 'teacher-student' && a && b) {
    return flags.insights
      ? { screen: 'StudentDetail', params: { courseId: a, studentId: b } }
      : { screen: 'TeacherStudents', params: { courseId: a } };
  }
  if (head === 'teacher-notifications') {
    return flags.insights ? { screen: 'TeacherNotifications', params: undefined } : null;
  }
  return null;
}

/**
 * Ссылка пуша → ссылка, которую понимает навигация этой сборки: выключенный флагом экран
 * заменяется работающим (см. teacherLinkTarget). Не ссылка учителя — как есть.
 */
export function rewriteTeacherLink(link: string, flags: TeacherLinkFlags): string {
  const p = pathParts(link);
  if (!p) return link;
  const enc = encodeURIComponent;
  if (p[0] === 'lesson-prep' && p[1] && !flags.lessonPrep) {
    return `flashly://teacher/${enc(p[1])}?from=push`;
  }
  if (p[0] === 'teacher-student' && p[1] && !flags.insights) {
    return `flashly://teacher/${enc(p[1])}/students?from=push`;
  }
  return link;
}

const DAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const pad = (n: number) => String(n).padStart(2, '0');

/** «сейчас» / «17:20» / «вчера» / «пн, 09:00» / «03.11» — по часам устройства */
export function notificationTime(createdAt: string, now: Date = new Date()): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (now.getTime() - d.getTime() < 5 * 60 * 1000 && now.getTime() >= d.getTime()) return 'сейчас';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return 'вчера';
  if (days < 7) return `${DAY_SHORT[d.getDay()]}, ${time}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

/** Текст пустого списка */
export const NOTIFICATIONS_EMPTY = 'Здесь появятся напоминания об уроках и итоги недели';
