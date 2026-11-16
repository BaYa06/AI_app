/**
 * Проверка книг учебного центра на staging (plan/new/center_books.md, Center 4).
 *
 *   npx tsx scripts/check-center-access.ts --staging
 *
 * Работает только с --staging (база — только из .env.staging, хост обязан быть staging).
 * Создаёт тестовые центры, книги, коды и пользователей с пометкой CENTER-CHECK, вызывает НАСТОЯЩИЕ
 * обработчики api/books.js, api/data.js, api/progress.js, api/library.js, api/teacher.js на этой базе
 * и в конце всё удаляет. Вход Supabase подменяет локальный сервер: токен = id тестового пользователя.
 *
 * Проверяет: активацию (валидный, истёкший, без мест, повторный, продление, договор), гонку за последнее
 * место, перебор кодов, доступ к словам без доступа (UI-путь и прямые запросы), два центра,
 * библиотеку и поиск, группу центра и места в ней.
 */
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { connect, describeDatabaseTarget, getDatabaseUrl, isStagingRun } from './lib/db';

const TAG = 'CENTER-CHECK';
const RUN = randomBytes(2).toString('hex').toUpperCase(); // в кодах: уникально на запуск

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
      `  ✗ ${name}${details !== undefined ? ' — ' + JSON.stringify(details).slice(0, 300) : ''}`
    );
  }
}

/** Подмена Supabase: GET /auth/v1/user отвечает пользователем, id которого — в токене после последней точки. */
async function startFakeSupabase(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const id = token.split('.').pop() || '';
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

let ipCounter = 0;
/** Вызов обработчика как на Vercel. Каждый вызов — со своим IP, кроме явно заданного. */
async function call(
  handler: Handler,
  user: string | null,
  method: 'GET' | 'POST',
  query: Record<string, string>,
  body?: unknown,
  ip?: string
): Promise<Res> {
  ipCounter++;
  const req = {
    method,
    query,
    body,
    headers: {
      ...(user ? { authorization: `Bearer ${tokenFor(user)}` } : {}),
      'x-forwarded-for':
        ip || `10.${RUN.charCodeAt(0)}.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
    },
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
      send(b: unknown) {
        resolve({ status, body: b });
        return res;
      },
      end() {
        resolve({ status, body: null });
        return res;
      },
    };
    handler(req, res).catch((e) => resolve({ status: 599, body: String(e?.message || e) }));
  });
}

async function main() {
  const target = describeDatabaseTarget();
  if (!isStagingRun || !target.isStaging || target.isProd) {
    console.error(`Только staging: запустите с --staging (сейчас ${target.host}).`);
    process.exit(2);
  }
  console.log(`База: ${target.host} (staging), запуск ${RUN}\n`);

  const fake = await startFakeSupabase();
  process.env.POSTGRES_URL = getDatabaseUrl();
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_ANON_KEY = 'center-check';

  const books = (await import('../api/books.js')).default as Handler;
  const data = (await import('../api/data.js')).default as Handler;
  const progress = (await import('../api/progress.js')).default as Handler;
  const library = (await import('../api/library.js')).default as Handler;
  const teacher = (await import('../api/teacher.js')).default as Handler;

  const db = await connect();
  const ids = {
    users: [] as string[],
    orgs: [] as string[],
    books: [] as string[],
    courses: [] as string[],
  };

  try {
    // ── Данные ───────────────────────────────────────────────
    const newUser = async (name: string) => {
      const id = randomUUID();
      await db.query(`INSERT INTO users (id, display_name, user_name) VALUES ($1, $2, $2)`, [
        id,
        `${TAG} ${name}`,
      ]);
      ids.users.push(id);
      return id;
    };
    const newOrg = async (name: string, seats: number, contractDays: number | null) => {
      const r = await db.query<{ id: string }>(
        `INSERT INTO organizations (name, seat_limit, contract_until)
         VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $3::int) END)
         RETURNING id`,
        [`${TAG} ${name}`, seats, contractDays]
      );
      ids.orgs.push(r.rows[0].id);
      return r.rows[0].id;
    };
    const newCode = async (
      org: string,
      code: string,
      opts: { days?: number; max?: number; from?: string; until?: string } = {}
    ) => {
      await db.query(
        `INSERT INTO org_codes (organization_id, code, valid_from, valid_until, access_days, max_activations)
         VALUES ($1, $2, COALESCE($3::timestamptz, NOW() - INTERVAL '1 day'),
                 COALESCE($4::timestamptz, NOW() + INTERVAL '30 days'), $5, $6)`,
        [org, code, opts.from || null, opts.until || null, opts.days ?? 30, opts.max ?? 100]
      );
      return code;
    };
    /** Книга (центра или общая) с одним юнитом и официальным набором из двух слов. */
    const newBook = async (title: string, org: string | null) => {
      await db.query('BEGIN');
      await db.query("SET LOCAL flashly.official_write = 'on'");
      const b = await db.query<{ id: string }>(
        `INSERT INTO books (title, edition, language_from, language_to, is_published, student_visible, organization_id)
         VALUES ($1, $2, 'en', 'ru', true, true, $3) RETURNING id`,
        [`${TAG} ${title}`, RUN, org]
      );
      const u = await db.query<{ id: string }>(
        `INSERT INTO book_units (book_id, number, title) VALUES ($1, 1, 'Unit 1') RETURNING id`,
        [b.rows[0].id]
      );
      const s = await db.query<{ id: string }>(
        `INSERT INTO card_sets (title, language_from, language_to, is_official, unit_id, total_cards)
         VALUES ($1, 'en', 'ru', true, $2, 2) RETURNING id`,
        [`${TAG} ${title} U1`, u.rows[0].id]
      );
      const c = await db.query<{ id: string }>(
        `INSERT INTO cards (set_id, front, back, sort_order) VALUES ($1, 'apple', 'яблоко', 1), ($1, 'pear', 'груша', 2)
         RETURNING id`,
        [s.rows[0].id]
      );
      await db.query('COMMIT');
      ids.books.push(b.rows[0].id);
      return {
        bookId: b.rows[0].id,
        unitId: u.rows[0].id,
        setId: s.rows[0].id,
        cardId: c.rows[0].id,
      };
    };
    const accessUntil = async (org: string, user: string) =>
      (
        await db.query<{ t: Date }>(
          `SELECT access_until AS t FROM org_students WHERE organization_id = $1 AND user_id = $2`,
          [org, user]
        )
      ).rows[0]?.t;
    const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 86_400_000;
    const activate = (user: string, code: string, ip?: string) =>
      call(books, user, 'POST', { action: 'org-activate' }, { code }, ip);
    const officialSetIds = async (user: string, setIds: string[]) => {
      const r = await call(books, user, 'GET', {
        action: 'official-sets',
        setIds: setIds.join(','),
      });
      return (r.body?.sets || []).map((s: any) => s.id) as string[];
    };
    const answer = (user: string, cardId: string) =>
      call(
        progress,
        user,
        'POST',
        { action: 'answer' },
        {
          answers: [
            {
              answerId: randomUUID(),
              cardId,
              mode: 'flashcard',
              selfRating: 3,
              answeredAt: Date.now(),
              timeSpentMs: 3000,
            },
          ],
        }
      );

    const orgA = await newOrg('Alfa', 4, 365);
    const orgB = await newOrg('Beta', 10, 365);
    const bookA = await newBook('Alfa Book', orgA);
    const bookB = await newBook('Beta Book', orgB);
    const bookPublic = await newBook('Public Book', null);

    const student = await newUser('student A');
    const studentB = await newUser('student B');
    const stranger = await newUser('stranger');
    const teacherA = await newUser('teacher A');
    await db.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'teacher')`,
      [orgA, teacherA]
    );

    const codeOk = await newCode(orgA, `CC${RUN}-OK`, { days: 30 });
    const codeOk2 = await newCode(orgA, `CC${RUN}-NEW`, { days: 30 });
    const codeWindow = await newCode(orgA, `CC${RUN}-OLD`, {
      from: new Date(Date.now() - 60 * 86_400_000).toISOString(),
      until: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const codeOne = await newCode(orgA, `CC${RUN}-ONE`, { max: 1 });
    const codeB = await newCode(orgB, `CC${RUN}-BETA`);

    // ── 1. Активация ─────────────────────────────────────────
    console.log('Активация кода');
    const info = await call(books, student, 'GET', {
      action: 'org-info',
      code: codeOk.toLowerCase(),
    });
    check(
      'org-info: центр найден (регистр не важен)',
      info.status === 200 && info.body?.reason === 'ok',
      info
    );
    check(
      'org-info: ничего не записал',
      (
        await db.query(
          `SELECT 1 FROM org_code_activations a JOIN org_codes c ON c.id = a.code_id WHERE c.code = $1`,
          [codeOk]
        )
      ).rows.length === 0
    );
    check(
      'org-info: лимиты кода не отдаются',
      !JSON.stringify(info.body).match(/max_?activations|activations_?count|seat/i),
      info.body
    );

    // Слов книги до активации нет
    check(
      'до активации: слов книги нет',
      !(await officialSetIds(student, [bookA.setId])).includes(bookA.setId)
    );

    const act = await activate(student, codeOk);
    check('валидный код: доступ открыт', act.status === 200 && act.body?.reason === 'ok', act);
    const until1 = await accessUntil(orgA, student);
    check('доступ на 30 дней', !!until1 && Math.abs(days(until1, new Date()) - 30) < 0.01, until1);

    const again = await activate(student, codeOk);
    const countAfter = (
      await db.query<{ n: number }>(
        `SELECT activations_count AS n FROM org_codes WHERE code = $1`,
        [codeOk]
      )
    ).rows[0].n;
    check(
      'повторный ввод того же кода: «доступ уже открыт»',
      again.status === 200 && again.body?.reason === 'already_active',
      again
    );
    check('повторный ввод не тратит место', countAfter === 1, countAfter);

    const old = await activate(student, codeWindow);
    check(
      'код с истёкшим сроком ввода: expired (410)',
      old.status === 410 && old.body?.reason === 'expired',
      old
    );

    const ext = await activate(student, codeOk2);
    const until2 = await accessUntil(orgA, student);
    check(
      'новый код того же центра: дни складываются (+30)',
      ext.status === 200 && !!until2 && Math.abs(days(until2, until1) - 30) < 0.01,
      {
        until1,
        until2,
      }
    );

    const nf = await activate(student, `CC${RUN}-NOPE`);
    check(
      'несуществующий код: not_found (404)',
      nf.status === 404 && nf.body?.reason === 'not_found',
      nf
    );

    const one1 = await activate(teacherA, codeOne);
    const one2 = await activate(stranger, codeOne);
    check('код на 1 активацию: первый проходит', one1.status === 200, one1);
    check(
      'код на 1 активацию: второй — full (409)',
      one2.status === 409 && one2.body?.reason === 'full',
      one2
    );

    // Места центра: лимит 4. Заняты: student, teacherA (по коду ONE). Ещё двое — и мест нет.
    const s3 = await newUser('seat 3');
    const s4 = await newUser('seat 4');
    const s5 = await newUser('seat 5');
    await activate(s3, codeOk);
    await activate(s4, codeOk);
    const over = await activate(s5, codeOk);
    check('мест центра нет: full (409)', over.status === 409 && over.body?.reason === 'full', over);
    check(
      'места считаются верно',
      (await db.query<{ n: number }>(`SELECT flashly_org_seats_used($1) AS n`, [orgA])).rows[0]
        .n === 4
    );
    const back = await activate(student, codeOk);
    check(
      'у кого место уже есть — повторный ввод проходит и при полном центре',
      back.body?.reason === 'already_active',
      back
    );

    // Договор
    const orgC = await newOrg('Contract soon', 10, 10);
    const codeC = await newCode(orgC, `CC${RUN}-CNT`, { days: 90 });
    const actC = await activate(student, codeC);
    const untilC = await accessUntil(orgC, student);
    const contractC = (
      await db.query<{ t: Date }>(`SELECT contract_until AS t FROM organizations WHERE id = $1`, [
        orgC,
      ])
    ).rows[0].t;
    check(
      'доступ не дальше договора (90 дней обрезаны до 10)',
      actC.status === 200 && untilC?.getTime() === contractC.getTime(),
      {
        untilC,
        contractC,
      }
    );
    const orgD = await newOrg('Contract ended', 10, -1);
    const codeD = await newCode(orgD, `CC${RUN}-END`);
    const actD = await activate(student, codeD);
    check(
      'договор кончился: contract_ended (410)',
      actD.status === 410 && actD.body?.reason === 'contract_ended',
      actD
    );

    // Гонка за последнее место
    const orgE = await newOrg('Race', 1, 365);
    const codeE = await newCode(orgE, `CC${RUN}-RACE`);
    const racers = await Promise.all(Array.from({ length: 10 }, (_, i) => newUser(`racer ${i}`)));
    const race = await Promise.all(racers.map((u) => activate(u, codeE)));
    const won = race.filter((r) => r.status === 200).length;
    check(
      '10 одновременных активаций на 1 место: проходит ровно одна',
      won === 1,
      race.map((r) => r.status)
    );

    // Перебор: 10 неудач за 10 минут на аккаунт → 429; удачные не считаются
    const guesser = await newUser('guesser');
    for (let i = 0; i < 10; i++) await activate(guesser, `CC${RUN}-X${i}`);
    const blocked = await activate(guesser, codeB);
    check(
      '11-я попытка после 10 неудач: 429, даже с верным кодом',
      blocked.status === 429 && blocked.body?.reason === 'rate_limited',
      blocked
    );
    const sameIp = '10.250.250.250';
    const okMany = [];
    for (let i = 0; i < 3; i++)
      okMany.push(await activate(await newUser(`wifi ${i}`), codeB, sameIp));
    check(
      'удачные активации с одного IP не блокируются',
      okMany.every((r) => r.status === 200),
      okMany.map((r) => r.status)
    );

    // ── 2. Слова книги ───────────────────────────────────────
    console.log('\nДоступ к словам');
    check(
      'ученик центра: official-sets отдаёт набор своей книги',
      (await officialSetIds(student, [bookA.setId])).includes(bookA.setId)
    );
    const cardsOwn = await call(data, student, 'GET', {
      action: 'loadCardsBySet',
      setId: bookA.setId,
    });
    check('ученик центра: карточки набора (data) — 200', cardsOwn.status === 200, cardsOwn.status);
    const detail = await call(books, student, 'GET', {
      action: 'book-detail',
      bookId: bookA.bookId,
    });
    check('ученик центра: book-detail — 200', detail.status === 200, detail.status);
    const ans = await answer(student, bookA.cardId);
    check(
      'ученик центра: ответ на карточку принят',
      ans.status === 200 && ans.body?.results?.[0]?.status === 'ok',
      ans.body
    );

    const strangerSets = await officialSetIds(stranger, [bookA.setId, bookB.setId]);
    check('чужой: official-sets не отдаёт книги центров', strangerSets.length === 0, strangerSets);
    const strangerCards = await call(data, stranger, 'GET', {
      action: 'loadCardsBySet',
      setId: bookA.setId,
    });
    check(
      'чужой: карточки по setId напрямую — отказ',
      strangerCards.status === 403,
      strangerCards.status
    );
    const strangerDetail = await call(books, stranger, 'GET', {
      action: 'book-detail',
      bookId: bookA.bookId,
    });
    check(
      'чужой: book-detail — 404 (не раскрываем книгу)',
      strangerDetail.status === 404,
      strangerDetail.status
    );
    const strangerAns = await answer(stranger, bookA.cardId);
    check(
      'чужой: ответ на карточку — no_access',
      JSON.stringify(strangerAns.body).includes('no_access'),
      strangerAns.body
    );
    const fork = await call(
      books,
      stranger,
      'POST',
      { action: 'fork-set' },
      { setId: bookA.setId }
    );
    check('чужой: копия набора книги центра — 404', fork.status === 404, fork.status);
    const forkOwn = await call(
      books,
      student,
      'POST',
      { action: 'fork-set' },
      { setId: bookA.setId }
    );
    check(
      'ученик центра: копия набора книги центра — тоже 404',
      forkOwn.status === 404,
      forkOwn.status
    );

    // Два центра
    check(
      'ученик центра B: книги A нет',
      !(await officialSetIds(studentB, [bookA.setId])).includes(bookA.setId)
    );
    await activate(studentB, codeB);
    check(
      'ученик центра B: своя книга есть',
      (await officialSetIds(studentB, [bookB.setId])).includes(bookB.setId)
    );
    check(
      'ученик центра B: книги A нет и после своей активации',
      !(await officialSetIds(studentB, [bookA.setId])).includes(bookA.setId)
    );
    const bDetail = await call(books, studentB, 'GET', {
      action: 'book-detail',
      bookId: bookA.bookId,
    });
    check('ученик центра B: book-detail книги A — 404', bDetail.status === 404, bDetail.status);
    check(
      'учитель центра A: book-detail своей книги — 200',
      (await call(books, teacherA, 'GET', { action: 'book-detail', bookId: bookA.bookId }))
        .status === 200
    );
    check(
      'учитель центра A: книги B нет',
      (await call(books, teacherA, 'GET', { action: 'book-detail', bookId: bookB.bookId }))
        .status === 404
    );

    // Каталог и поиск
    const list = await call(books, teacherA, 'GET', { action: 'list-books', q: TAG });
    const listIds = (list.body?.books || []).map((b: any) => b.id);
    check(
      'list-books: книг центров нет даже у учителя центра',
      !listIds.includes(bookA.bookId) && !listIds.includes(bookB.bookId),
      listIds
    );
    check('list-books: общая книга есть', listIds.includes(bookPublic.bookId), listIds);
    const search = await call(library, student, 'GET', { action: 'search', q: TAG });
    const searchText = JSON.stringify(search.body);
    check(
      'поиск библиотеки: книг центров нет',
      search.status === 200 &&
        !searchText.includes(bookA.bookId) &&
        !searchText.includes(bookB.bookId),
      search.status
    );
    const catalog = await call(library, student, 'GET', { action: 'catalog' });
    check(
      'полка библиотеки: книг центров нет',
      catalog.status === 200 && !JSON.stringify(catalog.body).includes(bookA.bookId),
      catalog.status
    );

    // my-orgs / my-book
    const orgs = await call(books, student, 'GET', { action: 'my-orgs' });
    const myA = (orgs.body?.organizations || []).find((o: any) => o.id === orgA);
    check(
      'my-orgs: центр A активен, его книга в списке',
      !!myA && myA.active === true && myA.books.some((b: any) => b.id === bookA.bookId),
      orgs.body
    );
    const pick = await call(
      books,
      student,
      'POST',
      { action: 'my-book' },
      { bookId: bookA.bookId, unitId: bookA.unitId, active: true }
    );
    check(
      'my-book: книга выбрана текущей',
      pick.status === 200 && pick.body?.myBook?.isActive === true,
      pick
    );
    const pickB = await call(
      books,
      student,
      'POST',
      { action: 'my-book' },
      { bookId: bookB.bookId, active: true }
    );
    check('my-book: чужую книгу выбрать нельзя (404)', pickB.status === 404, pickB.status);
    const pickWrongUnit = await call(
      books,
      student,
      'POST',
      { action: 'my-book' },
      { bookId: bookA.bookId, unitId: bookB.unitId }
    );
    check(
      'my-book: юнит из другой книги — 400',
      pickWrongUnit.status === 400,
      pickWrongUnit.status
    );

    // ── 3. Доступ закончился ─────────────────────────────────
    console.log('\nДоступ закончился');
    await db.query(
      `UPDATE card_progress SET next_review = NOW() - INTERVAL '1 hour', learning_step = 1
                     WHERE user_id = $1 AND card_id = $2`,
      [student, bookA.cardId]
    );
    const accessCheckBefore = (
      await db.query<{ ok: boolean }>(`SELECT flashly_card_access($1, $2) AS ok`, [
        bookA.cardId,
        student,
      ])
    ).rows[0].ok;
    check('пока доступ есть, слово считается в «ждут повторения»', accessCheckBefore === true);
    await db.query(
      `UPDATE org_students SET access_until = NOW() - INTERVAL '1 minute' WHERE organization_id = $1 AND user_id = $2`,
      [orgA, student]
    );
    check(
      'истёк: начатый юнит больше не приходит (official-sets)',
      !(await officialSetIds(student, [])).includes(bookA.setId)
    );
    check(
      'истёк: запрос набора напрямую — нет',
      !(await officialSetIds(student, [bookA.setId])).includes(bookA.setId)
    );
    const expiredCards = await call(data, student, 'GET', {
      action: 'loadCardsBySet',
      setId: bookA.setId,
    });
    check('истёк: карточки набора — отказ', expiredCards.status === 403, expiredCards.status);
    const expiredAns = await answer(student, bookA.cardId);
    check(
      'истёк: офлайн-ответ отклонён без ошибки (no_access)',
      expiredAns.status === 200 && JSON.stringify(expiredAns.body).includes('no_access'),
      expiredAns.body
    );
    const accessCheckAfter = (
      await db.query<{ ok: boolean }>(`SELECT flashly_card_access($1, $2) AS ok`, [
        bookA.cardId,
        student,
      ])
    ).rows[0].ok;
    check(
      'истёк: слово не считается в «ждут повторения» (серия, push)',
      accessCheckAfter === false
    );
    const progressKept = (
      await db.query(`SELECT 1 FROM card_progress WHERE user_id = $1 AND card_id = $2`, [
        student,
        bookA.cardId,
      ])
    ).rows.length;
    check('истёк: прогресс сохранён', progressKept === 1);
    const orgsExpired = await call(books, student, 'GET', { action: 'my-orgs' });
    const myAExpired = (orgsExpired.body?.organizations || []).find((o: any) => o.id === orgA);
    check(
      'my-orgs: центр A — доступ закончился, книги видны для экрана «Доступ закончился»',
      myAExpired?.active === false && myAExpired.books.length === 1,
      myAExpired
    );
    const renew = await activate(student, await newCode(orgA, `CC${RUN}-REN`, { days: 30 }));
    check(
      'новый код после окончания: доступ снова есть',
      renew.status === 200 && (await officialSetIds(student, [])).includes(bookA.setId),
      renew
    );

    // ── 4. Группа центра и места ─────────────────────────────
    console.log('\nГруппа учителя центра');
    const orgG = await newOrg('Group', 1, 365);
    const bookG = await newBook('Group Book', orgG);
    const teacherG = await newUser('teacher G');
    await db.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'teacher')`,
      [orgG, teacherG]
    );
    const course = (
      await db.query<{ id: string }>(
        `INSERT INTO courses (user_id, title, organization_id) VALUES ($1, $2, $3) RETURNING id`,
        [teacherG, `${TAG} group`, orgG]
      )
    ).rows[0].id;
    ids.courses.push(course);
    await db.query(`INSERT INTO course_books (course_id, book_id) VALUES ($1, $2)`, [
      course,
      bookG.bookId,
    ]);
    await db.query(
      `INSERT INTO course_units (course_id, unit_id, is_open, opened_at) VALUES ($1, $2, true, NOW())`,
      [course, bookG.unitId]
    );
    const joinCode = randomBytes(3).toString('hex').toUpperCase();
    await db.query(
      `INSERT INTO course_invites (course_id, token, created_by, join_code, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day')`,
      [course, randomBytes(32).toString('hex'), teacherG, joinCode]
    );
    const g1 = await newUser('group 1');
    const g2 = await newUser('group 2');
    const j1 = await call(teacher, g1, 'POST', { action: 'join-by-code' }, { code: joinCode });
    check('ученик вступает в группу центра (место есть)', j1.status === 200, j1);
    check(
      'ученик группы видит открытый юнит книги центра',
      (await officialSetIds(g1, [])).includes(bookG.setId)
    );
    const j2 = await call(teacher, g2, 'POST', { action: 'join-by-code' }, { code: joinCode });
    check(
      'второй ученик: мест центра нет — org_seats_full (409)',
      j2.status === 409 && j2.body?.reason === 'org_seats_full',
      j2
    );
    check(
      'не вступивший ученик книгу группы не видит',
      !(await officialSetIds(g2, [bookG.setId])).includes(bookG.setId)
    );
    const j1again = await call(teacher, g1, 'POST', { action: 'join-by-code' }, { code: joinCode });
    check('уже вступивший проходит и при полном центре', j1again.status === 200, j1again.status);

    // Книга центра в обычной (не центровой) группе — не видна
    const plainCourse = (
      await db.query<{ id: string }>(
        `INSERT INTO courses (user_id, title) VALUES ($1, $2) RETURNING id`,
        [teacherG, `${TAG} plain`]
      )
    ).rows[0].id;
    ids.courses.push(plainCourse);
    await db.query(`INSERT INTO course_books (course_id, book_id) VALUES ($1, $2)`, [
      plainCourse,
      bookA.bookId,
    ]);
    await db.query(
      `INSERT INTO course_units (course_id, unit_id, is_open, opened_at) VALUES ($1, $2, true, NOW())`,
      [plainCourse, bookA.unitId]
    );
    await db.query(
      `INSERT INTO course_members (course_id, user_id, role) VALUES ($1, $2, 'student')`,
      [plainCourse, g2]
    );
    check(
      'книга центра A в обычной группе: ученик её не видит',
      !(await officialSetIds(g2, [])).includes(bookA.setId)
    );
    const plan = await call(books, g2, 'GET', { action: 'course-plan', courseId: plainCourse });
    check(
      'course-plan обычной группы: книги центра нет',
      plan.status === 200 && (plan.body?.books || []).length === 0,
      plan.body
    );
    const attach = await call(
      books,
      teacherA,
      'POST',
      { action: 'attach-to-courses' },
      { bookId: bookA.bookId, courseIds: [plainCourse] }
    );
    check(
      'attach-to-courses: книгу центра к группе пока подключает только админ (404)',
      attach.status === 404,
      attach.status
    );

    // Договор центра кончился — всё закрыто
    await db.query(
      `UPDATE organizations SET contract_until = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [orgG]
    );
    check(
      'договор кончился: ученик группы книгу не видит',
      !(await officialSetIds(g1, [])).includes(bookG.setId)
    );
    check(
      'договор кончился: учитель центра книгу не видит',
      (await call(books, teacherG, 'GET', { action: 'book-detail', bookId: bookG.bookId }))
        .status === 404
    );
  } finally {
    // ── Уборка ───────────────────────────────────────────────
    try {
      await db.query('ROLLBACK').catch(() => {});
      await db.query('BEGIN');
      await db.query("SET LOCAL flashly.official_write = 'on'");
      if (ids.courses.length)
        await db.query(`DELETE FROM courses WHERE id = ANY($1)`, [ids.courses]);
      await db.query(
        `DELETE FROM card_sets WHERE unit_id IN (SELECT id FROM book_units WHERE book_id = ANY($1))`,
        [ids.books]
      );
      await db.query(`DELETE FROM books WHERE id = ANY($1)`, [ids.books]);
      await db.query(`DELETE FROM organizations WHERE id = ANY($1)`, [ids.orgs]);
      await db.query(`DELETE FROM api_rate_limits WHERE user_id = ANY($1)`, [ids.users]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [ids.users]);
      await db.query('COMMIT');
      const left = await db.query(
        `SELECT 1 FROM organizations WHERE name LIKE $1 UNION ALL SELECT 1 FROM users WHERE display_name LIKE $1`,
        [`${TAG}%`]
      );
      console.log(
        `\nУборка: тестовые данные удалены${left.rows.length ? ` (осталось от старых запусков: ${left.rows.length})` : ''}`
      );
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      console.error('Уборка не удалась:', e);
    }
    await db.end();
    fake.close();
  }

  console.log(`\nИтог: ${passed} прошло, ${failures.length} не прошло`);
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
