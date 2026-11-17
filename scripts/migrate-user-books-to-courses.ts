/**
 * Перенос выбранных книг центра в курсы (plan/new/center_books.md, этап 7, Center 16).
 *
 *   npx tsx scripts/migrate-user-books-to-courses.ts --staging          staging
 *   npx tsx scripts/migrate-user-books-to-courses.ts --prod             прод — только с разрешения
 *   … --dry-run                                                         только посчитать
 *
 * До этапа 7 ученик центра выбирал книгу в «Моих книгах» (таблица user_books). Теперь книга целиком —
 * его курс (courses.source_book_id). Для каждой строки user_books, у которой ещё нет курса этой книги,
 * создаём курс с названием книги — тем же запросом, что action book-course. Повторный запуск ничего не
 * дублирует (уникальный индекс миграции 054). Доступ к центру не проверяем: курс без доступа пустой,
 * слова придут после нового кода. user_books не трогаем — её читают приложения 1.9.x.
 */
import { connect, describeDatabaseTarget } from './lib/db';

const args = {
  prod: process.argv.includes('--prod'),
  dryRun: process.argv.includes('--dry-run'),
};

async function main() {
  const target = describeDatabaseTarget();
  console.log(
    `База: ${target.host}${target.isProd ? ' — РАБОЧАЯ (прод)' : target.isStaging ? ' — staging' : ''}`
  );
  if (target.isProd && !args.prod) {
    console.error('\n❌ Это рабочая база. Перенос в прод — только с разрешения и флагом --prod.');
    process.exit(2);
  }

  const db = await connect();
  try {
    const todo = await db.query<{ user_id: string; book_id: string; title: string }>(`
      SELECT ub.user_id, ub.book_id, b.title
        FROM user_books ub
        JOIN books b ON b.id = ub.book_id AND b.organization_id IS NOT NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM courses c WHERE c.user_id = ub.user_id AND c.source_book_id = ub.book_id
       )
    `);
    console.log(`Книг без курса: ${todo.rows.length}`);
    if (args.dryRun || todo.rows.length === 0) return;

    let created = 0;
    for (const row of todo.rows) {
      const r = await db.query(
        `INSERT INTO courses (id, user_id, title, source_book_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
         ON CONFLICT (user_id, source_book_id) WHERE source_book_id IS NOT NULL DO NOTHING`,
        [row.user_id, row.title, row.book_id]
      );
      created += r.rowCount ?? 0;
    }
    console.log(`Создано курсов: ${created}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
