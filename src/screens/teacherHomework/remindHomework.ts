/** «Напомнить» выбранным по заданию — общее для RN- и Swift-окна «Кто не сдал» (Teacher 23). */
import { toast } from '@/components/ui';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';

/** Сколько учеников получили напоминание; null — ошибка (тост уже показан) */
export async function remindSelected(homeworkId: string, ids: string[]): Promise<number | null> {
  Analytics.teacherAction('remind', 'course');
  const res = await NeonService.remindHomework(homeworkId, ids);
  if (!res) {
    toast.error('Не получилось напомнить. Проверь интернет');
    return null;
  }
  return res.reminded;
}
