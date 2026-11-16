/**
 * «Новое» — фича дня (plan/new/new_user_activation.md, Start 4.1)
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../localCache', () => ({ readCache: () => undefined, writeCache: jest.fn() }));

import { addHighlightLessonDay, dismissHighlight, pickHighlight } from '../dailyHighlight';

const opts = { isNewStudent: true, doneTasks: [], widgetAvailable: true };
const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 10)}`);

describe('pickHighlight', () => {
  it('день 1 (первый урок) — плашки нет', () => {
    expect(pickHighlight({ lessonDays: days(1), dismissed: [] }, '2026-11-10', opts)).toBeNull();
  });

  it('второй день с уроком — ИИ-импорт', () => {
    const s = { lessonDays: days(2), dismissed: [] };
    expect(pickHighlight(s, '2026-11-11', opts)).toEqual({ id: 'photo', day: 2 });
  });

  it('считаются дни с уроком, а не календарные: пропуск не сжигает фичу', () => {
    const s = { lessonDays: ['2026-11-10', '2026-11-15'], dismissed: [] };
    expect(pickHighlight(s, '2026-11-15', opts)?.id).toBe('photo');
  });

  it('сегодня урока ещё не было — плашки нет', () => {
    expect(pickHighlight({ lessonDays: days(2), dismissed: [] }, '2026-11-20', opts)).toBeNull();
  });

  it('задание уже выполнено — фича знакома, плашки нет', () => {
    const s = { lessonDays: days(2), dismissed: [] };
    expect(pickHighlight(s, '2026-11-11', { ...opts, doneTasks: ['photo'] })).toBeNull();
  });

  it('виджет недоступен — в его день плашки нет', () => {
    const s = { lessonDays: days(4), dismissed: [] };
    expect(pickHighlight(s, '2026-11-13', { ...opts, widgetAvailable: false })).toBeNull();
    expect(pickHighlight(s, '2026-11-13', opts)?.id).toBe('widget');
  });

  it('закрытая плашка больше не показывается', () => {
    const s = dismissHighlight({ lessonDays: days(3), dismissed: [] }, 'builder');
    expect(pickHighlight(s, '2026-11-12', opts)).toBeNull();
  });

  it('старый пользователь — никогда', () => {
    const s = { lessonDays: days(2), dismissed: [] };
    expect(pickHighlight(s, '2026-11-11', { ...opts, isNewStudent: false })).toBeNull();
  });

  it('седьмой день — итоги недели', () => {
    const s = { lessonDays: days(7), dismissed: [] };
    expect(pickHighlight(s, '2026-11-16', opts)).toEqual({ id: 'week', day: 7 });
  });
});

describe('addHighlightLessonDay', () => {
  it('один раз за дату и не больше 7 дней', () => {
    const s = { lessonDays: days(7), dismissed: [] };
    expect(addHighlightLessonDay(s, '2026-11-30')).toBe(s);
    const one = addHighlightLessonDay({ lessonDays: [], dismissed: [] }, '2026-11-10');
    expect(addHighlightLessonDay(one, '2026-11-10')).toBe(one);
  });
});
