/**
 * Задания «Начало пути» (plan/new/new_user_activation.md, Start 3.1, 3.9).
 *
 * Выполненное задание — строка onboarding_tasks; за каждое один раз в жизни аккаунта
 * +10 алмазов. Вставка и начисление — один запрос: повтор, второе устройство и переустановка
 * второй награды не дают. Задания и награды — только у новых учеников (выдан стартовый набор):
 * старые пользователи, создавая курс или добавляя набор, алмазов за «задания» не получают.
 */
import { HttpError } from '../../_access.js';

export const ONBOARDING_TASKS = [
  'first_lesson',
  'session',
  'photo',
  'library',
  'course',
  'push',
  'widget',
  'voice',
];
export const ONBOARDING_TASK_REWARD = 10;

export async function getOnboardingTasks(sql, me) {
  const [user] = await sql`
    SELECT starter_set_id, starter_set_issued_at, COALESCE(diamond, 0) AS diamond,
           native_language, target_languages, COALESCE(starter_extra, '{}'::jsonb) AS starter_extra
    FROM users WHERE id = ${me}::uuid
  `;
  if (!user) throw new HttpError(404, 'User not found');
  const rows = await sql`SELECT task FROM onboarding_tasks WHERE user_id = ${me}::uuid`;
  return {
    starterSetId: user.starter_set_id,
    startedAt: user.starter_set_issued_at ? new Date(user.starter_set_issued_at).getTime() : null,
    done: rows.map((r) => r.task),
    diamonds: user.diamond,
    reward: ONBOARDING_TASK_REWARD,
    // «Хочешь начать и <язык>?» (Start 4.3): изучаемые из онбординга и уже выданные доп. наборы
    nativeLanguage: user.native_language ?? null,
    targetLanguages: Array.isArray(user.target_languages) ? user.target_languages : [],
    extraStarterLanguages: Object.keys(user.starter_extra ?? {}),
  };
}

export async function completeOnboardingTask(sql, me, p) {
  const task = p.task;
  if (!ONBOARDING_TASKS.includes(task)) throw new HttpError(400, 'Unknown task');
  const awarded = await sql`
    WITH ins AS (
      INSERT INTO onboarding_tasks (user_id, task)
      SELECT ${me}::uuid, ${task}
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ${me}::uuid AND starter_set_id IS NOT NULL)
      ON CONFLICT (user_id, task) DO NOTHING
      RETURNING 1
    )
    UPDATE users SET diamond = COALESCE(diamond, 0) + ${ONBOARDING_TASK_REWARD}
    WHERE id = ${me}::uuid AND EXISTS (SELECT 1 FROM ins)
    RETURNING diamond
  `;
  if (awarded.length > 0) {
    return { awarded: ONBOARDING_TASK_REWARD, diamonds: awarded[0].diamond };
  }
  const [user] =
    await sql`SELECT COALESCE(diamond, 0) AS diamond FROM users WHERE id = ${me}::uuid`;
  return { awarded: 0, diamonds: user?.diamond ?? 0 };
}
