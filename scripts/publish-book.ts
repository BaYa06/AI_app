/**
 * Опубликовать книгу каталога или снять с публикации.
 *
 *   npx tsx scripts/publish-book.ts "<title>" ["<edition>"] [--unpublish]
 *
 * Без edition ищется книга с пустым изданием.
 */

import { connect } from './lib/db';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const unpublish = argv.includes('--unpublish');
  const positional = argv.filter((a) => !a.startsWith('--'));
  const unknownFlags = argv.filter((a) => a.startsWith('--') && a !== '--unpublish');
  if (positional.length < 1 || positional.length > 2 || unknownFlags.length > 0) {
    console.error('Использование: npx tsx scripts/publish-book.ts "<title>" ["<edition>"] [--unpublish]');
    process.exit(2);
  }
  const title = positional[0].trim();
  const edition = (positional[1] ?? '').trim();

  const db = await connect();
  try {
    const result = await db.query<{ title: string; edition: string; units: string; cards: string }>(
      `UPDATE books b SET is_published = $3, updated_at = NOW()
        WHERE title = $1 AND edition = $2
        RETURNING b.title, b.edition,
          (SELECT COUNT(*) FROM book_units u WHERE u.book_id = b.id) AS units,
          (SELECT COUNT(*) FROM cards c JOIN card_sets cs ON cs.id = c.set_id
             JOIN book_units u ON u.id = cs.unit_id WHERE u.book_id = b.id AND cs.is_official) AS cards`,
      [title, edition, !unpublish],
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
    const status = unpublish ? 'снята с публикации (черновик)' : 'опубликована — видна всем';
    console.log(`✅ ${b.title}${b.edition ? ` (${b.edition})` : ''}: ${status}. Юнитов: ${b.units}, карточек: ${b.cards}`);
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
