/**
 * api/data.js — удаление аккаунта (Clean 10 — перенесено без изменений).
 */
import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../_access.js';
import { isAppleUser, isAppleRevokeConfigured, revokeAppleAuthorization } from '../../_apple.js';
import { log } from '../../_log.js';
import { optString } from './_shared.js';

/**
 * Удаляет все данные пользователя в Neon и сам аккаунт в Supabase (требование App Store 5.1.1(v)).
 * Почти всё уходит каскадом от users (наборы, курсы, прогресс, серия, награды, тесты). Таблицы без
 * внешнего ключа на users чистим сами, заодно откатываем лайки и оценки в чужих наборах библиотеки.
 * Если Supabase не ответит, данные в Neon уже удалены — повтор запроса безопасен.
 *
 * Аккаунт Sign in with Apple: сначала отзываем токен Apple (p.appleAuthorizationCode — свежий код
 * из повторного входа через Apple в приложении, api/_apple.js). Не вышло — ничего не удаляем.
 */
export async function deleteAccount(sql, me, p, user) {
  if (p.confirm !== 'DELETE') throw new HttpError(400, 'confirm required');
  if (process.env.ADMIN_USER_ID && me === process.env.ADMIN_USER_ID) {
    throw new HttpError(403, 'Admin account cannot be deleted from the app');
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new HttpError(503, 'Account deletion is not configured');

  if (isAppleUser(user)) {
    if (!isAppleRevokeConfigured())
      throw new HttpError(503, 'Apple token revocation is not configured');
    const code = optString(p.appleAuthorizationCode, 2000);
    if (!code) throw new HttpError(400, 'Apple authorization required');
    try {
      await revokeAppleAuthorization(code);
    } catch (e) {
      log.error('data', 'deleteAccount: Apple revoke failed', e);
      throw new HttpError(502, 'Failed to revoke Apple authorization');
    }
  }

  await sql.transaction([
    sql`
      UPDATE library_sets ls SET likes_count = GREATEST(ls.likes_count - 1, 0)
      FROM library_likes ll WHERE ll.library_set_id = ls.id AND ll.user_id = ${me}::uuid
    `,
    sql`
      UPDATE library_sets ls SET
        rating_sum = GREATEST(ls.rating_sum - lr.rating, 0),
        rating_count = GREATEST(ls.rating_count - 1, 0)
      FROM library_ratings lr WHERE lr.library_set_id = ls.id AND lr.user_id = ${me}::uuid
    `,
    sql`DELETE FROM library_likes WHERE user_id = ${me}::uuid`,
    sql`DELETE FROM library_ratings WHERE user_id = ${me}::uuid`,
    sql`DELETE FROM library_reports WHERE user_id = ${me}::uuid`,
    sql`DELETE FROM library_imports WHERE user_id = ${me}::uuid`,
    sql`DELETE FROM library_sets WHERE user_id = ${me}::uuid`,
    sql`DELETE FROM push_tokens WHERE user_id = ${me}::uuid`,
    sql`DELETE FROM api_rate_limits WHERE user_id = ${me}::uuid`,
    sql`DELETE FROM users WHERE id = ${me}::uuid`,
  ]);

  const supabaseUrl = process.env.SUPABASE_URL || 'https://yiwsmjbeirgomkrckoju.supabase.co';
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(me);
  if (error && error.status !== 404) {
    log.error('data', 'deleteAccount: Supabase deleteUser failed', error);
    throw new HttpError(502, 'Failed to delete auth user');
  }
  return true;
}
