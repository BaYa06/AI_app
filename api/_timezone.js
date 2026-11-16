/**
 * Время в поясе курса — без тяжёлых библиотек.
 * Вынесено из _homeworkExcel.js (plan/new/vercel_cpu.md, CPU 2): push и учительские ручки брали
 * отсюда только formatInZone, а вместе с ним при каждом холодном старте грузился exceljs (~280 мс CPU).
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 */

export const DEFAULT_TIMEZONE = 'Asia/Bishkek';

/** «15.11.2026 20:00» в поясе курса */
export function formatInZone(value, timeZone) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}
