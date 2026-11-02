/**
 * Служебный автор библиотеки «Flashly» — владелец наборов, загруженных scripts/import-library.ts.
 *
 *   npx tsx scripts/create-library-author.ts
 *
 * Создаёт строку в users (is_admin, без email) и печатает её id для LIBRARY_AUTHOR_ID в .env.local.
 * users.id — это id пользователя Supabase Auth; у служебного id его нет, поэтому войти в аккаунт
 * и удалить его из приложения нельзя (удаление аккаунта стирает library_sets владельца, api/data.js).
 * Идемпотентно: повторный запуск находит того же автора по user_name. Запускать на каждой базе (dev, prod).
 *
 * План: plan/new/library_import.md, LibImport 1.
 */

import { connect, describeError } from './lib/db';

const USER_NAME = '@flashly';
const DISPLAY_NAME = 'Flashly';

async function main(): Promise<void> {
  const db = await connect();
  try {
    await db.query('BEGIN');
    const existing = await db.query<{ id: string; email: string | null; is_admin: boolean }>(
      'SELECT id, email, is_admin FROM users WHERE user_name = $1 FOR UPDATE',
      [USER_NAME],
    );

    let id: string;
    let status: string;
    if (existing.rows.length === 0) {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO users (id, email, display_name, user_name, is_anonymous, is_admin, onboarding_completed)
         VALUES (gen_random_uuid(), NULL, $1, $2, false, true, true) RETURNING id`,
        [DISPLAY_NAME, USER_NAME],
      );
      id = inserted.rows[0].id;
      status = 'создан';
    } else {
      const row = existing.rows[0];
      // Ник могли занять настоящим аккаунтом — такой не годится: в него можно войти и удалить.
      if (row.email !== null) {
        throw new Error(`${USER_NAME} уже занят пользователем ${row.id} с email — это не служебный аккаунт`);
      }
      if (!row.is_admin) await db.query('UPDATE users SET is_admin = true WHERE id = $1', [row.id]);
      id = row.id;
      status = row.is_admin ? 'уже есть' : 'найден, выдан is_admin';
    }
    await db.query('COMMIT');

    console.log(`Автор библиотеки «${DISPLAY_NAME}» (${USER_NAME}) — ${status}.`);
    console.log(`\nДобавьте в .env.local:\nLIBRARY_AUTHOR_ID=${id}`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n❌ ${describeError(error)}`);
  process.exit(1);
});
