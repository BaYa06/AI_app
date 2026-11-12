/**
 * «Оценки в Excel» по заданию (plan/new/teacher_cabinet.md, Teacher 22).
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельный роут.
 *
 * Лист «Оценки»: шапка (задание, курс, срок, порог) и по ученику — статус, засчитано, оценка,
 * дата сдачи, «с опозданием», «закреплено». Даты — строками в поясе курса: у Excel нет поясов,
 * а учитель ждёт своё время.
 */
import ExcelJS from 'exceljs';

export const DEFAULT_TIMEZONE = 'Asia/Bishkek';

const STATUS = { submitted: 'Сдано', in_progress: 'В процессе', not_started: 'Не начато' };

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

/** Порядок как на экране сдачи: сдавшие сверху по оценке, затем в процессе, затем не начали */
export function exportRows(students) {
  const rank = { submitted: 0, in_progress: 1, not_started: 2 };
  return [...students].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (b.score ?? -1) - (a.score ?? -1) ||
      b.credited - a.credited ||
      String(a.displayName).localeCompare(String(b.displayName), 'ru')
  );
}

/** Имя файла без символов, которые не любят файловые системы */
export function exportFilename(title, courseTitle) {
  const clean = (s) =>
    String(s || '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `Оценки — ${clean(courseTitle)} — ${clean(title)}.xlsx`.slice(0, 120);
}

/**
 * data — ответ homework-status ({ homework, students }).
 * @returns {Promise<{ filename: string, base64: string }>}
 */
export async function buildHomeworkWorkbook(data, { courseTitle, timeZone }) {
  const { homework, students } = data;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flashly';
  const ws = wb.addWorksheet('Оценки');

  ws.addRow([`Задание: ${homework.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`Курс: ${courseTitle || ''}`]);
  ws.addRow([`Слов: ${homework.words}`]);
  ws.addRow([`Срок: ${formatInZone(homework.dueAt, timeZone)}`]);
  ws.addRow([`Порог: ${homework.minScore != null ? `${homework.minScore}%` : 'без порога'}`]);
  ws.addRow([]);

  const header = ws.addRow([
    'Ученик',
    'Статус',
    'Засчитано слов',
    'Оценка, %',
    'Сдано',
    'С опозданием',
    'Закреплено (на «Знаю»)',
  ]);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFDBDBE6' } } };
  });

  for (const s of exportRows(students)) {
    ws.addRow([
      s.displayName,
      STATUS[s.status] || s.status,
      `${s.credited} из ${homework.words}`,
      s.score ?? '',
      formatInZone(s.submittedAt, timeZone),
      s.status === 'submitted' ? (s.late ? 'Да' : 'Нет') : '',
      s.fixed ?? '',
    ]);
  }

  ws.columns = [
    { width: 28 },
    { width: 14 },
    { width: 16 },
    { width: 12 },
    { width: 18 },
    { width: 14 },
    { width: 22 },
  ];
  const buffer = await wb.xlsx.writeBuffer();
  return {
    filename: exportFilename(homework.title, courseTitle),
    base64: Buffer.from(buffer).toString('base64'),
  };
}
