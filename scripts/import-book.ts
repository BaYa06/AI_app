/**
 * Импорт книги из Excel в каталог (Neon).
 *
 *   npx tsx scripts/import-book.ts path/to/book.xlsx [--dry-run] [--publish] [--prune]
 *
 * --dry-run  всё выполняется в транзакции и откатывается: отчёт точный, в базе ничего не меняется
 * --publish  после импорта сделать книгу видимой всем (is_published = true)
 * --prune    удалить карточки, которых больше нет в Excel (с подтверждением; удаляет и прогресс учеников по ним)
 *
 * Идемпотентно: повторный запуск того же файла ничего не создаёт. Карточки сопоставляются по
 * нормализованному term внутри набора юнита и обновляются с сохранением id — прогресс SRS
 * учеников (card_progress привязан к card_id) не теряется.
 *
 * Формат файла и план: plan/book_catalog_plan.md, часть 2.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import type { Client } from 'pg';
import { connect, getAdminUserId } from './lib/db';
import { normalizeTerm, parseBookWorkbook, type ParsedBook, type ParsedUnit } from './lib/bookExcel';

interface Args {
  file: string;
  dryRun: boolean;
  publish: boolean;
  prune: boolean;
}

interface MissingCard {
  id: string;
  unitNumber: number;
  front: string;
}

interface Stats {
  bookStatus: 'создана' | 'обновлена' | 'без изменений';
  isPublished: boolean;
  unitsNew: number;
  unitsUpdated: number;
  unitsUnchanged: number;
  unitsNotInExcel: number[];
  cardsNew: number;
  cardsUpdated: number;
  cardsUnchanged: number;
  missing: MissingCard[];
  /** Юниты, где одновременно есть новые и пропавшие карточки — возможно, исправлена опечатка в term. */
  suspectRenames: number[];
  pruned: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const known = new Set(['--dry-run', '--publish', '--prune']);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (unknown.length > 0 || positional.length !== 1) {
    if (unknown.length > 0) console.error(`Неизвестные флаги: ${unknown.join(', ')}`);
    console.error('Использование: npx tsx scripts/import-book.ts path/to/book.xlsx [--dry-run] [--publish] [--prune]');
    process.exit(2);
  }
  return {
    file: path.resolve(positional[0]),
    dryRun: flags.has('--dry-run'),
    publish: flags.has('--publish'),
    prune: flags.has('--prune'),
  };
}

async function upsertBook(db: Client, book: ParsedBook, stats: Stats): Promise<string> {
  const existing = await db.query<{
    id: string; level: string | null; subject: string | null; language_from: string;
    language_to: string; publisher: string | null; is_published: boolean;
  }>(
    `SELECT id, level, subject, language_from, language_to, publisher, is_published
       FROM books WHERE title = $1 AND edition = $2 FOR UPDATE`,
    [book.title, book.edition],
  );

  if (existing.rows.length === 0) {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO books (title, edition, level, subject, language_from, language_to, publisher)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [book.title, book.edition, book.level, book.subject, book.languageFrom, book.languageTo, book.publisher],
    );
    stats.bookStatus = 'создана';
    stats.isPublished = false;
    return inserted.rows[0].id;
  }

  const row = existing.rows[0];
  stats.isPublished = row.is_published;
  const changed =
    row.level !== book.level || row.subject !== book.subject || row.language_from !== book.languageFrom ||
    row.language_to !== book.languageTo || row.publisher !== book.publisher;
  if (changed) {
    await db.query(
      `UPDATE books SET level = $2, subject = $3, language_from = $4, language_to = $5, publisher = $6, updated_at = NOW()
        WHERE id = $1`,
      [row.id, book.level, book.subject, book.languageFrom, book.languageTo, book.publisher],
    );
    stats.bookStatus = 'обновлена';
  }
  return row.id;
}

async function upsertUnit(db: Client, bookId: string, unit: ParsedUnit, sortOrder: number, stats: Stats): Promise<string> {
  const existing = await db.query<{ id: string; title: string; pages: string | null; sort_order: number }>(
    'SELECT id, title, pages, sort_order FROM book_units WHERE book_id = $1 AND number = $2',
    [bookId, unit.number],
  );
  if (existing.rows.length === 0) {
    const inserted = await db.query<{ id: string }>(
      'INSERT INTO book_units (book_id, number, title, pages, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [bookId, unit.number, unit.title, unit.pages, sortOrder],
    );
    stats.unitsNew++;
    return inserted.rows[0].id;
  }
  const row = existing.rows[0];
  if (row.title !== unit.title || row.pages !== unit.pages || row.sort_order !== sortOrder) {
    await db.query('UPDATE book_units SET title = $2, pages = $3, sort_order = $4 WHERE id = $1', [
      row.id, unit.title, unit.pages, sortOrder,
    ]);
    stats.unitsUpdated++;
  } else {
    stats.unitsUnchanged++;
  }
  return row.id;
}

/** Официальный набор юнита. На старте 1 юнит = 1 набор: берём самый ранний, если их несколько. */
async function upsertOfficialSet(
  db: Client, unitId: string, unit: ParsedUnit, book: ParsedBook, adminUserId: string,
): Promise<string> {
  const title = `Unit ${unit.number} — ${unit.title}`;
  const existing = await db.query<{ id: string; title: string; language_from: string | null; language_to: string | null }>(
    `SELECT id, title, language_from, language_to FROM card_sets
      WHERE unit_id = $1 AND is_official = true ORDER BY created_at LIMIT 1`,
    [unitId],
  );
  if (existing.rows.length === 0) {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO card_sets (user_id, title, description, category, language_from, language_to,
                              is_public, unit_id, is_official, total_cards)
       VALUES ($1, $2, '', 'general', $3, $4, false, $5, true, 0) RETURNING id`,
      [adminUserId, title, book.languageFrom, book.languageTo, unitId],
    );
    return inserted.rows[0].id;
  }
  const row = existing.rows[0];
  if (row.title !== title || row.language_from !== book.languageFrom || row.language_to !== book.languageTo) {
    await db.query(
      'UPDATE card_sets SET title = $2, language_from = $3, language_to = $4, updated_at = NOW() WHERE id = $1',
      [row.id, title, book.languageFrom, book.languageTo],
    );
  }
  return row.id;
}

async function syncCards(db: Client, setId: string, unit: ParsedUnit, stats: Stats): Promise<void> {
  const existing = await db.query<{ id: string; front: string; back: string; example: string | null; sort_order: number | null }>(
    'SELECT id, front, back, example, sort_order FROM cards WHERE set_id = $1 ORDER BY sort_order NULLS LAST, created_at',
    [setId],
  );
  const byKey = new Map<string, (typeof existing.rows)[number]>();
  for (const row of existing.rows) {
    const key = normalizeTerm(row.front);
    if (!byKey.has(key)) byKey.set(key, row);
  }

  const matched = new Set<string>();
  const inserts = { front: [] as string[], back: [] as string[], example: [] as (string | null)[], sort: [] as number[] };
  const updates = { id: [] as string[], front: [] as string[], back: [] as string[], example: [] as (string | null)[], sort: [] as number[] };

  unit.cards.forEach((card, index) => {
    const sortOrder = index + 1;
    const row = byKey.get(normalizeTerm(card.term));
    if (!row) {
      inserts.front.push(card.term);
      inserts.back.push(card.translation);
      inserts.example.push(card.example);
      inserts.sort.push(sortOrder);
      return;
    }
    matched.add(row.id);
    const same =
      row.front === card.term && row.back === card.translation &&
      (row.example || null) === card.example && row.sort_order === sortOrder;
    if (same) {
      stats.cardsUnchanged++;
      return;
    }
    updates.id.push(row.id);
    updates.front.push(card.term);
    updates.back.push(card.translation);
    updates.example.push(card.example);
    updates.sort.push(sortOrder);
  });

  if (inserts.front.length > 0) {
    await db.query(
      `INSERT INTO cards (set_id, front, back, example, sort_order)
       SELECT $1, v.front, v.back, v.example, v.sort_order
         FROM unnest($2::text[], $3::text[], $4::text[], $5::int[]) AS v(front, back, example, sort_order)`,
      [setId, inserts.front, inserts.back, inserts.example, inserts.sort],
    );
    stats.cardsNew += inserts.front.length;
  }
  if (updates.id.length > 0) {
    // id не меняется — прогресс учеников по карточке сохраняется.
    await db.query(
      `UPDATE cards c SET front = v.front, back = v.back, example = v.example, sort_order = v.sort_order
         FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::int[]) AS v(id, front, back, example, sort_order)
        WHERE c.id = v.id`,
      [updates.id, updates.front, updates.back, updates.example, updates.sort],
    );
    stats.cardsUpdated += updates.id.length;
  }

  const missing = existing.rows.filter((row) => !matched.has(row.id));
  for (const row of missing) stats.missing.push({ id: row.id, unitNumber: unit.number, front: row.front });
  if (missing.length > 0 && inserts.front.length > 0) stats.suspectRenames.push(unit.number);
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error('Нет интерактивного терминала — подтверждение невозможно, удаление отменено.');
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

async function prune(db: Client, stats: Stats, dryRun: boolean): Promise<void> {
  if (stats.missing.length === 0) return;
  const ids = stats.missing.map((m) => m.id);
  const progress = await db.query<{ users: string; rows: string }>(
    'SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS rows FROM card_progress WHERE card_id = ANY($1::uuid[])',
    [ids],
  );
  const users = Number(progress.rows[0].users);
  console.log(`\n⚠️  --prune: будет удалено карточек: ${ids.length}. Прогресс по ним есть у учеников: ${users}.`);
  console.log('   Вместе с карточками удалится их прогресс (card_progress) и история повторений (reviews).');
  if (dryRun) {
    console.log('   (dry-run: ничего не удаляется)');
    return;
  }
  if (!(await confirm('Удалить?'))) {
    console.log('Удаление отменено — карточки оставлены.');
    return;
  }
  await db.query('DELETE FROM cards WHERE id = ANY($1::uuid[])', [ids]);
  stats.pruned = true;
}

function printReport(book: ParsedBook, stats: Stats, args: Args): void {
  const edition = book.edition ? ` (${book.edition})` : '';
  const status = stats.isPublished ? 'опубликована' : 'черновик';
  const unitsTotal = stats.unitsNew + stats.unitsUpdated + stats.unitsUnchanged;
  const missingNote = stats.pruned ? 'удалены' : 'не удалены';

  console.log('');
  if (args.dryRun) console.log('DRY-RUN — всё откатено, база не изменена. Так будет после настоящего импорта:\n');
  console.log(`Книга: ${book.title}${edition} — ${stats.bookStatus}, статус: ${status}`);
  console.log(
    `Юниты: ${unitsTotal} (${stats.unitsNew} новых, ${stats.unitsUpdated} обновлено, ${stats.unitsUnchanged} без изменений)`,
  );
  console.log(
    `Карточки: +${stats.cardsNew} новых, ~${stats.cardsUpdated} обновлено, ${stats.cardsUnchanged} без изменений, ` +
      `${stats.missing.length} отсутствуют в Excel${stats.missing.length > 0 ? ` (${missingNote})` : ''}`,
  );

  if (stats.unitsNotInExcel.length > 0) {
    console.log(`\nЮниты есть в базе, но нет в Excel (не тронуты): ${stats.unitsNotInExcel.map((n) => `Unit ${n}`).join(', ')}`);
  }
  if (stats.missing.length > 0) {
    console.log(`\nКарточки, которых нет в Excel (${missingNote}):`);
    for (const m of stats.missing) console.log(`  Unit ${m.unitNumber}: ${m.front}`);
    if (!stats.pruned) console.log('  Чтобы удалить их, запустите с --prune.');
  }
  if (stats.suspectRenames.length > 0) {
    console.log(
      `\n⚠️  В юнитах ${stats.suspectRenames.map((n) => `Unit ${n}`).join(', ')} одновременно есть новые и пропавшие карточки.\n` +
        '   Если вы исправили опечатку в term — это считается новой карточкой, прогресс учеников по старой не перейдёт.',
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.file)) {
    console.error(`Файл не найден: ${args.file}`);
    process.exit(2);
  }

  // 1. Разбор и валидация — до любого обращения к базе.
  const parsed = await parseBookWorkbook(args.file);
  for (const w of parsed.warnings) console.warn(`⚠️  ${w}`);
  if (parsed.errors.length > 0 || !parsed.book) {
    console.error(`\n❌ Ошибок: ${parsed.errors.length}. Ничего не записано.\n`);
    for (const e of parsed.errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  const book = parsed.book;
  const cardsTotal = parsed.units.reduce((sum, u) => sum + u.cards.length, 0);
  console.log(`✅ Файл корректен: ${parsed.units.length} юнитов, ${cardsTotal} карточек`);

  // 2. Запись — одна транзакция. При dry-run она откатывается.
  const adminUserId = getAdminUserId();
  const db = await connect();
  const stats: Stats = {
    bookStatus: 'без изменений', isPublished: false,
    unitsNew: 0, unitsUpdated: 0, unitsUnchanged: 0, unitsNotInExcel: [],
    cardsNew: 0, cardsUpdated: 0, cardsUnchanged: 0, missing: [], suspectRenames: [], pruned: false,
  };

  try {
    await db.query('BEGIN');
    // Официальные наборы защищены триггером (миграция 018) — разрешаем запись только в этой транзакции.
    await db.query("SET LOCAL flashly.official_write = 'on'");
    // Не даём двум импортам идти одновременно.
    await db.query("SELECT pg_advisory_xact_lock(hashtext('flashly:import-book'))");

    const admin = await db.query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [adminUserId]);
    if (admin.rows.length === 0 || !admin.rows[0].is_admin) {
      throw new Error(`ADMIN_USER_ID ${adminUserId} не найден в users или у него is_admin = false`);
    }

    const bookId = await upsertBook(db, book, stats);

    const excelNumbers = new Set(parsed.units.map((u) => u.number));
    const dbUnits = await db.query<{ number: number }>('SELECT number FROM book_units WHERE book_id = $1 ORDER BY number', [bookId]);
    stats.unitsNotInExcel = dbUnits.rows.map((r) => r.number).filter((n) => !excelNumbers.has(n));

    const touchedSets: string[] = [];
    for (const [index, unit] of parsed.units.entries()) {
      const unitId = await upsertUnit(db, bookId, unit, index + 1, stats);
      const setId = await upsertOfficialSet(db, unitId, unit, book, adminUserId);
      await syncCards(db, setId, unit, stats);
      touchedSets.push(setId);
    }

    if (args.prune) await prune(db, stats, args.dryRun);

    await db.query(
      `UPDATE card_sets cs SET total_cards = (SELECT COUNT(*) FROM cards c WHERE c.set_id = cs.id)
        WHERE cs.id = ANY($1::uuid[])`,
      [touchedSets],
    );

    if (args.publish && !stats.isPublished) {
      await db.query('UPDATE books SET is_published = true, updated_at = NOW() WHERE id = $1', [bookId]);
      stats.isPublished = true;
      if (stats.bookStatus === 'без изменений') stats.bookStatus = 'обновлена';
    }

    await db.query(args.dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }

  printReport(book, stats, args);
}

main().catch((error: unknown) => {
  console.error(`\n❌ Импорт прерван, изменения откатены: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
