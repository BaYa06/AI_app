/**
 * api/data.js — профиль, языки, онбординг, «о себе», стартовая загрузка (Clean 10 — перенесено без изменений).
 */
import { HttpError } from '../../_access.js';
import { courseSetsForStudent } from '../../_course.js';
import { optString } from './_shared.js';
import { loadSets, loadAllCards } from './sets.js';
import { getUserStats } from './streak.js';
import { loadCourses, loadStudentCourses } from './courses.js';

export async function ensureUserExists(sql, me, p, user) {
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

export async function getProfile(sql, me) {
  const rows = await sql`
    SELECT teacher, user_name, display_name, native_language, target_languages, onboarding_completed
    FROM users WHERE id = ${me}::uuid
  `;
  return rows[0] ?? null;
}

export async function updateDisplayName(sql, me, p) {
  const displayName = optString(p.displayName, 255);
  if (!displayName) throw new HttpError(400, 'displayName required');
  await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${me}::uuid`;
  return true;
}

export async function updateUserName(sql, me, p) {
  const raw = optString(p.userName, 100);
  if (!raw) throw new HttpError(400, 'userName required');
  const normalized = raw.startsWith('@') ? raw.toLowerCase() : '@' + raw.toLowerCase();
  await sql`UPDATE users SET user_name = ${normalized} WHERE id = ${me}::uuid`;
  return true;
}

export function optStringArray(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
    throw new HttpError(400, 'string[] expected');
  return value.slice(0, 20).map((v) => v.slice(0, 20));
}

export async function updateLanguagePreferences(sql, me, p) {
  await sql`
    UPDATE users SET
      native_language = COALESCE(${optString(p.nativeLanguage, 20)}, native_language),
      target_languages = COALESCE(${optStringArray(p.targetLanguages)}, target_languages)
    WHERE id = ${me}::uuid
  `;
  return true;
}

// ─── «О себе» для напоминаний (plan/new/push_notifications.md, 2.7) ─────────────

export const AGE_RANGES = ['under13', '13-17', '18-24', '25-34', '35+'];

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Возраст: диапазон из списка или null (пропустил / стёр) */
export function optAgeRange(value) {
  return AGE_RANGES.includes(value) ? value : null;
}

/** Дни занятий в центре: только дни недели, в порядке недели; пусто — null */
export function optClassDays(value) {
  if (!Array.isArray(value)) return null;
  const days = WEEK_DAYS.filter((d) => value.includes(d));
  return days.length ? days : null;
}

export function optClassHour(value) {
  const h = Number(value);
  return Number.isInteger(h) && h >= 6 && h <= 22 ? h : null;
}

/** «Профиль → Мои данные»: ответы о себе и что приложение знает о привычках (только чтение) */
export async function getAboutMe(sql, me) {
  const [row] = await sql`
    SELECT u.age_range, u.class_days, u.class_hour, u.learning_goal,
           COALESCE(us.notif_use_habits, true) AS use_habits,
           h.usual_time::text AS usual_time, h.usual_days, h.segment
    FROM users u
    LEFT JOIN user_stats us ON us.user_id = u.id
    LEFT JOIN user_habits h ON h.user_id = u.id
    WHERE u.id = ${me}::uuid
  `;
  if (!row) return null;
  return {
    ageRange: row.age_range,
    classDays: row.class_days || [],
    classHour: row.class_hour,
    learningGoal: row.learning_goal,
    useHabits: row.use_habits,
    habits: {
      usualTime: row.usual_time ? row.usual_time.slice(0, 5) : null,
      usualDays: row.usual_days || [],
    },
  };
}

/**
 * Сохранить ответы о себе. Поле, которого нет в запросе, не трогаем; null — стереть.
 * clearHabits — «Стереть, что знаешь о моих привычках»: профиль удаляется и больше не используется.
 */
export async function saveAboutMe(sql, me, p) {
  if ('ageRange' in p)
    await sql`UPDATE users SET age_range = ${optAgeRange(p.ageRange)} WHERE id = ${me}::uuid`;
  if ('classDays' in p || 'classHour' in p) {
    const days = optClassDays(p.classDays);
    const hour = days ? optClassHour(p.classHour) : null;
    await sql`UPDATE users SET class_days = ${days}, class_hour = ${hour} WHERE id = ${me}::uuid`;
  }
  if (typeof p.useHabits === 'boolean' || p.clearHabits === true) {
    const use = p.clearHabits === true ? false : p.useHabits;
    // Включил подстройку — время из настроек больше не «выбрано самим», напоминания идут по привычкам
    await sql`
      INSERT INTO user_stats (user_id, notif_use_habits) VALUES (${me}::uuid, ${use})
      ON CONFLICT (user_id) DO UPDATE SET
        notif_use_habits = ${use},
        notif_time_custom = CASE WHEN ${use} THEN false ELSE user_stats.notif_time_custom END,
        updated_at = NOW()
    `;
    if (!use) await sql`DELETE FROM user_habits WHERE user_id = ${me}::uuid`;
  }
  return true;
}

export async function saveOnboardingData(sql, me, p) {
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
      age_range = COALESCE(${optAgeRange(p.ageRange)}, age_range),
      class_days = COALESCE(${optClassDays(p.classDays)}, class_days),
      class_hour = COALESCE(${optClassDays(p.classDays) ? optClassHour(p.classHour) : null}, class_hour),
      onboarding_completed = true
    WHERE id = ${me}::uuid
  `;
  return true;
}

// ─── Наборы и карточки ──────────────────────────────────────────────────────

/**
 * Всё, что приложение грузит при старте, — одним ответом (вместо 8–10 отдельных запросов, каждый
 * со своей проверкой входа): свои наборы, все карточки с прогрессом, свои курсы, курсы ученика
 * и их наборы, статистика серии.
 */
export async function bootstrap(sql, me) {
  const [sets, cards, courses, studentCourses, stats] = await Promise.all([
    loadSets(sql, me),
    loadAllCards(sql, me),
    loadCourses(sql, me),
    loadStudentCourses(sql, me),
    getUserStats(sql, me),
  ]);
  const courseSets = {};
  await Promise.all(
    studentCourses.map(async (course) => {
      courseSets[course.id] = await courseSetsForStudent(sql, course.id);
    })
  );
  return { sets, cards, courses, studentCourses, courseSets, stats, serverTime: Date.now() };
}

// ─── Роутер ─────────────────────────────────────────────────────────────────

// ==================== ОБРАТНАЯ СВЯЗЬ ====================
