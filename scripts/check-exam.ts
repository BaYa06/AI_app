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
// @ts-expect-error — серверный модуль на JS без типов
import { buildExam } from '../api/_exam/build.js';
// @ts-expect-error — серверный модуль на JS без типов
import { normalize } from '../api/_exam/check.js';

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

    // ── Часть 2: сборка на каждом наборе staging (≥ 8 слов) с проверкой инвариантов ──
    const full = (
      await db.query<CardRow & { id: string }>(`SELECT id, set_id, front, back, example FROM cards`)
    ).rows;
    const cardsBySet = new Map<string, (CardRow & { id: string })[]>();
    for (const c of full) {
      const list = cardsBySet.get(c.set_id) || [];
      list.push(c);
      cardsBySet.set(c.set_id, list);
    }
    let built = 0;
    let short = 0;
    const problems: string[] = [];
    const formatTotals: Record<string, number> = {};
    let totalMs = 0;
    for (const s of sets) {
      const list = cardsBySet.get(s.id) || [];
      if (list.length < 8) continue;
      const backKind = detectBackKind(s, list);
      const n = Math.min(20, list.length);
      const t0 = Date.now();
      const exam = buildExam({
        cards: list.map((c) => ({ ...c, setId: c.set_id })),
        backKind,
        config: { count: n },
        seed: s.id,
      });
      totalMs += Date.now() - t0;
      built++;
      const ids = exam.items.map((i: any) => i.cardId);
      if (exam.items.length < n) short++;
      if (new Set(ids).size !== ids.length) problems.push(`${s.id}: повтор слова`);
      for (const it of exam.items as any[]) {
        formatTotals[it.format] = (formatTotals[it.format] || 0) + 1;
        if (it.format === 'choice' || it.format === 'gap') {
          const opts = (it.options || []).map(normalize);
          if (
            opts.length !== 4 ||
            new Set(opts).size !== 4 ||
            !opts.includes(normalize(it.answer))
          ) {
            problems.push(`${s.id}: варианты «${it.prompt}» → ${JSON.stringify(it.options)}`);
          }
        }
        if (it.format === 'gap' && !String(it.prompt).includes('_____')) {
          problems.push(`${s.id}: нет пропуска «${it.prompt}»`);
        }
      }
    }
    console.log(
      `\nСборка на наборах staging: ${built} наборов, в среднем ${(totalMs / Math.max(built, 1)).toFixed(1)} мс`
    );
    console.log(`  вопросов по форматам: ${JSON.stringify(formatTotals)}`);
    console.log(`  экзамен короче нужного: ${short}`);
    console.log(`  нарушений: ${problems.length}`);
    for (const p of problems.slice(0, 15)) console.log(`    ✗ ${p}`);
    if (problems.length) process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
