import { neon } from '@neondatabase/serverless';
import { getAuthedUser } from './_auth.js';
import { ensureDatabaseInitialized } from './_db-init.js';
import { HttpError, uuid, assertReadableSet } from './_access.js';
import { courseSetsForStudent } from './_course.js';

/**
 * API данных пользователя: профиль, наборы, карточки, курсы, прогресс, серия.
 *
 * Раньше всё это делал клиент (src/services/NeonService.ts) напрямую в Neon со строкой
 * подключения, встроенной в сборку приложения, — любой, кто распакует приложение, мог читать и
 * менять любые данные. Теперь клиент ходит только сюда: userId берётся из Supabase JWT
 * (Authorization: Bearer), права на набор/карточку/курс проверяются на сервере.
 * См. plan/course_rating_and_review_plan.md, этап 0.
 *
 * GET|POST /api/data?action=<имя>  — параметры в query (GET) или JSON-теле (POST).
 * Ответ: { data } или { error }. Имена действий совпадают с методами NeonService.
 *
 * Прогресс по карточкам (уровень, дата повторения) здесь не пишется — только api/progress.js,
 * который сам считает уровень по ответу ученика.
 */

// ─── Проверки прав ──────────────────────────────────────────────────────────

function optString(value, max = 1000) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'string expected');
  return value.slice(0, max);
}

function isoOrNull(ms) {
  return ms ? new Date(Number(ms)).toISOString() : null;
}

/** Набор принадлежит пользователю (менять можно только свои наборы). */
async function assertOwnSet(sql, me, setId) {
  const rows = await sql`SELECT 1 FROM card_sets WHERE id = ${setId}::uuid AND user_id = ${me}::uuid`;
  if (rows.length === 0) throw new HttpError(403, 'Not your set');
}

/** Курс принадлежит пользователю (учитель). */
async function assertOwnCourse(sql, me, courseId) {
  const rows = await sql`SELECT 1 FROM courses WHERE id = ${courseId}::uuid AND user_id = ${me}::uuid`;
  if (rows.length === 0) throw new HttpError(403, 'Not your course');
}

/** Дата клиента YYYY-MM-DD, не дальше суток от UTC-сегодня (любой часовой пояс). */
function localDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Invalid date');
  const today = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (Math.abs(Date.parse(`${value}T00:00:00Z`) - today) > 2 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'Date out of range');
  }
  return value;
}

/** Приращения статистики за один вызов — в разумных пределах. */
function deltas(value) {
  const clamp = (n, max) => Math.max(0, Math.min(max, Math.trunc(Number(n) || 0)));
  return {
    wordsDelta: clamp(value?.wordsDelta, 500),
    minutesDelta: clamp(value?.minutesDelta, 240),
    cardsDelta: clamp(value?.cardsDelta, 500),
  };
}

// ─── Профиль ────────────────────────────────────────────────────────────────

async function ensureUserExists(sql, me, p, user) {
  // email и признак гостя — из токена Supabase, не из запроса
  const email = user.email || null;
  const displayName = optString(p.displayName, 255) || (email ? email.split('@')[0] : null);
  const defaultUserName = email ? '@' + email.split('@')[0].toLowerCase() : null;
  await sql`
    INSERT INTO users (id, email, display_name, is_anonymous, user_name)
    VALUES (${me}::uuid, ${email}, ${displayName ?? 'Гость'}, ${user.is_anonymous === true}, ${defaultUserName})
    ON CONFLICT (id) DO UPDATE SET
      user_name = COALESCE(users.user_name, EXCLUDED.user_name)
  `;
  return true;
}

async function getProfile(sql, me) {
  const rows = await sql`
    SELECT teacher, user_name, display_name, native_language, target_languages, onboarding_completed
    FROM users WHERE id = ${me}::uuid
  `;
  return rows[0] ?? null;
}

async function updateDisplayName(sql, me, p) {
  const displayName = optString(p.displayName, 255);
  if (!displayName) throw new HttpError(400, 'displayName required');
  await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${me}::uuid`;
  return true;
}

async function updateUserName(sql, me, p) {
  const raw = optString(p.userName, 100);
  if (!raw) throw new HttpError(400, 'userName required');
  const normalized = raw.startsWith('@') ? raw.toLowerCase() : '@' + raw.toLowerCase();
  await sql`UPDATE users SET user_name = ${normalized} WHERE id = ${me}::uuid`;
  return true;
}

function optStringArray(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new HttpError(400, 'string[] expected');
  return value.slice(0, 20).map((v) => v.slice(0, 20));
}

async function updateLanguagePreferences(sql, me, p) {
  await sql`
    UPDATE users SET
      native_language = COALESCE(${optString(p.nativeLanguage, 20)}, native_language),
      target_languages = COALESCE(${optStringArray(p.targetLanguages)}, target_languages)
    WHERE id = ${me}::uuid
  `;
  return true;
}

async function saveOnboardingData(sql, me, p) {
  await sql`
    UPDATE users SET
      display_name = COALESCE(${optString(p.displayName, 255)}, display_name),
      teacher = COALESCE(${typeof p.teacher === 'boolean' ? p.teacher : null}, teacher),
      native_language = COALESCE(${optString(p.nativeLanguage, 20)}, native_language),
      target_languages = COALESCE(${optStringArray(p.targetLanguages)}, target_languages),
      learning_goal = COALESCE(${optString(p.learningGoal, 100)}, learning_goal),
      daily_goal = COALESCE(${optString(p.dailyGoal, 100)}, daily_goal),
      teacher_subject = COALESCE(${optString(p.teacherSubject, 100)}, teacher_subject),
      teacher_group_size = COALESCE(${optString(p.teacherGroupSize, 100)}, teacher_group_size),
      onboarding_completed = true
    WHERE id = ${me}::uuid
  `;
  return true;
}

// ─── Наборы и карточки ──────────────────────────────────────────────────────

async function loadSets(sql, me) {
  return sql`
    SELECT id, user_id, course_id, title, description, category, language_from, language_to,
           is_public, created_at, updated_at, total_cards, mastered_cards, studying_cards,
           is_hidden_from_students
    FROM card_sets
    WHERE user_id = ${me}::uuid
    ORDER BY created_at DESC
  `;
}

async function loadCardsBySet(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  await assertReadableSet(sql, me, setId);
  return sql`
    SELECT id, set_id, front, back, example, word_form, word_type, image_url, audio_url,
           created_at, learning_step, next_review, last_reviewed, status
    FROM cards
    WHERE set_id = ${setId}::uuid
    ORDER BY sort_order NULLS LAST, created_at ASC
  `;
}

async function loadAllCards(sql, me) {
  return sql`
    SELECT
      c.id, c.set_id, c.front, c.back, c.example, c.word_form, c.word_type, c.image_url, c.audio_url, c.created_at,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.learning_step, c.learning_step)
           ELSE COALESCE(cp.learning_step, 0) END AS learning_step,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.next_review, c.next_review)
           ELSE COALESCE(cp.next_review, NOW()) END AS next_review,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.last_reviewed, c.last_reviewed)
           ELSE cp.last_reviewed END AS last_reviewed,
      CASE WHEN s.user_id = ${me}::uuid THEN COALESCE(cp.status, c.status)
           ELSE COALESCE(cp.status, 'new') END AS status
    FROM cards c
    INNER JOIN card_sets s ON c.set_id = s.id
    LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = ${me}::uuid
    WHERE s.user_id = ${me}::uuid
       OR s.course_id IN (
         SELECT course_id FROM course_members WHERE user_id = ${me}::uuid AND role = 'student'
       )
    ORDER BY c.created_at ASC, c.sort_order NULLS LAST
  `;
}

async function updateCard(sql, me, p) {
  const cardId = uuid(p.cardId, 'cardId');
  const d = p.data || {};
  const rows = await sql`
    UPDATE cards c
    SET front = COALESCE(${optString(d.frontText, 2000)}, c.front),
        back = COALESCE(${optString(d.backText, 2000)}, c.back),
        example = COALESCE(${optString(d.example, 4000)}, c.example),
        word_form = COALESCE(${optString(d.wordForm, 100)}, c.word_form),
        word_type = COALESCE(${optString(d.wordType, 20)}, c.word_type),
        image_url = COALESCE(${optString(d.frontImage, 2000)}, c.image_url),
        audio_url = COALESCE(${optString(d.frontAudio, 2000)}, c.audio_url)
    FROM card_sets s
    WHERE c.id = ${cardId}::uuid AND s.id = c.set_id AND s.user_id = ${me}::uuid
    RETURNING c.id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not your card');
  return true;
}

async function createSet(sql, me, p) {
  const id = uuid(p.id, 'id');
  const courseId = p.courseId ? uuid(p.courseId, 'courseId') : null;
  if (courseId) await assertOwnCourse(sql, me, courseId);
  const now = new Date().toISOString();
  await sql`
    INSERT INTO card_sets (
      id, user_id, course_id, title, description, category, language_from, language_to,
      is_public, created_at, updated_at, total_cards, mastered_cards, studying_cards
    ) VALUES (
      ${id}::uuid, ${me}::uuid, ${courseId}, ${optString(p.title, 255) || 'Без названия'},
      ${optString(p.description, 2000)}, ${optString(p.category, 100) || 'custom'},
      ${optString(p.languageFrom, 10)}, ${optString(p.languageTo, 10)}, ${p.isPublic === true},
      ${isoOrNull(p.createdAt) || now}, ${isoOrNull(p.updatedAt) || now}, 0, 0, 0
    )
    ON CONFLICT (id) DO NOTHING
  `;
  return true;
}

/** Вставка карточек одним запросом; все карточки должны быть в своих наборах. */
async function insertCards(sql, me, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return true;
  if (cards.length > 2000) throw new HttpError(400, 'Too many cards');
  const rows = cards.map((c) => ({
    id: uuid(c.id, 'card.id'),
    set_id: uuid(c.setId, 'card.setId'),
    front: optString(c.frontText, 2000) ?? '',
    back: optString(c.backText, 2000) ?? '',
    example: optString(c.example, 4000),
    word_type: optString(c.wordType, 20),
    image_url: optString(c.frontImage, 2000),
    audio_url: optString(c.frontAudio, 2000),
    created_at: isoOrNull(c.createdAt) || new Date().toISOString(),
    next_review: isoOrNull(c.nextReviewDate) || new Date().toISOString(),
    last_reviewed: isoOrNull(c.lastReviewDate),
    status: optString(c.status, 20) || 'new',
  }));
  const setIds = [...new Set(rows.map((r) => r.set_id))];
  const own = await sql`SELECT id FROM card_sets WHERE id = ANY(${setIds}::uuid[]) AND user_id = ${me}::uuid`;
  if (own.length !== setIds.length) throw new HttpError(403, 'Not your set');

  const inserted = await sql`
    INSERT INTO cards (id, set_id, front, back, example, word_type, image_url, audio_url,
                       created_at, next_review, last_reviewed, status)
    SELECT id, set_id, front, back, example, word_type, image_url, audio_url,
           created_at, next_review, last_reviewed, status
    FROM json_to_recordset(${JSON.stringify(rows)}::json) AS r(
      id uuid, set_id uuid, front text, back text, example text, word_type varchar, image_url text,
      audio_url text, created_at timestamptz, next_review timestamptz, last_reviewed timestamptz, status varchar
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING set_id
  `;
  // total_cards увеличиваем только на реально вставленные (повтор из очереди не задваивает)
  const countsBySet = {};
  for (const r of inserted) countsBySet[r.set_id] = (countsBySet[r.set_id] || 0) + 1;
  for (const [setId, count] of Object.entries(countsBySet)) {
    await sql`UPDATE card_sets SET total_cards = total_cards + ${count} WHERE id = ${setId}::uuid`;
  }
  return true;
}

async function createCard(sql, me, p) {
  return insertCards(sql, me, [p.card]);
}

async function createCardsBatch(sql, me, p) {
  return insertCards(sql, me, p.cards);
}

async function deleteSet(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  await assertOwnSet(sql, me, setId);
  await sql`DELETE FROM cards WHERE set_id = ${setId}::uuid`;
  await sql`DELETE FROM card_sets WHERE id = ${setId}::uuid`;
  return true;
}

async function deleteCard(sql, me, p) {
  const cardId = uuid(p.cardId, 'cardId');
  const rows = await sql`
    DELETE FROM cards c USING card_sets s
    WHERE c.id = ${cardId}::uuid AND s.id = c.set_id AND s.user_id = ${me}::uuid
    RETURNING c.id
  `;
  // Уже удалённая карточка (повтор из очереди) — не ошибка
  if (rows.length === 0) {
    const exists = await sql`SELECT 1 FROM cards WHERE id = ${cardId}::uuid`;
    if (exists.length > 0) throw new HttpError(403, 'Not your card');
  }
  return true;
}

async function updateSetMeta(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  const f = p.fields || {};
  const rows = await sql`
    UPDATE card_sets
    SET title = COALESCE(${optString(f.title, 255)}, title),
        description = COALESCE(${optString(f.description, 2000)}, description),
        category = COALESCE(${optString(f.category, 100)}, category),
        language_from = COALESCE(${optString(f.languageFrom, 10)}, language_from),
        language_to = COALESCE(${optString(f.languageTo, 10)}, language_to),
        updated_at = NOW()
    WHERE id = ${setId}::uuid AND user_id = ${me}::uuid
    RETURNING id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not your set');
  return true;
}

async function updateSetCourse(sql, me, p) {
  const setId = uuid(p.setId, 'setId');
  const courseId = p.courseId ? uuid(p.courseId, 'courseId') : null;
  if (courseId) await assertOwnCourse(sql, me, courseId);
  const rows = await sql`
    UPDATE card_sets SET course_id = ${courseId}, updated_at = NOW()
    WHERE id = ${setId}::uuid AND user_id = ${me}::uuid
    RETURNING id
  `;
  if (rows.length === 0) throw new HttpError(403, 'Not your set');
  return true;
}

// ─── Курсы ──────────────────────────────────────────────────────────────────

async function loadCourses(sql, me) {
  return sql`
    SELECT id, title, created_at, updated_at FROM courses
    WHERE user_id = ${me}::uuid
    ORDER BY created_at ASC
  `;
}

async function createCourse(sql, me, p) {
  const id = uuid(p.id, 'id');
  const title = optString(p.title, 255);
  if (!title) throw new HttpError(400, 'title required');
  const createdAt = isoOrNull(p.createdAt) || new Date().toISOString();
  await sql`
    INSERT INTO courses (id, user_id, title, created_at, updated_at)
    VALUES (${id}::uuid, ${me}::uuid, ${title}, ${createdAt}, ${createdAt})
    ON CONFLICT (id) DO NOTHING
  `;
  return true;
}

async function loadStudentCourses(sql, me) {
  return sql`
    SELECT c.id, c.title, c.user_id AS owner_id, cm.joined_at,
           COALESCE(u.display_name, u.user_name, u.email) AS teacher_name
    FROM course_members cm
    JOIN courses c ON c.id = cm.course_id
    JOIN users u ON u.id = c.user_id
    WHERE cm.user_id = ${me}::uuid AND cm.role = 'student'
    ORDER BY cm.joined_at DESC
  `;
}

// ─── Серия и активность ─────────────────────────────────────────────────────

async function upsertDailyActivity(sql, me, p) {
  const day = localDay(p.localDate);
  const d = deltas(p.deltas);
  await sql`
    INSERT INTO daily_activity (user_id, local_date, words_learned, minutes_learned, cards_studied)
    VALUES (${me}::uuid, ${day}::date, ${d.wordsDelta}, ${d.minutesDelta}, ${d.cardsDelta})
    ON CONFLICT (user_id, local_date) DO UPDATE SET
      words_learned = daily_activity.words_learned + ${d.wordsDelta},
      minutes_learned = daily_activity.minutes_learned + ${d.minutesDelta},
      cards_studied = daily_activity.cards_studied + ${d.cardsDelta},
      updated_at = NOW()
  `;
  return true;
}

/** Пуш пользователю через api/push.js?action=notify (NOTIFY_SECRET есть только на сервере). */
async function sendPush(userId, type, data = {}) {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://ai-app-seven-zeta.vercel.app';
  try {
    await fetch(`${base}/api/push?action=notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NOTIFY_SECRET}` },
      body: JSON.stringify({ userId, type, data }),
    });
  } catch (e) {
    console.error(`[data] push ${type} failed:`, e);
  }
}

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365];
/** Повторение дня выполнено, если повторено столько слов, которым пришло время (или всё, что ждало) */
const DAILY_REVIEW_TARGET = 10;
const DEFAULT_TIMEZONE = 'Asia/Bishkek';
const STREAK_FREEZE_PRICE = 50;
const MAX_STREAK_FREEZES = 2;

/**
 * Засчитывается ли сегодняшний день в серию (план §3.5) — по журналу ответов, а не по словам клиента:
 * повторено ≥ 10 слов, которым пришло время; или повторено всё, что ждало (хотя бы одно);
 * или ждать было нечего и дано ≥ 10 ответов.
 */
async function dayCountsForStreak(sql, me, today, tz) {
  const rows = await sql`
    SELECT
      (SELECT COUNT(*) FROM answers
        WHERE user_id = ${me}::uuid AND rejected_reason IS NULL
          AND (answered_at AT TIME ZONE ${tz})::date = ${today}::date)::int AS active,
      (SELECT COUNT(*) FROM answers
        WHERE user_id = ${me}::uuid AND rejected_reason IS NULL AND was_due AND step_before >= 1
          AND (answered_at AT TIME ZONE ${tz})::date = ${today}::date)::int AS reviewed,
      (SELECT COUNT(*) FROM card_progress
        WHERE user_id = ${me}::uuid AND learning_step >= 1 AND next_review <= NOW())::int AS waiting
  `;
  const { active, reviewed, waiting } = rows[0];
  return {
    counted: reviewed >= DAILY_REVIEW_TARGET || (waiting === 0 && (reviewed >= 1 || active >= DAILY_REVIEW_TARGET)),
    active, reviewed, waiting,
  };
}

async function updateUserStatsStreak(sql, me, p) {
  const today = localDay(p.localDate);
  const yesterday = localDay(p.yesterdayDate);
  const d = deltas(p.deltas);
  const existing = await sql`
    SELECT current_streak, longest_streak, last_active_date::text AS last_active_date, timezone
    FROM user_stats WHERE user_id = ${me}::uuid
  `;
  const tz = existing[0]?.timezone || DEFAULT_TIMEZONE;
  const day = await dayCountsForStreak(sql, me, today, tz);
  const prevStreak = existing[0]?.current_streak || 0;
  const lastActive = existing[0]?.last_active_date ?? null;
  if (!day.counted) {
    return { counted: false, currentStreak: prevStreak, longestStreak: existing[0]?.longest_streak || 0, ...day };
  }

  let currentStreak = prevStreak;
  let longestStreak = existing[0]?.longest_streak || 0;
  if (lastActive === today) {
    // уже засчитан сегодня — серия не меняется
  } else if (lastActive === yesterday) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
    if (existing.length > 0 && prevStreak > 1) await sendPush(me, 'streak_lost', { prevStreak });
  }
  if (currentStreak > longestStreak) longestStreak = currentStreak;

  await sql`
    INSERT INTO user_stats (user_id, current_streak, longest_streak, last_active_date,
                            total_words_learned, total_minutes_learned, total_cards_studied)
    VALUES (${me}::uuid, ${currentStreak}, ${longestStreak}, ${today}::date,
            ${d.wordsDelta}, ${d.minutesDelta}, ${d.cardsDelta})
    ON CONFLICT (user_id) DO UPDATE SET
      current_streak = ${currentStreak},
      longest_streak = ${longestStreak},
      last_active_date = ${today}::date,
      total_words_learned = user_stats.total_words_learned + ${d.wordsDelta},
      total_minutes_learned = user_stats.total_minutes_learned + ${d.minutesDelta},
      total_cards_studied = user_stats.total_cards_studied + ${d.cardsDelta},
      updated_at = NOW()
  `;
  const increased = lastActive !== today;
  // Раньше этот пуш слал клиент с секретом, которого в сборке не было, — он не работал
  if (increased && STREAK_MILESTONES.includes(currentStreak)) {
    await sendPush(me, 'streak_milestone', { days: currentStreak });
  }
  return { counted: true, increased, currentStreak, longestStreak, ...day };
}

/** Купить заморозку серии за алмазы (не больше двух в запасе). */
async function buyStreakFreeze(sql, me) {
  const rows = await sql`
    UPDATE users SET diamond = COALESCE(diamond, 0) - ${STREAK_FREEZE_PRICE},
                     streak_freezes = streak_freezes + 1
    WHERE id = ${me}::uuid AND COALESCE(diamond, 0) >= ${STREAK_FREEZE_PRICE} AND streak_freezes < ${MAX_STREAK_FREEZES}
    RETURNING diamond, streak_freezes
  `;
  if (rows.length === 0) {
    const [u] = await sql`SELECT COALESCE(diamond, 0) AS diamond, streak_freezes FROM users WHERE id = ${me}::uuid`;
    throw new HttpError(409, u && u.streak_freezes >= MAX_STREAK_FREEZES ? 'max_freezes' : 'not_enough_diamonds');
  }
  return { diamonds: rows[0].diamond, streakFreezes: rows[0].streak_freezes, price: STREAK_FREEZE_PRICE };
}

async function logStreakEvent(sql, me, p) {
  const day = Math.max(0, Math.min(100000, Math.trunc(Number(p.streakDay) || 0)));
  await sql`INSERT INTO streak_events (user_id, streak_day) VALUES (${me}::uuid, ${day})`;
  return true;
}

async function getWeekActivity(sql, me, p) {
  const days = Math.max(1, Math.min(366, Math.trunc(Number(p.days) || 7)));
  return sql`
    SELECT local_date::text AS local_date, words_learned, minutes_learned, cards_studied
    FROM daily_activity
    WHERE user_id = ${me}::uuid AND local_date >= CURRENT_DATE - ${days}::int
    ORDER BY local_date DESC
  `;
}

/**
 * Статистика + сброс серии, если пропущено больше дня (по часовому поясу пользователя).
 * Пропущен ровно один день и есть заморозка — она тратится, серия сохраняется.
 */
async function getUserStats(sql, me) {
  const rows = await sql`
    SELECT us.current_streak, us.longest_streak, us.last_active_date::text AS last_active_date, us.timezone,
           us.total_words_learned, us.total_minutes_learned, us.total_cards_studied,
           u.streak_freezes
    FROM user_stats us JOIN users u ON u.id = us.user_id
    WHERE us.user_id = ${me}::uuid
  `;
  const row = rows[0];
  if (!row) return null;
  row.freeze_used = false;
  if (row.last_active_date && row.current_streak > 0) {
    let todayKey;
    try {
      todayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: row.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
    } catch {
      todayKey = new Date().toISOString().slice(0, 10);
    }
    const diffDays = Math.round(
      (Date.parse(`${todayKey}T12:00:00Z`) - Date.parse(`${row.last_active_date}T12:00:00Z`)) / 86_400_000,
    );
    if (diffDays === 2 && row.streak_freezes > 0) {
      // Вчера пропущен: заморозка «засчитывает» вчерашний день, серия не прерывается
      const yesterday = new Date(Date.parse(`${todayKey}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const used = await sql`
        WITH f AS (
          UPDATE users SET streak_freezes = streak_freezes - 1
          WHERE id = ${me}::uuid AND streak_freezes > 0 RETURNING streak_freezes
        )
        UPDATE user_stats SET last_active_date = ${yesterday}::date, updated_at = NOW()
        WHERE user_id = ${me}::uuid AND EXISTS (SELECT 1 FROM f)
        RETURNING (SELECT streak_freezes FROM f) AS left
      `;
      if (used.length > 0) {
        row.last_active_date = yesterday;
        row.streak_freezes = used[0].left;
        row.freeze_used = true;
      }
    } else if (diffDays > 1) {
      row.current_streak = 0;
      await sql`UPDATE user_stats SET current_streak = 0, updated_at = NOW() WHERE user_id = ${me}::uuid`;
    }
  }
  return row;
}

async function getDailyActivity(sql, me, p) {
  const day = localDay(p.localDate);
  const rows = await sql`
    SELECT local_date::text AS local_date, words_learned, minutes_learned, cards_studied
    FROM daily_activity WHERE user_id = ${me}::uuid AND local_date = ${day}::date
  `;
  return rows[0] ?? null;
}

// ─── Запуск приложения одним запросом ───────────────────────────────────────

/**
 * Всё, что приложение грузит при старте, — одним ответом (вместо 8–10 отдельных запросов, каждый
 * со своей проверкой входа): свои наборы, все карточки с прогрессом, свои курсы, курсы ученика
 * и их наборы, статистика серии.
 */
async function bootstrap(sql, me) {
  const [sets, cards, courses, studentCourses, stats] = await Promise.all([
    loadSets(sql, me),
    loadAllCards(sql, me),
    loadCourses(sql, me),
    loadStudentCourses(sql, me),
    getUserStats(sql, me),
  ]);
  const courseSets = {};
  await Promise.all(studentCourses.map(async (course) => {
    courseSets[course.id] = await courseSetsForStudent(sql, course.id);
  }));
  return { sets, cards, courses, studentCourses, courseSets, stats, serverTime: Date.now() };
}

// ─── Роутер ─────────────────────────────────────────────────────────────────

const ACTIONS = {
  ensureUserExists, getProfile, updateDisplayName, updateUserName, updateLanguagePreferences, saveOnboardingData,
  loadSets, loadCardsBySet, loadAllCards, updateCard, createSet, createCard, createCardsBatch,
  deleteSet, deleteCard, updateSetMeta, updateSetCourse,
  loadCourses, createCourse, loadStudentCourses,
  upsertDailyActivity, updateUserStatsStreak, buyStreakFreeze, logStreakEvent, getWeekActivity, getUserStats,
  bootstrap,
  getDailyActivity,
};

export default async function handler(req, res) {
  const { action } = req.query;
  if (!Object.hasOwn(ACTIONS, action || '')) return res.status(400).json({ error: 'Unknown action' });
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  const params = req.method === 'GET' ? { ...req.query } : { ...(req.body || {}) };
  try {
    const data = await ACTIONS[action](sql, user.id, params, user);
    return res.status(200).json({ data });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error(`[data] ${action} failed:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Для проверки без HTTP (скрипты/тесты): вызвать действие напрямую
export const __actions = ACTIONS;
