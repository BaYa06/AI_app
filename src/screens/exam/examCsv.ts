/**
 * Итоги экзамена таблицей (plan/new/live_exam.md, LiveExam 23): CSV через «Поделиться» —
 * его открывают Excel и Google Таблицы на любом устройстве.
 */
import type { ExamResults } from '@/services/exam';

const cell = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function examCsv(data: ExamResults, courseTitle: string): string {
  const head = [
    `Экзамен: ${data.setTitle}`,
    `Курс: ${courseTitle}`,
    `Дата: ${new Date(data.date).toLocaleDateString('ru-RU')}`,
    `Слов: ${data.totalQuestions} · средний балл: ${data.avgScore}`,
    '',
    'Ученик,Балл из 100,Верно,Ошибки,Опечатка,Не та форма,Нет ответа,Изменён учителем,Комментарий,Вышел из приложения',
  ];
  const rows = data.students.map((s) =>
    [
      s.name,
      s.score,
      s.counts.correct,
      s.counts.wrong,
      s.counts.typo,
      s.counts.wrong_form,
      s.counts.none,
      s.overridden ? `Да (было ${s.computedScore})` : 'Нет',
      s.comment || '',
      s.leftReason ? 'Да' : s.awayCount ? `Выходил ×${s.awayCount}` : 'Нет',
    ]
      .map(cell)
      .join(',')
  );
  const absent = data.absent.map((a) => [a.name, 'не пришёл'].map(cell).join(','));
  return [...head, ...rows, ...absent].join('\n');
}
