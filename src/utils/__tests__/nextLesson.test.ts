import { describe, expect, it } from '@jest/globals';
import { getNextLesson } from '../nextLesson';

// Четверг, 12 ноября 2026, 16:43 по часам устройства
const THU = new Date(2026, 10, 12, 16, 43);
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => ({ day, time: '10:30' }));

describe('getNextLesson', () => {
  it('нет расписания — null', () => {
    expect(getNextLesson(null, THU)).toBeNull();
    expect(getNextLesson([], THU)).toBeNull();
  });

  it('сегодняшний урок уже прошёл — завтра', () => {
    const next = getNextLesson(WEEKDAYS, THU);
    expect(next?.label).toBe('Завтра, пт · 10:30');
    expect(next?.date).toEqual(new Date(2026, 10, 13, 10, 30));
  });

  it('урок сегодня ещё впереди — «Сегодня»', () => {
    const morning = new Date(2026, 10, 12, 9, 0);
    expect(getNextLesson(WEEKDAYS, morning)?.label).toBe('Сегодня · 10:30');
  });

  it('после пятницы — понедельник с датой', () => {
    const friEvening = new Date(2026, 10, 13, 18, 0);
    expect(getNextLesson(WEEKDAYS, friEvening)?.label).toBe('Пн, 16 ноября · 10:30');
  });

  it('один день в неделю, время уже прошло — через неделю', () => {
    const next = getNextLesson([{ day: 'thu', time: '10:30' }], THU);
    expect(next?.date).toEqual(new Date(2026, 10, 19, 10, 30));
    expect(next?.label).toBe('Чт, 19 ноября · 10:30');
  });

  it('берёт самый ранний из нескольких дней', () => {
    const next = getNextLesson(
      [
        { day: 'sat', time: '09:00' },
        { day: 'fri', time: '18:00' },
      ],
      THU
    );
    expect(next?.label).toBe('Завтра, пт · 18:00');
  });

  it('битые записи пропускает', () => {
    expect(
      getNextLesson(
        [
          { day: 'xyz', time: '10:30' },
          { day: 'fri', time: '25:00' },
        ],
        THU
      )
    ).toBeNull();
  });
});
