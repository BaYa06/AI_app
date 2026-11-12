/**
 * «Оценки в Excel» (plan/new/teacher_cabinet.md, Teacher 22): файл собирается настоящим exceljs,
 * даты — в поясе курса, порядок строк как на экране сдачи.
 */
import { describe, expect, it } from '@jest/globals';
import ExcelJS from 'exceljs';
import {
  buildHomeworkWorkbook,
  exportFilename,
  exportRows,
  formatInZone,
} from '../_homeworkExcel.js';

const data = {
  homework: { id: 'h', title: 'Ünite 4', words: 48, dueAt: '2026-11-15T14:00:00Z', minScore: 80 },
  students: [
    {
      displayName: 'Белек',
      status: 'in_progress',
      credited: 32,
      score: 90,
      submittedAt: null,
      late: false,
      fixed: null,
    },
    {
      displayName: 'Kanayım',
      status: 'submitted',
      credited: 48,
      score: 98,
      submittedAt: '2026-11-14T10:05:00Z',
      late: false,
      fixed: 40,
    },
    {
      displayName: 'Бекжан',
      status: 'not_started',
      credited: 0,
      score: null,
      submittedAt: null,
      late: false,
      fixed: null,
    },
  ],
};

describe('выгрузка оценок', () => {
  it('дата в поясе курса (Бишкек +6)', () => {
    expect(formatInZone('2026-11-15T14:00:00Z', 'Asia/Bishkek')).toBe('15.11.2026 20:00');
    expect(formatInZone(null, 'Asia/Bishkek')).toBe('');
  });

  it('порядок и имя файла', () => {
    expect(exportRows(data.students).map((s) => s.displayName)).toEqual([
      'Kanayım',
      'Белек',
      'Бекжан',
    ]);
    expect(exportFilename('Ünite 4/5', 'A1-B')).toBe('Оценки — A1-B — Ünite 4 5.xlsx');
  });

  it('файл открывается и содержит оценки', async () => {
    const file = await buildHomeworkWorkbook(data, {
      courseTitle: 'A1-B',
      timeZone: 'Asia/Bishkek',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(file.base64, 'base64'));
    const ws = wb.getWorksheet('Оценки');
    expect(ws.getCell('A1').value).toBe('Задание: Ünite 4');
    expect(ws.getCell('A4').value).toBe('Срок: 15.11.2026 20:00');
    expect(ws.getRow(8).values.slice(1)).toEqual([
      'Kanayım',
      'Сдано',
      '48 из 48',
      98,
      '14.11.2026 16:05',
      'Нет',
      40,
    ]);
  });
});
