/**
 * «Задание сдано!» (plan/new/teacher_cabinet.md, Teacher 28; макет У4) — подписи без RN.
 */
import { formatDue, type HomeworkSubmission, type StudentHomework } from '@/services/homework';
import { pluralize } from '@/utils';

export function homeworkDoneTexts(sub: HomeworkSubmission, hw: StudentHomework | undefined) {
  const wrong = hw?.wrongCardIds.length ?? 0;
  return {
    title: 'Задание сдано!',
    subtitle: hw
      ? `${hw.title} · ${sub.late ? 'с опозданием' : `в срок, до ${formatDue(hw.dueAt)}`}`
      : sub.late
        ? 'с опозданием'
        : 'в срок',
    words: hw ? `${hw.words}/${hw.words}` : null,
    score: `${sub.score}%`,
    diamonds: sub.diamonds > 0 ? `+${sub.diamonds}` : null,
    teacher: hw?.teacher ? `${hw.teacher} увидит результат` : 'Учитель увидит результат',
    group: hw ? `В группе сдали уже ${hw.group.submitted} из ${hw.group.assigned}` : null,
    hard:
      wrong > 0
        ? `Ещё путаешь ${wrong} ${pluralize(wrong, 'слово', 'слова', 'слов')} — они придут в повторение`
        : null,
  };
}
