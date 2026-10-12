/**
 * Опубликовать книгу каталога, снять с публикации, открыть или закрыть её ученикам.
 *
 *   npx tsx scripts/publish-book.ts "<title>" ["<edition>"]                 опубликовать (видна учителям)
 *   npx tsx scripts/publish-book.ts "<title>" ["<edition>"] --unpublish     снять с публикации (черновик)
 *   npx tsx scripts/publish-book.ts "<title>" ["<edition>"] --students      открыть ученикам
 *   npx tsx scripts/publish-book.ts "<title>" ["<edition>"] --no-students   закрыть ученикам
 *   npx tsx scripts/publish-book.ts --list                                  все книги и их статус
 *
 * Без edition ищется книга с пустым изданием. --students / --no-students публикацию не меняют:
 * ученик видит книгу, только если она опубликована И открыта ученикам. Учителя и админы
 * видят все опубликованные книги, админ — и черновики (api/books.js).
 */

import { connect, describeError, type Db } from './lib/db';

const FLAGS = ['--unpublish', '--students', '--no-students', '--list'];
const USAGE = 'Использование: npx tsx scripts/publish-book.ts "<title>" ["<edition>"] [--unpublish | --students | --no-students]\n' +
  '               npx tsx scripts/publish-book.ts --list';

interface BookRow {
  title: string;
  edition: string;
  level: string | null;
  is_published: boolean;
  student_visible: boolean;
  units: string;
  cards: string;
}

const STATS_SQL = `
  (SELECT COUNT(*) FROM book_units u WHERE u.book_id = b.id) AS units,
  (SELECT COUNT(*) FROM cards c JOIN card_sets cs ON cs.id = c.set_id
     JOIN book_units u ON u.id = cs.unit_id WHERE u.book_id = b.id AND cs.is_official) AS cards`;

function describeBook(b: BookRow): string {
  const name = `${b.title}${b.edition ? ` (${b.edition})` : ''}${b.level ? `, ${b.level}` : ''}`;
  const status = !b.is_published
    ? 'черновик — видят только админы'
    : b.student_visible
      ? 'опубликована — видят учителя и ученики'
      : 'опубликована — видят учителя (ученикам закрыта)';
  return `${name}: ${status}. Юнитов: ${b.units}, карточек: ${b.cards}`;
}

async function listBooks(db: Db): Promise<void> {
  const result = await db.query<BookRow>(
    `SELECT b.title, b.edition, b.level, b.is_published, b.student_visible, ${STATS_SQL}
       FROM books b ORDER BY b.title, b.edition`,
  );
  for (const b of result.rows) console.log(`• ${describeBook(b)}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith('--'));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const list = flags.includes('--list');
  if (flags.some((f) => !FLAGS.includes(f)) || flags.length > 1 || (!list && (positional.length < 1 || positional.length > 2)) || (list && positional.length > 0)) {
    console.error(USAGE);
    process.exit(2);
  }

  const db = await connect();
  try {
    // Колонку создаёт и api/_db-init.js (миграция 024) — здесь на случай, если API ещё не вызывали
    await db.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS student_visible BOOLEAN NOT NULL DEFAULT false');

    if (list) {
      await listBooks(db);
      return;
    }

    const title = positional[0].trim();
    const edition = (positional[1] ?? '').trim();
    const flag = flags[0];
    const [column, value] =
      flag === '--students' ? ['student_visible', true]
        : flag === '--no-students' ? ['student_visible', false]
          : ['is_published', flag !== '--unpublish'];

    const result = await db.query<BookRow>(
      `UPDATE books b SET ${column} = $3, updated_at = NOW()
        WHERE title = $1 AND edition = $2
        RETURNING b.title, b.edition, b.level, b.is_published, b.student_visible, ${STATS_SQL}`,
      [title, edition, value],
    );

    if (result.rows.length === 0) {
      const similar = await db.query<{ title: string; edition: string }>(
        'SELECT title, edition FROM books WHERE title ILIKE $1 ORDER BY title, edition LIMIT 10',
        [`%${title}%`],
      );
      console.error(`❌ Книга «${title}»${edition ? ` (${edition})` : ''} не найдена.`);
      if (similar.rows.length > 0) {
        console.error('Похожие:');
        for (const b of similar.rows) console.error(`  "${b.title}" "${b.edition}"`);
      }
      process.exit(1);
    }

    const b = result.rows[0];
    console.log(`✅ ${describeBook(b)}`);
    if (flag === '--students' && !b.is_published) {
      console.log('⚠️  Книга — черновик: ученики увидят её только после публикации (без флага).');
    }
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(`❌ ${describeError(error)}`);
  process.exit(1);
});
