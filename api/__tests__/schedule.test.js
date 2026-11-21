/**
 * Расписание занятий курса: какое время сервер принимает (parseSchedule).
 * Окно расписания выбирает время барабаном с шагом 5 минут — 18:05 не должно пропадать.
 */
import { describe, expect, it } from '@jest/globals';
import { parseSchedule } from '../_handlers/teacher/courses.js';

describe('parseSchedule', () => {
  it('принимает время, кратное 5 минутам', () => {
    expect(parseSchedule([{ day: 'mon', time: '18:05' }])).toEqual([{ day: 'mon', time: '18:05' }]);
    expect(parseSchedule([{ day: 'fri', time: '9:40' }])).toEqual([{ day: 'fri', time: '09:40' }]);
  });
  it('старое время с шагом 15 минут по-прежнему принимается', () => {
    expect(parseSchedule([{ day: 'tue', time: '10:30' }])).toEqual([{ day: 'tue', time: '10:30' }]);
  });
  it('отбрасывает некратное 5 и неверные значения', () => {
    expect(parseSchedule([{ day: 'mon', time: '18:07' }])).toBeNull();
    expect(parseSchedule([{ day: 'mon', time: '24:00' }])).toBeNull();
    expect(parseSchedule([{ day: 'xyz', time: '18:00' }])).toBeNull();
  });
  it('дни идут по порядку недели', () => {
    expect(
      parseSchedule([
        { day: 'thu', time: '18:05' },
        { day: 'mon', time: '18:05' },
      ])
    ).toEqual([
      { day: 'mon', time: '18:05' },
      { day: 'thu', time: '18:05' },
    ]);
  });
});
