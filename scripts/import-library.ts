/**
 * Импорт каталога библиотеки из Excel (Neon): предметы → разделы → подборки → наборы → карточки.
 *
 *   npx tsx scripts/import-library.ts path/to/catalog.xlsx [--dry-run] [--publish]
 *
 * --dry-run  всё выполняется в транзакции и откатывается: отчёт точный, в базе ничего не меняется
 * --publish  черновики из файла сделать видимыми (draft → published) — и подборки, и наборы.
 *            Снятые вручную (archived) не трогаем. Подборка меньше 3 наборов остаётся черновиком.
 *
 * --prod     разрешить рабочую базу. Без него скрипт отказывается работать с продом (scripts/lib/db.ts,
 *            PROD_ENDPOINTS) — даже с --dry-run. Прод — только с разрешения.
 *
 * База берётся из .env.local; переменная окружения важнее файла, поэтому staging так:
 *   DATABASE_URL_UNPOOLED='<строка staging>' npx tsx scripts/import-library.ts файл.xlsx --dry-run
 *
 * Наборы пишутся в library_sets / library_cards от служебного автора LIBRARY_AUTHOR_ID
 * (scripts/create-library-author.ts), original_set_id = NULL. Повторный запуск:
 *  - предмет ищется по slug, раздел — по (предмет, key): лист «Предметы» / «Разделы» перезаписывает их;
 *  - подборка — по (предмет, track, level, название);
 *  - набор — по title + языкам; карточки заменяются целиком. Копии у учеников не трогаем
 *    (plan/new/library_catalog.md, решение 3).
 * Подборки из файла собираются заново: наборы, которых в файле у этой подборки больше нет,
 * отвязываются от неё (collection_id = NULL) и в каталоге не видны.
 *
 * Формат файла и план: plan/new/library_catalog.md («Формат Excel»).
 */

import fs from 'fs';
import path from 'path';
import {
  connect,
  describeDatabaseTarget,
  describeError,
  getLibraryAuthorId,
  type Db,
} from './lib/db';
import { normalizeTerm } from './lib/excel';
import {
  categoryForSubject,
  MIN_SETS_TO_PUBLISH,
  parseLibraryWorkbook,
  validateCatalog,
  type LevelScale,
  type LibrarySetKind,
  type ParsedCollection,
  type ParsedLibrarySet,
  type SubjectDef,
  type TrackDef,
} from './lib/libraryExcel';

interface Args {
  file: string;
  dryRun: boolean;
  publish: boolean;
  prod: boolean;
}

type Status = 'draft' | 'published' | 'archived';
type Change = 'новый' | 'обновлён' | 'без изменений';

interface SetReport {
  title: string;
  change: Change;
  status: Status;
  cards: number;
}

interface CollectionReport {
  path: string;
  change: Change;
  status: Status;
  sets: number;
}

interface LibrarySetRow {
  id: string;
  title: string;
  kind: string | null;
  description: string | null;
  category: string | null;
  status: Status;
  collection_id: string | null;
  position: number | null;
}

const STATUS_LABEL: Record<Status, string> = {
  draft: 'черновик',
  published: 'в библиотеке',
  archived: 'снят с публикации',
};

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const known = new Set(['--dry-run', '--publish', '--prod']);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (unknown.length > 0 || positional.length !== 1) {
    if (unknown.length > 0) console.error(`Неизвестные флаги: ${unknown.join(', ')}`);
    console.error(
      'Использование: npx tsx scripts/import-library.ts path/to/catalog.xlsx [--dry-run] [--publish] [--prod]'
    );
    process.exit(2);
  }
  return {
    file: path.resolve(positional[0]),
    dryRun: flags.has('--dry-run'),
    publish: flags.has('--publish'),
    prod: flags.has('--prod'),
  };
}

// ── Предметы и разделы ───────────────────────────────────────────────────────

async function loadSubjects(db: Db): Promise<(SubjectDef & { id: string })[]> {
  const rows = await db.query<{
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    icon: string | null;
    track_label: string | null;
    level_scale: LevelScale | null;
    set_kind: LibrarySetKind;
    position: number;
  }>(
    'SELECT id, slug, title, subtitle, icon, track_label, level_scale, set_kind, position FROM library_subjects'
  );
  return rows.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    icon: r.icon,
    trackLabel: r.track_label,
    levelScale: r.level_scale,
    setKind: r.set_kind,
    position: r.position,
  }));
}

async function loadTracks(db: Db): Promise<TrackDef[]> {
  const rows = await db.query<{ subject: string; key: string; title: string; position: number }>(
    `SELECT s.slug AS subject, t.key, t.title, t.position
       FROM library_tracks t JOIN library_subjects s ON s.id = t.subject_id`
  );
  return rows.rows;
}

/** Файл поверх базы: предмет по slug, раздел по (предмет, key). */
function mergeBy<T>(base: T[], over: T[], key: (x: T) => string): T[] {
  const map = new Map(base.map((x) => [key(x), x]));
  for (const x of over) map.set(key(x), x);
  return [...map.values()];
}

async function upsertSubjects(db: Db, subjects: SubjectDef[]): Promise<void> {
  for (const s of subjects) {
    await db.query(
      `INSERT INTO library_subjects (slug, title, subtitle, icon, track_label, level_scale, set_kind, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (slug) DO UPDATE SET title = $2, subtitle = $3, icon = $4, track_label = $5,
         level_scale = $6, set_kind = $7, position = $8, updated_at = NOW()`,
      [s.slug, s.title, s.subtitle, s.icon, s.trackLabel, s.levelScale, s.setKind, s.position]
    );
  }
}

async function upsertTracks(
  db: Db,
  tracks: TrackDef[],
  subjectIds: Map<string, string>
): Promise<void> {
  for (const t of tracks) {
    await db.query(
      `INSERT INTO library_tracks (subject_id, key, title, position) VALUES ($1, $2, $3, $4)
       ON CONFLICT (subject_id, key) DO UPDATE SET title = $3, position = $4`,
      [subjectIds.get(t.subject), t.key, t.title, t.position]
    );
  }
}

// ── Подборки ─────────────────────────────────────────────────────────────────

/**
 * Подборка с тем же предметом, разделом, уровнем и названием (по normalizeTerm — сравниваем в JS:
 * lower() для кириллицы в SQL зависит от локали базы). Создаёт новую, если нет.
 */
async function upsertCollection(
  db: Db,
  col: ParsedCollection,
  subjectId: string,
  publish: boolean
): Promise<{ id: string; report: CollectionReport }> {
  const canPublish = col.sets.length >= MIN_SETS_TO_PUBLISH;
  const pathLabel = [col.subject, col.track, col.level, col.title].filter(Boolean).join(' · ');
  const report = (change: Change, status: Status): CollectionReport => ({
    path: pathLabel,
    change,
    status,
    sets: col.sets.length,
  });

  const rows = await db.query<{ id: string; title: string; position: number; status: Status }>(
    `SELECT id, title, position, status FROM library_collections
      WHERE subject_id = $1 AND track IS NOT DISTINCT FROM $2 AND level IS NOT DISTINCT FROM $3
      ORDER BY created_at, id FOR UPDATE`,
    [subjectId, col.track, col.level]
  );
  const key = normalizeTerm(col.title);
  const existing = rows.rows.find((r) => normalizeTerm(r.title) === key);

  if (!existing) {
    const status: Status = publish && canPublish ? 'published' : 'draft';
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO library_collections (subject_id, track, level, title, position, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [subjectId, col.track, col.level, col.title, col.position, status]
    );
    return { id: inserted.rows[0].id, report: report('новый', status) };
  }

  const goLive = publish && canPublish && existing.status === 'draft';
  const status: Status = goLive ? 'published' : existing.status;
  const changed = existing.title !== col.title || existing.position !== col.position || goLive;
  if (changed) {
    await db.query(
      `UPDATE library_collections SET title = $2, position = $3, status = $4, updated_at = NOW() WHERE id = $1`,
      [existing.id, col.title, col.position, status]
    );
  }
  return { id: existing.id, report: report(changed ? 'обновлён' : 'без изменений', status) };
}

// ── Наборы ───────────────────────────────────────────────────────────────────

/** Набор автора с тем же title (по normalizeTerm) и языками; если таких несколько — самый ранний. */
async function findSet(
  db: Db,
  authorId: string,
  set: ParsedLibrarySet
): Promise<LibrarySetRow | null> {
  const rows = await db.query<LibrarySetRow>(
    `SELECT id, title, kind, description, category, status, collection_id, position FROM library_sets
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
  existing: LibrarySetRow | null,
  collectionId: string,
  subject: SubjectDef,
  publish: boolean
): Promise<SetReport> {
  const report = (change: Change, status: Status): SetReport => ({
    title: set.title,
    change,
    status,
    cards: set.cards.length,
  });
  const kind = subject.setKind;
  const category = categoryForSubject(subject.slug, kind);

  if (!existing) {
    const status: Status = publish ? 'published' : 'draft';
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO library_sets (user_id, original_set_id, title, description, category,
                                 language_from, language_to, cards_count, status, kind, collection_id, position)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        authorId,
        set.title,
        set.description,
        category,
        set.languageFrom,
        set.languageTo,
        set.cards.length,
        status,
        kind,
        collectionId,
        set.position,
      ]
    );
    await replaceCards(db, inserted.rows[0].id, set);
    return report('новый', status);
  }

  const metaChanged =
    existing.title !== set.title ||
    existing.kind !== kind ||
    existing.description !== set.description ||
    existing.category !== category ||
    existing.collection_id !== collectionId ||
    existing.position !== set.position;
  const cardsDiffer = await cardsChanged(db, existing.id, set);
  const goLive = publish && existing.status === 'draft';
  const status: Status = goLive ? 'published' : existing.status;

  // Подборку и номер ставим всегда: перед этим они сняты у всех наборов подборки (см. main).
  if (cardsDiffer) await replaceCards(db, existing.id, set);
  // published_at = момент выхода в библиотеку. tags / cover_emoji старого формата не трогаем.
  await db.query(
    `UPDATE library_sets SET title = $2, description = $3, category = $4, cards_count = $5, status = $6,
            published_at = CASE WHEN $7 THEN NOW() ELSE published_at END, kind = $8,
            collection_id = $9, position = $10,
            updated_at = CASE WHEN $11 THEN NOW() ELSE updated_at END
      WHERE id = $1`,
    [
      existing.id,
      set.title,
      set.description,
      category,
      set.cards.length,
      status,
      goLive,
      kind,
      collectionId,
      set.position,
      metaChanged || cardsDiffer || goLive,
    ]
  );
  return report(metaChanged || cardsDiffer || goLive ? 'обновлён' : 'без изменений', status);
}

// ── Отчёт ────────────────────────────────────────────────────────────────────

const mark = (c: Change) => (c === 'новый' ? '+' : c === 'обновлён' ? '~' : '=');

function printReport(
  collections: CollectionReport[],
  sets: SetReport[],
  detached: string[],
  notInFile: { title: string; status: Status }[],
  args: Args
): void {
  const count = <T extends { change: Change }>(list: T[], c: Change) =>
    list.filter((r) => r.change === c).length;
  const cards = sets.reduce((sum, r) => sum + r.cards, 0);

  console.log('');
  if (args.dryRun)
    console.log('DRY-RUN — всё откатено, база не изменена. Так будет после настоящего импорта:\n');
  console.log(
    `Подборки: ${collections.length} (${count(collections, 'новый')} новых, ${count(collections, 'обновлён')} обновлено, ` +
      `${count(collections, 'без изменений')} без изменений)`
  );
  for (const c of collections) {
    console.log(`  ${mark(c.change)} ${c.path} — ${c.sets} наб., ${STATUS_LABEL[c.status]}`);
  }
  console.log(
    `\nНаборы: ${sets.length} (${count(sets, 'новый')} новых, ${count(sets, 'обновлён')} обновлено, ` +
      `${count(sets, 'без изменений')} без изменений), карточек ${cards}`
  );
  for (const r of sets) {
    console.log(`  ${mark(r.change)} ${r.title} — ${r.cards} карт., ${STATUS_LABEL[r.status]}`);
  }

  const drafts =
    sets.filter((r) => r.status === 'draft').length +
    collections.filter((c) => c.status === 'draft').length;
  if (drafts > 0 && !args.publish)
    console.log('\nЕсть черновики. Чтобы показать их в библиотеке, запустите с --publish.');
  if ([...sets, ...collections].some((r) => r.status === 'archived')) {
    console.log('\n«Снят с публикации» сняли вручную — --publish это не возвращает.');
  }
  if (detached.length > 0) {
    console.log(
      `\nУбраны из подборок (в файле их там больше нет, в каталоге не видны): ${detached.length}`
    );
    for (const t of detached) console.log(`  − ${t}`);
  }
  if (notInFile.length > 0) {
    console.log(`\nНаборы автора, которых нет в этом файле (не тронуты): ${notInFile.length}`);
    for (const s of notInFile) console.log(`  ${s.title} — ${STATUS_LABEL[s.status]}`);
  }
}

function fail(errors: string[]): never {
  console.error(`\n❌ Ошибок: ${errors.length}. Ничего не записано.\n`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.file)) {
    console.error(`Файл не найден: ${args.file}`);
    process.exit(2);
  }

  // 1. Разбор файла — до любого обращения к базе.
  const parsed = await parseLibraryWorkbook(args.file);
  for (const w of parsed.warnings) console.warn(`⚠️  ${w}`);
  if (parsed.errors.length > 0) fail(parsed.errors);

  // 2. Куда пишем. Прод — только с --prod.
  const target = describeDatabaseTarget();
  console.log(`База: ${target.host}${target.isProd ? ' — РАБОЧАЯ (прод)' : ''}`);
  if (target.isProd && !args.prod) {
    console.error(
      '\n❌ Это рабочая база. Импорт в прод — только с разрешения и флагом --prod.\n' +
        "   Для staging: DATABASE_URL_UNPOOLED='<строка staging>' npx tsx scripts/import-library.ts файл.xlsx --dry-run"
    );
    process.exit(2);
  }

  // 3. Всё остальное — одна транзакция. При dry-run и ошибках проверки она откатывается.
  const authorId = getLibraryAuthorId();
  const db = await connect();
  const collectionReports: CollectionReport[] = [];
  const setReports: SetReport[] = [];
  let detached: string[] = [];
  let notInFile: { title: string; status: Status }[] = [];
  let catalogErrors: string[] = [];

  try {
    await db.query('BEGIN');
    // Не даём двум импортам идти одновременно.
    await db.query("SELECT pg_advisory_xact_lock(hashtext('flashly:import-library'))");

    // Библиотека показывает только наборы админов (api/library.js).
    const author = await db.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [authorId]
    );
    if (author.rows.length === 0 || !author.rows[0].is_admin) {
      throw new Error(
        `LIBRARY_AUTHOR_ID ${authorId} не найден в users или у него is_admin = false`
      );
    }

    // 2a. Проверка по предметам: база + лист «Предметы» / «Разделы» поверх.
    const subjects = mergeBy<SubjectDef>(await loadSubjects(db), parsed.subjects, (s) => s.slug);
    const tracks = mergeBy(await loadTracks(db), parsed.tracks, (t) => `${t.subject}|${t.key}`);
    const checked = validateCatalog(parsed.sets, subjects, tracks);
    for (const w of checked.warnings) console.warn(`⚠️  ${w}`);
    if (checked.errors.length > 0) {
      catalogErrors = checked.errors;
      await db.query('ROLLBACK');
    } else {
      // 2b. Предметы и разделы из файла.
      await upsertSubjects(db, parsed.subjects);
      const subjectRows = await loadSubjects(db);
      const subjectIds = new Map(subjectRows.map((s) => [s.slug, s.id]));
      const subjectBySlug = new Map(subjectRows.map((s) => [s.slug, s]));
      await upsertTracks(db, parsed.tracks, subjectIds);

      // 2c. Подборки.
      const collectionIds = new Map<string, string>();
      for (const col of checked.collections) {
        const { id, report } = await upsertCollection(
          db,
          col,
          subjectIds.get(col.subject)!,
          args.publish
        );
        collectionIds.set(col.key, id);
        collectionReports.push(report);
      }

      // 2d. Наборы. Сначала находим существующие (с их прежней подборкой и номером), потом снимаем номера
      // у всех наборов затронутых подборок — иначе перестановка упрётся в UNIQUE (collection_id, position).
      const found = new Map<ParsedLibrarySet, LibrarySetRow | null>();
      for (const col of checked.collections)
        for (const set of col.sets) found.set(set, await findSet(db, authorId, set));

      const touched = [...collectionIds.values()];
      const keepIds = [...found.values()].filter(Boolean).map((r) => r!.id);
      const gone = await db.query<{ title: string }>(
        `SELECT title FROM library_sets
          WHERE user_id = $1 AND collection_id = ANY($2::uuid[]) AND NOT (id = ANY($3::uuid[]))
          ORDER BY title`,
        [authorId, touched, keepIds]
      );
      detached = gone.rows.map((r) => r.title);
      await db.query(
        `UPDATE library_sets SET collection_id = NULL, position = NULL
          WHERE user_id = $1 AND collection_id = ANY($2::uuid[])`,
        [authorId, touched]
      );

      for (const col of checked.collections) {
        const subject = subjectBySlug.get(col.subject)!;
        for (const set of col.sets) {
          setReports.push(
            await upsertSet(
              db,
              authorId,
              set,
              found.get(set) ?? null,
              collectionIds.get(col.key)!,
              subject,
              args.publish
            )
          );
        }
      }

      const inFile = new Set(
        parsed.sets.map((s) => `${normalizeTerm(s.title)}|${s.languageFrom}|${s.languageTo}`)
      );
      const all = await db.query<{
        title: string;
        language_from: string;
        language_to: string;
        status: Status;
      }>(
        'SELECT title, language_from, language_to, status FROM library_sets WHERE user_id = $1 ORDER BY title',
        [authorId]
      );
      notInFile = all.rows
        .filter((r) => !inFile.has(`${normalizeTerm(r.title)}|${r.language_from}|${r.language_to}`))
        .map((r) => ({ title: r.title, status: r.status }));

      await db.query(args.dryRun ? 'ROLLBACK' : 'COMMIT');
    }
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }

  if (catalogErrors.length > 0) fail(catalogErrors);
  printReport(collectionReports, setReports, detached, notInFile, args);
}

main().catch((error: unknown) => {
  console.error(`\n❌ Импорт прерван, изменения откатены: ${describeError(error)}`);
  process.exit(1);
});
