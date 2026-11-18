/**
 * Проверка живого экзамена на staging (plan/new/live_exam.md, LiveExam 3).
 *
 *   npm run exam:check            — то же, что `npx tsx scripts/check-exam.ts --staging`
 *
 * Работает только с --staging (база — только из .env.staging, хост обязан быть staging).
 * Часть 1 — отчёт подготовки карточек (раздел A): тип оборота наборов, пропуски в примерах
 * книги «Academic words», части речи. Только чтение. Цифры сверяются с разделом
 * «Реальные данные» плана.
 */
import { connect, describeDatabaseTarget, isStagingRun } from './lib/db';
// @ts-expect-error — серверный модуль на JS без типов
import { detectBackKind, findGap, guessPos } from '../api/_exam/prepare.js';

type CardRow = { set_id: string; front: string; back: string; example: string | null };
type SetRow = {
  id: string;
  language_from: string | null;
  language_to: string | null;
  back_kind: string | null;
  back_kind_source: string | null;
};

async function main() {
  const target = describeDatabaseTarget();
  if (!isStagingRun || !target.isStaging || target.isProd) {
    console.error(`Только staging: запустите с --staging (сейчас ${target.host}).`);
    process.exit(2);
  }
  console.log(`База: ${target.host} (staging)\n`);
  const db = await connect();
  try {
    // ── Тип оборота наборов ──
    const sets = (
      await db.query<SetRow>(
        `SELECT id, language_from, language_to, back_kind, back_kind_source FROM card_sets`
      )
    ).rows;
    const cards = (await db.query<CardRow>(`SELECT set_id, front, back, example FROM cards`)).rows;
    const bySet = new Map<string, CardRow[]>();
    for (const c of cards) {
      const list = bySet.get(c.set_id) || [];
      list.push(c);
      bySet.set(c.set_id, list);
    }
    const kinds = { translation: 0, definition: 0 };
    let mismatch = 0;
    for (const s of sets) {
      const list = bySet.get(s.id) || [];
      if (list.length === 0) continue;
      const kind = detectBackKind(s, list) as 'translation' | 'definition';
      kinds[kind]++;
      const sameLang =
        (s.language_from || '').toLowerCase() === (s.language_to || '').toLowerCase();
      if (sameLang && kind === 'translation') mismatch++;
    }
    console.log('Тип оборота наборов (непустые):');
    console.log(`  перевод: ${kinds.translation}, определение: ${kinds.definition}`);
    console.log(`  языки одинаковые, но это перевод (неверные языки): ${mismatch}\n`);

    // ── Книга «Academic words» ──
    const book = (
      await db.query<{ id: string }>(
        `SELECT id FROM books WHERE title ILIKE '%academic words%' LIMIT 1`
      )
    ).rows[0];
    if (!book) {
      console.log('Книга «Academic words» не найдена — пропускаю.');
      return;
    }
    const acad = (
      await db.query<CardRow>(
        `SELECT c.set_id, c.front, c.back, c.example
         FROM cards c JOIN card_sets cs ON cs.id = c.set_id
         JOIN book_units bu ON bu.id = cs.unit_id
         WHERE bu.book_id = $1`,
        [book.id]
      )
    ).rows;
    const gapKinds: Record<string, number> = {};
    const missing: string[] = [];
    const pos: Record<string, number> = {};
    for (const c of acad) {
      const g = findGap(c.front, c.example);
      const k = g ? g.gapKind : 'none';
      gapKinds[k] = (gapKinds[k] || 0) + 1;
      if (!g && c.example) missing.push(c.front);
      const p = guessPos(c.back, 'definition') || 'null';
      pos[p] = (pos[p] || 0) + 1;
    }
    console.log(`«Academic words»: ${acad.length} карточек`);
    console.log('  пропуск в примере:', JSON.stringify(gapKinds));
    console.log(`  не найдено (${missing.length}):`, missing.slice(0, 20).join(', '));
    console.log('  часть речи:', JSON.stringify(pos));
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
