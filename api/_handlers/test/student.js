/**
 * api/test.js — живой тест — сторона ученика: войти, вопрос, ответ (Clean 10 — перенесено без изменений).
 */
import { broadcast, AWAY_GRACE_SEC, attemptSummary, finishParticipantEarly } from './_shared.js';

/**
 * Rate-limit на угадывание 4-значного кода live-теста: не больше `maxAttempts` попыток от
 * одного userId за `windowSeconds`. Считается в БД (переживает холодный старт serverless-
 * функции), таблица общая с api/teacher.js — создаётся лениво при первом обращении.
 */
export async function checkJoinRateLimit(sql, userId) {
  await sql`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      user_id UUID NOT NULL,
      action VARCHAR(50) NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, action, window_start)
    )
  `;
  const windowSeconds = 60;
  const maxAttempts = 10;
  const windowStart = new Date(
    Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000
  ).toISOString();
  const result = await sql`
    INSERT INTO api_rate_limits (user_id, action, window_start, attempts)
    VALUES (${userId}::uuid, 'live-test-code-guess', ${windowStart}::timestamptz, 1)
    ON CONFLICT (user_id, action, window_start) DO UPDATE SET
      attempts = api_rate_limits.attempts + 1
    RETURNING attempts
  `;
  return result[0].attempts <= maxAttempts;
}

/** Перемешать массив (Fisher-Yates) */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Actions ────────────────────────────────────────────

/**
 * POST ?action=join
 * Body: { code, exitControl? }
 * exitControl — клиент ученика умеет контроль выхода (plan/done/exam_lockdown.md). Старые версии
 * его не шлют: их пускаем как раньше, учитель видит метку «Старая версия».
 */
export async function joinTest(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, exitControl } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }
  const clientExitControl = exitControl === true;

  if (!(await checkJoinRateLimit(sql, userId))) {
    return res.status(429).json({ error: 'Too many attempts, try again in a minute' });
  }

  // Найти активную сессию по коду
  const sessions = await sql`
    SELECT ts.id, ts.course_id, ts.set_id, ts.test_mode, ts.question_count, ts.time_per_question, ts.status,
           ts.exit_control, ts.card_ids,
           cs.title AS set_title,
           COALESCE(u.display_name, u.email) AS teacher_name
    FROM test_sessions ts
    JOIN card_sets cs ON cs.id = ts.set_id
    JOIN users u ON u.id = ts.teacher_id
    WHERE ts.code = ${code} AND ts.status IN ('waiting', 'active')
  `;

  if (sessions.length === 0) {
    return res.status(404).json({ error: 'Test not found or already finished' });
  }

  const session = sessions[0];

  // Проверить что ученик в курсе
  const membership = await sql`
    SELECT id FROM course_members
    WHERE course_id = ${session.course_id}::uuid AND user_id = ${userId}::uuid
  `;
  if (membership.length === 0) {
    return res.status(403).json({ error: 'You are not a member of this course' });
  }

  // Проверить что ученик ещё не в сессии
  const existing = await sql`
    SELECT id, answer_count, correct_count, question_order, score, finished_at, left_reason,
           rejoin_allowed
    FROM test_participants
    WHERE session_id = ${session.id}::uuid AND user_id = ${userId}::uuid
  `;
  if (existing.length > 0) {
    let ex = existing[0];

    // Контроль выхода: повторный вход в уже идущий тест с незавершённой попыткой значит, что
    // приложение закрывали (иначе ученик остался бы на экране теста). Это выход — попытка
    // завершается с причиной relaunch. Исключение — учитель разрешил продолжить
    // (rejoin_allowed, флаг одноразовый). Старых клиентов не трогаем: они не умеют показать
    // «Тест завершён» и открыли бы пустой экран вопроса.
    if (
      session.exit_control &&
      clientExitControl &&
      session.status === 'active' &&
      !ex.finished_at
    ) {
      if (ex.rejoin_allowed) {
        await sql`
          UPDATE test_participants SET rejoin_allowed = false, client_exit_control = true
          WHERE id = ${ex.id}::uuid
        `;
      } else {
        const finished = await finishParticipantEarly(sql, ex.id, 'relaunch');
        if (finished) ex = { ...ex, ...finished, finished_at: new Date() };
      }
    }

    return res.status(200).json({
      sessionId: session.id,
      participantId: existing[0].id,
      teacherName: session.teacher_name,
      setTitle: session.set_title,
      testMode: session.test_mode,
      questionCount: session.question_count,
      timePerQuestion: session.time_per_question,
      alreadyJoined: true,
      // Статус сессии и уже отвеченное кол-во — чтобы клиент мог восстановить прогресс вместо
      // того чтобы всегда открывать вопрос с индексом 0 (см. план, пункт 40).
      status: session.status,
      answerCount: ex.answer_count,
      exitControl: session.exit_control,
      // Попытка уже завершена (досрочно или полностью) — клиент показывает итог, а не вопрос.
      finished: Boolean(ex.finished_at),
      ...(ex.left_reason ? attemptSummary(ex) : {}),
    });
  }

  // Вопросы — слова из списка теста (Teacher 34), иначе все карточки набора.
  // Удалённое после создания теста слово просто выпадает.
  const byList = Array.isArray(session.card_ids) && session.card_ids.length > 0;
  const cards = byList
    ? await sql`SELECT id FROM cards WHERE id = ANY(${session.card_ids}::uuid[])`
    : await sql`
    SELECT id FROM cards WHERE set_id = ${session.set_id}::uuid
  `;
  if (cards.length === 0) {
    return res.status(400).json({ error: 'No cards in this set' });
  }

  // Перемешать и выбрать нужное кол-во
  const shuffled = shuffle(cards.map((c) => c.id));
  const questionOrder = shuffled.slice(0, Math.min(session.question_count, shuffled.length));

  // Получить имя ученика
  const user = await sql`
    SELECT COALESCE(display_name, email, 'Student') AS name FROM users WHERE id = ${userId}::uuid
  `;
  const displayName = user[0]?.name || 'Student';

  // Создать участника
  const participant = await sql`
    INSERT INTO test_participants (session_id, user_id, display_name, question_order, client_exit_control)
    VALUES (${session.id}::uuid, ${userId}::uuid, ${displayName}, ${JSON.stringify(questionOrder)}::jsonb, ${clientExitControl})
    RETURNING id
  `;

  // Отправить событие учителю. participantId НЕ включаем — канал `test:${sessionId}` публичный
  // (broadcast без контроля доступа), рассылка чужого participantId в открытом виде позволяла бы
  // слать ответы от чужого имени (см. план, пункт 36). participantId возвращается только в этом
  // прямом HTTP-ответе — только вызывающему ученику.
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  await broadcast(session.id, 'student_joined', {
    userId,
    displayName,
    initials,
    // false у старых версий приложения — учитель видит, что контроль выхода у ученика не работает
    clientExitControl,
  });

  return res.status(200).json({
    sessionId: session.id,
    participantId: participant[0].id,
    teacherName: session.teacher_name,
    setTitle: session.set_title,
    testMode: session.test_mode,
    questionCount: questionOrder.length,
    timePerQuestion: session.time_per_question,
    exitControl: session.exit_control,
  });
}

/**
 * POST ?action=answer
 * Body: { participantId, cardId, chosenAnswer, timeSpentSec }
 */
export async function answerQuestion(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { participantId, cardId, chosenAnswer, timeSpentSec } = req.body;
  if (!participantId || !cardId) {
    return res.status(400).json({ error: 'participantId and cardId are required' });
  }

  // participantId владелец — иначе кто угодно с валидным токеном мог бы слать ответы за
  // чужого участника (см. план, пункт 36 — раньше participantId вообще утекал всем в сессии).
  const participantRow = await sql`
    SELECT p.session_id, p.user_id, p.display_name, p.question_order, p.answer_count,
           p.correct_count, p.score, p.left_reason, p.away_at, s.exit_control
    FROM test_participants p
    JOIN test_sessions s ON s.id = p.session_id
    WHERE p.id = ${participantId}::uuid
  `;
  if (participantRow.length === 0) {
    return res.status(404).json({ error: 'Participant not found' });
  }
  const p0 = participantRow[0];
  if (p0.user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized for this participant' });
  }
  if (await rejectIfLeft(sql, res, participantId, p0)) return;

  // cardId должен реально быть в вопросах, выданных этому участнику при join — иначе можно
  // было бы отвечать на произвольные карточки чужих наборов.
  if (!p0.question_order.includes(cardId)) {
    return res.status(400).json({ error: 'Card is not part of this test session' });
  }

  // Получить правильный ответ
  const card = await sql`
    SELECT back FROM cards WHERE id = ${cardId}::uuid
  `;
  if (card.length === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  const correctAnswer = card[0].back;
  const isCorrect =
    (chosenAnswer || '').trim().toLowerCase() === correctAnswer.trim().toLowerCase();

  // UNIQUE(participant_id, card_id) + ON CONFLICT DO NOTHING: повторная отправка того же
  // вопроса (например, retry после обрыва связи, см. план пункт 37) не создаёт вторую строку
  // и не может задвоить счётчики/накрутить score повторными попытками, пока не угадает ответ —
  // раньше каждый ответ возвращал correctAnswer в теле, что было оракулом для такой накрутки.
  const inserted = await sql`
    INSERT INTO test_answers (participant_id, card_id, chosen_answer, correct_answer, is_correct, time_spent_sec)
    VALUES (${participantId}::uuid, ${cardId}::uuid, ${chosenAnswer || ''}, ${correctAnswer}, ${isCorrect}, ${timeSpentSec || 0})
    ON CONFLICT (participant_id, card_id) DO NOTHING
    RETURNING is_correct, correct_answer
  `;
  const isFirstSubmission = inserted.length > 0;

  if (isFirstSubmission) {
    await sql`
      UPDATE test_participants
      SET answer_count = answer_count + 1,
          correct_count = correct_count + ${isCorrect ? 1 : 0},
          rejoin_allowed = false
      WHERE id = ${participantId}::uuid
    `;
  }

  // Получить обновлённого участника
  const participant = await sql`
    SELECT p.session_id, p.user_id, p.answer_count, p.question_order, p.display_name
    FROM test_participants p
    WHERE p.id = ${participantId}::uuid
  `;
  const p = participant[0];
  const totalQuestions = p.question_order.length;
  const done = p.answer_count >= totalQuestions;

  // Broadcast/финиш — только на реальном новом ответе, не на повторе.
  if (isFirstSubmission) {
    // Если все вопросы отвечены — пометить финиш и посчитать score.
    if (done) {
      await sql`
        UPDATE test_participants
        SET finished_at = NOW(),
            score = CASE WHEN jsonb_array_length(question_order) > 0
                         THEN ROUND((correct_count::numeric / jsonb_array_length(question_order)) * 100)
                         ELSE 0 END
        WHERE id = ${participantId}::uuid
      `;
    }
    await broadcast(p.session_id, 'progress_update', {
      userId: p.user_id,
      displayName: p.display_name,
      answered: p.answer_count,
      total: totalQuestions,
      done,
    });
  }

  // На повторной отправке возвращаем уже сохранённый на первой попытке результат (не
  // пересчитываем из нового chosenAnswer) — так это не даёт новой информации по сравнению с
  // тем, что клиент уже получил, и не может быть использовано, чтобы задним числом изменить счёт.
  const resultRow = isFirstSubmission
    ? { is_correct: isCorrect, correct_answer: correctAnswer }
    : (
        await sql`
        SELECT is_correct, correct_answer FROM test_answers
        WHERE participant_id = ${participantId}::uuid AND card_id = ${cardId}::uuid
      `
      )[0];

  return res.status(200).json({
    isCorrect: resultRow.is_correct,
    correctAnswer: resultRow.correct_answer,
    answered: p.answer_count,
    total: totalQuestions,
    done,
  });
}

/**
 * POST ?action=get-question
 * Body: { participantId, questionIndex }
 */
export async function getQuestion(req, res, sql, userId) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { participantId, questionIndex } = req.body;
  if (!participantId || questionIndex === undefined) {
    return res.status(400).json({ error: 'participantId and questionIndex are required' });
  }

  // Получить участника
  const participant = await sql`
    SELECT p.question_order, p.session_id, p.user_id, p.answer_count, p.correct_count, p.score,
           p.left_reason, p.away_at, s.exit_control
    FROM test_participants p
    JOIN test_sessions s ON s.id = p.session_id
    WHERE p.id = ${participantId}::uuid
  `;
  if (participant.length === 0) {
    return res.status(404).json({ error: 'Participant not found' });
  }
  if (participant[0].user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized for this participant' });
  }
  if (await rejectIfLeft(sql, res, participantId, participant[0])) return;

  const questionOrder = participant[0].question_order;
  if (questionIndex < 0 || questionIndex >= questionOrder.length) {
    return res.status(400).json({ error: 'Invalid question index' });
  }

  const cardId = questionOrder[questionIndex];

  // Получить карточку
  const card = await sql`
    SELECT id, front, back, set_id FROM cards WHERE id = ${cardId}::uuid
  `;
  if (card.length === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  // Получить 3 неправильных варианта из того же набора
  const wrongOptions = await sql`
    SELECT back FROM cards
    WHERE set_id = ${card[0].set_id}::uuid AND id != ${cardId}::uuid
    ORDER BY RANDOM()
    LIMIT 3
  `;

  // Составить варианты: 1 правильный + до 3 неправильных
  const options = shuffle([card[0].back, ...wrongOptions.map((w) => w.back)]);

  return res.status(200).json({
    cardId: card[0].id,
    front: card[0].front,
    options,
    questionIndex,
    totalQuestions: questionOrder.length,
  });
}

/**
 * Не выдавать вопросы и не принимать ответы после выхода из приложения — даже от
 * модифицированного клиента. Две ситуации:
 * - попытка уже завершена досрочно (left_reason);
 * - клиент сообщил `away`, но вместо `back` сразу шлёт вопрос/ответ, а льгота уже прошла —
 *   засчитываем выход здесь же.
 * Отправляет 409 { left: true, ... } и возвращает true, если запрос надо прервать.
 * p — строка участника с left_reason, away_at, exit_control, answer_count, correct_count,
 * question_order, score.
 */
export async function rejectIfLeft(sql, res, participantId, p) {
  let left = p.left_reason ? p : null;

  if (!left && p.exit_control && p.away_at) {
    const awaySec = (Date.now() - new Date(p.away_at).getTime()) / 1000;
    if (awaySec > AWAY_GRACE_SEC) {
      left = await finishParticipantEarly(sql, participantId, 'background');
    }
  }
  if (!left) return false;

  res.status(409).json({ error: 'Attempt finished: left the app', ...attemptSummary(left) });
  return true;
}
