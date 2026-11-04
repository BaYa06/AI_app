/**
 * Импорт наборов библиотеки из Excel (Neon).
 *
 *   npx tsx scripts/import-library.ts path/to/sets.xlsx [--dry-run] [--publish]
 *
 * --dry-run  всё выполняется в транзакции и откатывается: отчёт точный, в базе ничего не меняется
 * --publish  черновики из файла сделать видимыми всем (draft → published); снятые вручную (archived) не трогаем
 *
 * Наборы пишутся напрямую в library_sets / library_cards от служебного автора LIBRARY_AUTHOR_ID
 * (scripts/create-library-author.ts), original_set_id = NULL. Новый набор — черновик (status = 'draft').
 * Повторный запуск находит набор по title + языкам и заменяет карточки целиком: у пользователей,
 * взявших набор, своя копия в card_sets, а лайки, оценки и imports_count остаются на строке набора.
 *
 * Формат файла и план: plan/new/library_import.md.
 */

import fs from 'fs';
import path from 'path';
import { connect, describeError, getLibraryAuthorId, type Db } from './lib/db';
import { normalizeTerm } from './lib/excel';
import { parseLibraryWorkbook, type ParsedLibrarySet } from './lib/libraryExcel';

interface Args {
  file: string;
  dryRun: boolean;
  publish: boolean;
}

type SetStatus = 'draft' | 'published' | 'archived';

interface SetReport {
  title: string;
  change: 'новый' | 'обновлён' | 'без изменений';
  status: SetStatus;
  cards: number;
}

interface LibrarySetRow {
  id: string;
  title: string;
  kind: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  cover_emoji: string | null;
  status: SetStatus;
}

const STATUS_LABEL: Record<SetStatus, string> = {
  draft: 'черновик',
  published: 'в библиотеке',
  archived: 'снят с публикации',
};

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const known = new Set(['--dry-run', '--publish']);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (unknown.length > 0 || positional.length !== 1) {
    if (unknown.length > 0) console.error(`Неизвестные флаги: ${unknown.join(', ')}`);
    console.error(
      'Использование: npx tsx scripts/import-library.ts path/to/sets.xlsx [--dry-run] [--publish]'
    );
    process.exit(2);
  }
  return {
    file: path.resolve(positional[0]),
    dryRun: flags.has('--dry-run'),
    publish: flags.has('--publish'),
  };
}

/**
 * Набор автора с тем же title (по normalizeTerm) и языками; если таких несколько — самый ранний.
 * Сравниваем в JS, а не lower() в SQL: lower() для кириллицы зависит от локали базы.
 */
async function findSet(
  db: Db,
  authorId: string,
  set: ParsedLibrarySet
): Promise<LibrarySetRow | null> {
  const rows = await db.query<LibrarySetRow>(
    `SELECT id, title, kind, description, category, tags, cover_emoji, status FROM library_sets
      WHERE user_id = $1 AND language_from = $2 AND language_to = $3
      ORDER BY published_at, id FOR UPDATE`,
    [authorId, set.languageFrom, set.languageTo]
  );
  const key = normalizeTerm(set.title);
  return rows.rows.find((row) => normalizeTerm(row.title) === key) ?? null;
}

async function cardsChanged(db: Db, setId: string, set: ParsedLibrarySet): Promise<boolean> {
  const rows = await db.query<{ front: string; back: string; hint: string | null }>(
    'SELECT front, back, hint FROM library_cards WHERE library_set_id = $1 ORDER BY order_index, id',
    [setId]
  );
  if (rows.rows.length !== set.cards.length) return true;
  return rows.rows.some((row, i) => {
    const card = set.cards[i];
    return (
      row.front !== card.term ||
      row.back !== card.translation ||
      (row.hint || null) !== card.example
    );
  });
}

async function replaceCards(db: Db, setId: string, set: ParsedLibrarySet): Promise<void> {
  await db.query('DELETE FROM library_cards WHERE library_set_id = $1', [setId]);
  // order_index с 0 — как при публикации из приложения (api/library.js).
  await db.query(
    `INSERT INTO library_cards (library_set_id, front, back, hint, order_index)
     SELECT $1, v.front, v.back, v.hint, v.ord - 1
       FROM unnest($2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS v(front, back, hint, ord)`,
    [
      setId,
      set.cards.map((c) => c.term),
      set.cards.map((c) => c.translation),
      set.cards.map((c) => c.example),
    ]
  );
}

async function upsertSet(
  db: Db,
  authorId: string,
  set: ParsedLibrarySet,
  publish: boolean
): Promise<SetReport> {
  const report = (change: SetReport['change'], status: SetStatus): SetReport => ({
    title: set.title,
    change,
    status,
    cards: set.cards.length,
  });
  const existing = await findSet(db, authorId, set);

  if (!existing) {
    const status: SetStatus = publish ? 'published' : 'draft';
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO library_sets (user_id, original_set_id, title, description, category, tags,
                                 language_from, language_to, cards_count, cover_emoji, status, kind)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        authorId,
        set.title,
        set.description,
        set.category,
        set.tags,
        set.languageFrom,
        set.languageTo,
        set.cards.length,
        set.coverEmoji,
        status,
        set.kind,
      ]
    );
    await replaceCards(db, inserted.rows[0].id, set);
    return report('новый', status);
  }

  const metaChanged =
    existing.title !== set.title ||
    existing.kind !== set.kind ||
    existing.description !== set.description ||
    existing.category !== set.category ||
    existing.cover_emoji !== set.coverEmoji ||
    JSON.stringify(existing.tags ?? []) !== JSON.stringify(set.tags);
  const cardsDiffer = await cardsChanged(db, existing.id, set);
  const goLive = publish && existing.status === 'draft';
  const status: SetStatus = goLive ? 'published' : existing.status;

  if (!metaChanged && !cardsDiffer && !goLive) return report('без изменений', status);

  if (cardsDiffer) await replaceCards(db, existing.id, set);
  // published_at = момент выхода в библиотеку: от него считается сортировка «Новые».
  await db.query(
    `UPDATE library_sets SET title = $2, description = $3, category = $4, tags = $5, cover_emoji = $6,
            cards_count = $7, status = $8, updated_at = NOW(),
            published_at = CASE WHEN $9 THEN NOW() ELSE published_at END, kind = $10
      WHERE id = $1`,
    [
      existing.id,
      set.title,
      set.description,
      set.category,
      set.tags,
      set.coverEmoji,
      set.cards.length,
      status,
      goLive,
      set.kind,
    ]
  );
  return report('обновлён', status);
}

function printReport(
  reports: SetReport[],
  notInFile: { title: string; status: SetStatus }[],
  args: Args
): void {
  const count = (change: SetReport['change']) => reports.filter((r) => r.change === change).length;
  const cards = reports.reduce((sum, r) => sum + r.cards, 0);

  console.log('');
  if (args.dryRun)
    console.log('DRY-RUN — всё откатено, база не изменена. Так будет после настоящего импорта:\n');
  console.log(
    `Наборы: ${reports.length} (${count('новый')} новых, ${count('обновлён')} обновлено, ` +
      `${count('без изменений')} без изменений), карточек ${cards}`
  );
  for (const r of reports) {
    console.log(
      `  ${r.change === 'новый' ? '+' : r.change === 'обновлён' ? '~' : '='} ${r.title} — ${r.cards} карт., ${STATUS_LABEL[r.status]}`
    );
  }

  const drafts = reports.filter((r) => r.status === 'draft').length;
  if (drafts > 0 && !args.publish)
    console.log(`\nЧерновиков: ${drafts}. Чтобы показать их в библиотеке, запустите с --publish.`);
  if (reports.some((r) => r.status === 'archived')) {
    console.log('\nНаборы «снят с публикации» сняли вручную — --publish их не возвращает.');
  }
  if (notInFile.length > 0) {
    console.log(`\nНаборы автора, которых нет в этом файле (не тронуты): ${notInFile.length}`);
    for (const s of notInFile) console.log(`  ${s.title} — ${STATUS_LABEL[s.status]}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.file)) {
    console.error(`Файл не найден: ${args.file}`);
    process.exit(2);
  }

  // 1. Разбор и валидация — до любого обращения к базе.
  const parsed = await parseLibraryWorkbook(args.file);
  for (const w of parsed.warnings) console.warn(`⚠️  ${w}`);
  if (parsed.errors.length > 0) {
    console.error(`\n❌ Ошибок: ${parsed.errors.length}. Ничего не записано.\n`);
    for (const e of parsed.errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  const cardsTotal = parsed.sets.reduce((sum, s) => sum + s.cards.length, 0);
  console.log(`✅ Файл корректен: ${parsed.sets.length} наборов, ${cardsTotal} карточек`);

  // 2. Запись — одна транзакция. При dry-run она откатывается.
  const authorId = getLibraryAuthorId();
  const db = await connect();
  const reports: SetReport[] = [];
  let notInFile: { title: string; status: SetStatus }[] = [];

  try {
    await db.query('BEGIN');
    // Не даём двум импортам идти одновременно.
    await db.query("SELECT pg_advisory_xact_lock(hashtext('flashly:import-library'))");

    // Библиотека показывает только наборы админов (api/library.js, ADMIN_AUTHOR).
    const author = await db.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [authorId]
    );
    if (author.rows.length === 0 || !author.rows[0].is_admin) {
      throw new Error(
        `LIBRARY_AUTHOR_ID ${authorId} не найден в users или у него is_admin = false`
      );
    }

    for (const set of parsed.sets) reports.push(await upsertSet(db, authorId, set, args.publish));

    const inFile = new Set(
      parsed.sets.map((s) => `${normalizeTerm(s.title)}|${s.languageFrom}|${s.languageTo}`)
    );
    const all = await db.query<{
      title: string;
      language_from: string;
      language_to: string;
      status: SetStatus;
    }>(
      'SELECT title, language_from, language_to, status FROM library_sets WHERE user_id = $1 ORDER BY title',
      [authorId]
    );
    notInFile = all.rows
      .filter((r) => !inFile.has(`${normalizeTerm(r.title)}|${r.language_from}|${r.language_to}`))
      .map((r) => ({ title: r.title, status: r.status }));

    await db.query(args.dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }

  printReport(reports, notInFile, args);
}

main().catch((error: unknown) => {
  console.error(`\n❌ Импорт прерван, изменения откатены: ${describeError(error)}`);
  process.exit(1);
});
