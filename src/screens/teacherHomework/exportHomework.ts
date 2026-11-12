/**
 * «Оценки в Excel» (plan/new/teacher_cabinet.md, Teacher 22).
 * iOS и веб — настоящий .xlsx с сервера: iOS сохраняет во временную папку и открывает системное
 * «Поделиться» (Файлы, почта, мессенджеры), веб скачивает файл. Android: Share в RN не умеет
 * отдавать файл — делимся таблицей текстом (CSV, как «Результаты теста»), Excel её открывает.
 */
import { Platform, Share } from 'react-native';
import { NeonService } from '@/services/NeonService';
import { formatDue, type HomeworkStatusData } from '@/services/homework';
import { log } from '@/utils/logger';

const STATUS: Record<string, string> = {
  submitted: 'Сдано',
  in_progress: 'В процессе',
  not_started: 'Не начато',
};

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Таблица текстом для Android: те же колонки, что в .xlsx */
export function homeworkCsv(data: HomeworkStatusData, courseTitle: string): string {
  const { homework, students } = data;
  const head = [
    `Задание: ${homework.title}`,
    `Курс: ${courseTitle}`,
    `Срок: ${formatDue(homework.dueAt)}`,
    `Порог: ${homework.minScore !== null ? `${homework.minScore}%` : 'без порога'}`,
    '',
    'Ученик,Статус,Засчитано слов,Оценка %,Сдано,С опозданием,Закреплено',
  ];
  const rows = students.map((s) =>
    [
      s.displayName,
      STATUS[s.status] ?? s.status,
      `${s.credited} из ${homework.words}`,
      s.score ?? '',
      s.submittedAt ? formatDue(s.submittedAt) : '',
      s.status === 'submitted' ? (s.late ? 'Да' : 'Нет') : '',
      s.fixed ?? '',
    ]
      .map(csvCell)
      .join(',')
  );
  return [...head, ...rows].join('\n');
}

function downloadOnWeb(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** true — файл отдан пользователю (или он отменил «Поделиться»); false — ошибка */
export async function exportHomeworkGrades(
  data: HomeworkStatusData,
  courseTitle: string
): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Share.share({
        message: homeworkCsv(data, courseTitle),
        title: `Оценки — ${data.homework.title}`,
      });
      return true;
    }
    const file = await NeonService.exportHomework(data.homework.id);
    if (!file) return false;
    if (Platform.OS === 'web') {
      downloadOnWeb(file.filename, file.base64);
      return true;
    }
    const fsModule = require('react-native-fs');
    const RNFS = fsModule?.default ?? fsModule;
    const path = `${RNFS.CachesDirectoryPath}/${file.filename}`;
    await RNFS.writeFile(path, file.base64, 'base64');
    await Share.share({ url: `file://${path}`, title: file.filename });
    return true;
  } catch (e) {
    log.warn('Homework', 'export failed', e);
    return false;
  }
}
