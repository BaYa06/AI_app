/**
 * Репетиция миграций перед переносом в прод (plan/new/official_site.md, «Перенос в прод», A2).
 *
 * Прогоняет на ВРЕМЕННОЙ ветке Neon (копия рабочей базы) ровно тот код, который выполнит прод
 * при первом запросе после деплоя, — ensureDatabaseInitialized из api/_db-init.js, — и печатает
 * состояние до и после.
 *
 * Запуск:
 *   1. Neon → Branches → Create branch из main (рабочая база), имя rehearsal-1-8.
 *   2. Строку подключения ЭТОЙ ветки положить в .env.rehearsal:
 *        REHEARSAL_DATABASE_URL="postgresql://…"
 *   3. node scripts/rehearse-migrations.mjs
 *   4. Ветку rehearsal-1-8 удалить.
 *
 * Скрипт отказывается работать с рабочей и тестовой базой (по адресу compute).
 */
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.rehearsal', quiet: true });

const FORBIDDEN = {
  'ep-misty-scene-ahkv29p5': 'рабочая база (main)',
  'ep-wild-king-ah80ir3s': 'тестовая база (staging)',
};

const url = process.env.REHEARSAL_DATABASE_URL;
if (!url) {
  console.error('Нет REHEARSAL_DATABASE_URL в .env.rehearsal — см. комментарий в начале файла.');
  process.exit(1);
}
const host = new URL(url).hostname;
for (const [ep, name] of Object.entries(FORBIDDEN)) {
  if (host.includes(ep)) {
    console.error(`Стоп: это ${name}. Нужна строка временной ветки rehearsal-1-8.`);
    process.exit(1);
  }
}

const sql = neon(url);

async function snapshot(title) {
  const q = async (text) => {
    try {
      return (await sql.query(text))[0];
    } catch (e) {
      return { error: e.message };
    }
  };
  console.log(`\n── ${title} ──`);
  console.log(
    'последняя миграция:',
    await q('SELECT max(name) AS name, count(*)::int AS total FROM app_migrations')
  );
  console.log(
    'наборы книг:',
    await q(`
    SELECT count(*)::int AS official,
           count(*) FILTER (WHERE user_id IS NOT NULL)::int AS with_owner,
           count(*) FILTER (WHERE course_id IS NOT NULL)::int AS with_course,
           count(*) FILTER (WHERE course_id IS NOT NULL AND announced_at IS NULL
                              AND created_at > NOW() - INTERVAL '7 days')::int AS push_new_set_risk
      FROM card_sets WHERE is_official`)
  );
  console.log(
    'триггеры защиты:',
    await q(`
    SELECT count(*) FILTER (WHERE tgname = 'trg_guard_official_sets')::int AS sets,
           count(*) FILTER (WHERE tgname = 'trg_guard_official_cards')::int AS cards
      FROM pg_trigger`)
  );
  console.log(
    'новые таблицы:',
    await q(`
    SELECT string_agg(table_name, ', ' ORDER BY table_name) AS present
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('streak_events', 'library_subjects', 'library_collections', 'book_unit_imports')`)
  );
  console.log(
    'колонка card_sets.kind:',
    await q(`
    SELECT count(*)::int AS exists FROM information_schema.columns
     WHERE table_name = 'card_sets' AND column_name = 'kind'`)
  );
  console.log(
    'объём:',
    await q(`
    SELECT (SELECT count(*) FROM users)::int AS users,
           (SELECT count(*) FROM card_sets)::int AS sets,
           (SELECT count(*) FROM cards)::int AS cards,
           (SELECT count(*) FROM library_sets)::int AS library_sets`)
  );
}

await snapshot('ДО');

// Тот же путь, что на проде. Ошибки ensureDatabaseInitialized только пишет в лог — поэтому
// успех проверяем по app_migrations ниже, а лог смотрим глазами.
const { ensureDatabaseInitialized } = await import('../api/_db-init.js');
const started = Date.now();
await ensureDatabaseInitialized(sql);
console.log(`\nмиграции заняли ${((Date.now() - started) / 1000).toFixed(1)} с`);

await snapshot('ПОСЛЕ');

const done = await sql`SELECT 1 FROM app_migrations WHERE name = 'schema_040'`;
console.log(
  done.length
    ? '\n✅ schema_040 применена. Пришли этот вывод целиком.'
    : '\n❌ schema_040 НЕ применена — выше должна быть ошибка db-init. Пришли вывод целиком.'
);
