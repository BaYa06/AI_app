/**
 * Полный цикл живого экзамена на staging (plan/new/live_exam.md, этапы 2 и 6).
 *
 *   npx tsx scripts/check-exam-flow.ts --staging     (входит в npm run exam:check)
 *
 * Только staging. Создаёт учителя, курс, набор из 24 слов и 4 учеников с пометкой EXAM-CHECK,
 * вызывает НАСТОЯЩИЙ api/test.js и в конце всё удаляет. Вход Supabase подменяет локальный
 * сервер: токен = id тестового пользователя. Realtime выключен (TEST_BROADCAST_OFF).
 *
 * Проверяет: сборку и черновик, замену слова, открытие (код), старый клиент → 426, вход и
 * свой порядок у каждого, отсутствие ответов в выдаче, ответы и их замену, срок, сдачу,
 * итоги, разбор вопроса, аннулирование и отмену, засчитывание, ручной балл, открытие
 * результатов, «Мои экзамены» и разбор у ученика, совместимость монитора и старых итогов.
 */
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { connect, describeDatabaseTarget, getDatabaseUrl, isStagingRun } from './lib/db';

const TAG = 'EXAM-CHECK';
const RUN = randomBytes(2).toString('hex').toUpperCase(); // users.user_name уникален
type Res = { status: number; body: any };
type Handler = (req: any, res: any) => Promise<unknown>;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, details?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(
      `  ✗ ${name}${details !== undefined ? ' — ' + JSON.stringify(details).slice(0, 400) : ''}`
    );
  }
}

async function startFakeSupabase(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const auth = String(req.headers.authorization || '');
    const id = (auth.startsWith('Bearer ') ? auth.slice(7) : '').split('.').pop() || '';
    if (req.url?.startsWith('/auth/v1/user') && /^[0-9a-f-]{36}$/.test(id)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, aud: 'authenticated', role: 'authenticated', email: null }));
      return;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'invalid token' }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

function tokenFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString('base64url');
  return `h.${payload}.${userId}`;
}

let test: Handler;
async function call(
  user: string,
  method: 'GET' | 'POST',
  action: string,
  data: Record<string, unknown> = {}
): Promise<Res> {
  const req = {
    method,
    query: method === 'GET' ? { action, ...data } : { action },
    body: method === 'POST' ? data : {},
    headers: { authorization: `Bearer ${tokenFor(user)}` },
  };
  return new Promise((resolve) => {
    let status = 200;
    const res: any = {
      setHeader: () => res,
      status(code: number) {
        status = code;
        return res;
      },
      json(b: unknown) {
        resolve({ status, body: b });
        return res;
      },
      end() {
        resolve({ status, body: null });
        return res;
      },
    };
    test(req, res).catch((e) => resolve({ status: 599, body: String(e?.message || e) }));
  });
}

const WORDS: [string, string][] = [
  ['airport', 'аэропорт'],
  ['passport', 'паспорт'],
  ['luggage', 'багаж'],
  ['customs', 'таможня'],
  ['border', 'граница'],
  ['ticket', 'билет'],
  ['flight', 'рейс'],
  ['delay', 'задержка'],
  ['gate', 'выход на посадку'],
  ['departure', 'отправление'],
  ['arrival', 'прибытие'],
  ['pilot', 'пилот'],
  ['window', 'окно'],
  ['aisle', 'проход'],
  ['suitcase', 'чемодан'],
  ['boarding pass', 'посадочный талон'],
  ['seat belt', 'ремень безопасности'],
  ['crew', 'экипаж'],
  ['runway', 'взлётная полоса'],
  ['terminal', 'терминал'],
  ['visa', 'виза'],
  ['tourist', 'турист'],
  ['journey', 'путешествие'],
  ['trolley', 'тележка'],
];

async function main() {
  const target = describeDatabaseTarget();
  if (!isStagingRun || !target.isStaging || target.isProd) {
    console.error(`Только staging: запустите с --staging (сейчас ${target.host}).`);
    process.exit(2);
  }
  console.log(`\nПолный цикл экзамена — база ${target.host} (staging)\n`);
  const fake = await startFakeSupabase();
  process.env.POSTGRES_URL = getDatabaseUrl();
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_ANON_KEY = 'exam-check';
  process.env.TEST_BROADCAST_OFF = '1';
  test = (await import('../api/test.js')).default as Handler;

  const db = await connect();
  const teacher = randomUUID();
  const students = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const users = [teacher, ...students];
  let courseId = '';
  try {
    for (const [i, id] of users.entries()) {
      await db.query(`INSERT INTO users (id, display_name, user_name) VALUES ($1, $2, $2)`, [
        id,
        `${TAG} ${RUN} ${i === 0 ? 'Учитель' : `Ученик ${i}`}`,
      ]);
    }
    courseId = (
      await db.query<{ id: string }>(
        `INSERT INTO courses (user_id, title) VALUES ($1, $2) RETURNING id`,
        [teacher, `${TAG} курс`]
      )
    ).rows[0].id;
    for (const s of students) {
      await db.query(
        `INSERT INTO course_members (course_id, user_id, role) VALUES ($1, $2, 'student')`,
        [courseId, s]
      );
    }
    const setId = (
      await db.query<{ id: string }>(
        `INSERT INTO card_sets (user_id, title, course_id, language_from, language_to)
         VALUES ($1, $2, $3, 'en', 'ru') RETURNING id`,
        [teacher, `${TAG} Unit 5`, courseId]
      )
    ).rows[0].id;
    for (const [i, [front, back]] of WORDS.entries()) {
      await db.query(
        `INSERT INTO cards (set_id, front, back, sort_order) VALUES ($1, $2, $3, $4)`,
        [setId, front, back, i]
      );
    }

    console.log('Учитель: сборка');
    const built = await call(teacher, 'POST', 'exam-build', {
      courseId,
      setIds: [setId],
      count: 20,
      mode: 'difficulty',
      exitControl: false,
    });
    check(
      'exam-build → 201, 20 вопросов',
      built.status === 201 && built.body.items?.length === 20,
      built
    );
    const sessionId = built.body.sessionId;
    check(
      'рекомендованное время 7 минут',
      built.body.recommended?.minutes === 7,
      built.body.recommended
    );
    check('пять шагов сборки', built.body.steps?.length === 5);
    const stranger = await call(students[0], 'GET', 'exam-draft', { sessionId });
    check('чужой не видит черновик', stranger.status === 403, stranger.status);

    const toReplace = built.body.items.find((i: any) => i.format === 'choice');
    const rep = await call(teacher, 'POST', 'exam-replace-item', {
      sessionId,
      itemId: toReplace.itemId,
    });
    const repItem = rep.body.items?.find((i: any) => i.itemId === toReplace.itemId);
    check(
      'замена слова: другое слово, тот же формат',
      rep.status === 200 &&
        repItem &&
        repItem.cardId !== toReplace.cardId &&
        repItem.format === 'choice',
      rep.body
    );

    const created = await call(teacher, 'POST', 'exam-create', { sessionId, durationSec: 420 });
    check(
      'exam-create → код',
      created.status === 201 && /^\d{4}$/.test(created.body.code),
      created.body
    );
    const code = created.body.code;

    console.log('Ученики: вход');
    const old = await call(students[0], 'POST', 'join', { code });
    check(
      'старый клиент без features → 426 update',
      old.status === 426 && old.body.update === true,
      old
    );
    const joins: Res[] = [];
    for (const s of students)
      joins.push(await call(s, 'POST', 'join', { code, features: ['exam2'] }));
    check(
      'вход с features',
      joins.every((j) => j.status === 200 && j.body.engine === 2),
      joins.map((j) => j.status)
    );
    const pids = joins.map((j) => j.body.participantId);

    const start = await call(teacher, 'POST', 'start', { sessionId });
    check('start (как у обычного теста)', start.status === 200, start.body);

    const states: Res[] = [];
    for (const [i, s] of students.entries()) {
      states.push(await call(s, 'POST', 'exam-state', { participantId: pids[i] }));
    }
    const st0 = states[0].body;
    check('exam-state: 20 номеров, срок', st0.total === 20 && Boolean(st0.deadline), st0.total);
    const order = (st: any) => st.screens.map((x: any) => x.blockNo).join(',');
    check('у учеников разный порядок', new Set(states.map((s) => order(s.body))).size > 1);
    check('в выдаче нет правильных ответов', !JSON.stringify(states[0].body).includes('"answer"'));
    const foreign = await call(students[1], 'POST', 'exam-state', { participantId: pids[0] });
    check('чужой participantId → 403', foreign.status === 403, foreign.status);

    // Правильные ответы — из черновика учителя (как будто ученик знает всё)
    const draft = (await call(teacher, 'GET', 'exam-draft', { sessionId })).body;
    const answerOf = new Map(draft.items.map((i: any) => [i.itemId, i.answer]));
    const flat = (st: any) =>
      st.screens.flatMap((sc: any) =>
        sc.format === 'match'
          ? sc.questions[0].left.map((l: any) => l.itemId)
          : sc.questions.map((q: any) => q.itemId)
      );
    // Ученик k ошибается на первых 4k вопросах черновика (одинаковых для всех), остальные — верно.
    // Так на вопросе №1 ошибаются трое из четырёх → предупреждение в итогах.
    const draftIds = draft.items.map((i: any) => i.itemId);
    for (const [k, s] of students.entries()) {
      const wrong = new Set(draftIds.slice(0, 4 * k));
      for (const [i, itemId] of flat(states[k].body).entries()) {
        const response = wrong.has(itemId) ? 'неверно' : answerOf.get(itemId);
        const r = await call(s, 'POST', 'exam-answer', {
          participantId: pids[k],
          itemId,
          response,
        });
        if (r.status !== 200) {
          check(`ответ ученика ${k + 1}`, false, r);
          break;
        }
        if (k === 0 && i === 0) {
          check(
            'exam-answer не раскрывает верно/неверно',
            !('isCorrect' in r.body) && !('correctAnswer' in r.body)
          );
        }
      }
    }
    // Изменить ответ до сдачи: четвёртый исправляет вопрос №12
    const firstOf3 = draftIds[11];
    const change = await call(students[3], 'POST', 'exam-answer', {
      participantId: pids[3],
      itemId: firstOf3,
      response: answerOf.get(firstOf3),
    });
    check(
      'ответ можно поменять до сдачи',
      change.status === 200 && change.body.answered === 20,
      change.body
    );

    const mon = await call(teacher, 'GET', 'monitor', { sessionId });
    check(
      'monitor: движок 2, срок, прогресс 20/20',
      mon.body.engine === 2 && mon.body.participants?.[0]?.total === 20,
      mon.body
    );

    const sub = await call(students[0], 'POST', 'exam-submit', { participantId: pids[0] });
    check(
      'сдача: результаты откроет учитель',
      sub.status === 200 && sub.body.released === false,
      sub.body
    );
    const after = await call(students[0], 'POST', 'exam-answer', {
      participantId: pids[0],
      itemId: flat(states[0].body)[0],
      response: 'x',
    });
    check('после сдачи ответ не принимается', after.status === 409, after.status);

    // Срок: сдвигаем начало в прошлое — ответ после срока → 409, попытка завершается сама
    await db.query(
      `UPDATE test_sessions SET started_at = NOW() - interval '30 minutes' WHERE id = $1`,
      [sessionId]
    );
    const late = await call(students[1], 'POST', 'exam-answer', {
      participantId: pids[1],
      itemId: flat(states[1].body)[0],
      response: 'x',
    });
    check(
      'ответ после срока → 409 deadline',
      late.status === 409 && late.body.deadline === true,
      late.body
    );

    const fin = await call(teacher, 'POST', 'finish', { sessionId });
    check('finish', fin.status === 200, fin.body);

    console.log('Учитель: итоги и оценки');
    const results = await call(teacher, 'GET', 'exam-results', { sessionId });
    const scores = results.body.students?.map((s: any) => s.score);
    // 20, 16, 12 верных; четвёртый — 8 и один исправленный ответ = 9
    check(
      'баллы 100 / 80 / 60 / 45',
      JSON.stringify(scores) === JSON.stringify([100, 80, 60, 45]),
      scores
    );
    const oldResults = await call(teacher, 'GET', 'results', { sessionId });
    check(
      'старые итоги (старое приложение учителя) — те же баллы',
      JSON.stringify(oldResults.body.participants?.map((p: any) => p.score)) ===
        JSON.stringify([100, 80, 60, 45]),
      oldResults.body.participants
    );
    const hist = await call(teacher, 'GET', 'history', { courseId });
    check(
      'экзамен в истории',
      hist.body?.some?.((h: any) => h.sessionId === sessionId)
    );

    // Вопрос, на котором ошиблись 3 из 4
    const word = results.body.words.find((w: any) => w.itemId === draftIds[0] && w.suspicious);
    check('есть подозрительный вопрос (3 из 4 ошиблись)', Boolean(word), results.body.words);
    if (word) {
      const q = await call(teacher, 'GET', 'exam-question', { sessionId, itemId: word.itemId });
      check(
        'разбор: группы ответов и расчёт «аннулировать»',
        q.status === 200 && q.body.groups?.length > 0 && Array.isArray(q.body.actions?.void?.rows),
        q.body
      );
      const voided = await call(teacher, 'POST', 'exam-decide', {
        sessionId,
        itemId: word.itemId,
        decision: 'void',
      });
      const r2 = await call(teacher, 'GET', 'exam-results', { sessionId });
      const s2 = r2.body.students.map((s: any) => s.score);
      check(
        'аннулирование пересчитало баллы',
        voided.status === 200 && JSON.stringify(s2) !== JSON.stringify(scores),
        s2
      );
      const undo = await call(teacher, 'POST', 'exam-undo', {
        sessionId,
        logId: voided.body.logId,
      });
      const r3 = await call(teacher, 'GET', 'exam-results', { sessionId });
      check(
        'отмена вернула баллы',
        undo.status === 200 &&
          JSON.stringify(r3.body.students.map((s: any) => s.score)) === JSON.stringify(scores),
        r3.body.students.map((s: any) => s.score)
      );
      const acc = await call(teacher, 'POST', 'exam-decide', {
        sessionId,
        itemId: word.itemId,
        decision: 'accept',
        answer: 'неверно',
      });
      const r4 = await call(teacher, 'GET', 'exam-results', { sessionId });
      check(
        'засчитать ответ — у троих ошибавшихся +5',
        acc.status === 200 &&
          JSON.stringify(r4.body.students.map((s: any) => s.score)) ===
            JSON.stringify([100, 85, 65, 50]),
        r4.body.students.map((s: any) => s.score)
      );
    }
    const ov = await call(teacher, 'POST', 'exam-override', {
      sessionId,
      participantId: pids[3],
      score: 55,
      comment: 'Устно ответил хорошо',
    });
    const r5 = await call(teacher, 'GET', 'exam-results', { sessionId });
    const st3 = r5.body.students.find((s: any) => s.participantId === pids[3]);
    check(
      'ручной балл с комментарием',
      ov.status === 200 && st3.score === 55 && st3.overridden,
      st3
    );

    const card = await call(teacher, 'GET', 'exam-student', { sessionId, participantId: pids[3] });
    check(
      'карточка ученика: ответы, подготовка, комментарий',
      card.status === 200 &&
        card.body.items?.length === 20 &&
        card.body.preparation?.days === 14 &&
        card.body.comment === 'Устно ответил хорошо',
      card.body
    );
    const cardForeign = await call(students[0], 'GET', 'exam-student', {
      sessionId,
      participantId: pids[3],
    });
    check('ученик не видит карточку другого', cardForeign.status === 403, cardForeign.status);

    const due = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const hw = await call(teacher, 'POST', 'exam-homework', { sessionId, dueAt: due });
    check(
      'домашка по ошибкам: задание каждому, у кого есть ошибки',
      hw.status === 200 && hw.body.created?.length >= 2 && hw.body.failed?.length === 0,
      hw.body
    );
    const retake = await call(teacher, 'POST', 'exam-retake', { sessionId });
    const retakeDraft = await call(teacher, 'GET', 'exam-draft', {
      sessionId: retake.body.sessionId,
    });
    check(
      'пересдача: черновик с теми же словами',
      retake.status === 201 &&
        retakeDraft.body.items?.length === 20 &&
        retakeDraft.body.status === 'draft',
      retakeDraft.body
    );

    const mine0 = await call(students[0], 'GET', 'exam-my', { sessionId });
    check('до открытия ученик не видит балл', mine0.body.released === false, mine0.body);
    // Ученик 2 ошибся на вопросе №2 (№1 учитель засчитал) — слово «выучено» (шаг 3); после открытия — шаг 2
    const wrongCard = draft.items[1].cardId;
    await db.query(
      `INSERT INTO card_progress (user_id, card_id, status, learning_step, next_review, updated_at)
       VALUES ($1, $2, 'young', 3, NOW() + interval '5 days', NOW())`,
      [students[1], wrongCard]
    );
    const rel = await call(teacher, 'POST', 'exam-release', { sessionId });
    const prog = (
      await db.query<{ learning_step: number; due: boolean }>(
        `SELECT learning_step, next_review <= NOW() + interval '1 minute' AS due
         FROM card_progress WHERE user_id = $1 AND card_id = $2`,
        [students[1], wrongCard]
      )
    ).rows[0];
    check(
      'ошибка вернулась в повторения: шаг 3 → 2, сразу к повторению',
      prog?.learning_step === 2 && prog?.due === true,
      prog
    );
    check('открыть результаты', rel.status === 200, rel.body);
    const mine = await call(students[3], 'GET', 'exam-my', { sessionId });
    check(
      'ученик видит балл, комментарий и разбор',
      mine.body.released &&
        mine.body.score === 55 &&
        mine.body.comment &&
        mine.body.items?.length === 20,
      mine.body
    );
    const list = await call(students[3], 'GET', 'exam-my');
    check(
      '«Мои экзамены»',
      Array.isArray(list.body) && list.body.some((e: any) => e.sessionId === sessionId)
    );
  } finally {
    // Каждый шаг отдельно: упавший шаг не должен оставить пользователей EXAM-CHECK в базе
    const cleanup: [string, unknown[]][] = [
      [`DELETE FROM test_sessions WHERE course_id = $1`, [courseId]],
      [`DELETE FROM card_progress WHERE user_id = ANY($1)`, [users]],
      [`DELETE FROM homework WHERE course_id = $1`, [courseId]],
      [`DELETE FROM card_sets WHERE course_id = $1`, [courseId]],
      [`DELETE FROM courses WHERE id = $1`, [courseId]],
      [`DELETE FROM api_rate_limits WHERE user_id = ANY($1)`, [users]],
      [`DELETE FROM users WHERE id = ANY($1)`, [users]],
    ];
    for (const [text, params] of cleanup) {
      if (!courseId && text.includes('course_id')) continue;
      try {
        await db.query(text, params);
      } catch (e) {
        console.error(`  ! очистка: ${text} — ${(e as Error).message}`);
      }
    }
    await db.end();
    fake.close();
  }
  console.log(`\nПройдено: ${passed}, ошибок: ${failures.length}`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
