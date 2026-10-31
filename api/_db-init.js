import { neon } from '@neondatabase/serverless';

/**
 * Версия схемы: при добавлении миграции в applyMigrations увеличить (и дописать файл в
 * database/migrations). Пока в app_migrations есть отметка этой версии, миграции не выполняются.
 */
const SCHEMA_VERSION = 'schema_037';

// Один прогон на экземпляр функции (параллельные запросы ждут один и тот же промис)
let initPromise = null;

/**
 * Проверка и автоматическая инициализация БД.
 * Раньше миграции (~76 запросов, в т.ч. ALTER TABLE, блокирующие таблицы целиком) выполнялись на
 * КАЖДОМ запросе: запуск приложения шёл десятки секунд, параллельные запросы ждали друг друга на
 * блокировках, и приложение висело на экране загрузки. Теперь — один быстрый SELECT, и тот раз
 * на экземпляр функции.
 */
async function ensureDatabaseInitialized(sql) {
  if (!initPromise) {
    initPromise = runDatabaseInit(sql).catch((error) => {
      initPromise = null; // следующий запрос попробует снова
      console.error('Database init failed:', error);
    });
  }
  return initPromise;
}

async function runDatabaseInit(sql) {
  try {
    const done = await sql`SELECT 1 FROM app_migrations WHERE name = ${SCHEMA_VERSION}`;
    if (done.length > 0) return;
  } catch {
    // app_migrations ещё нет — старая БД, выполняем миграции ниже
  }

  try {
    // Проверяем, существует ли таблица users
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `;
    
    const exists = result[0]?.exists;
    
    if (!exists) {
      console.log('Database not initialized. Creating tables...');
      await initDatabase(sql);
      console.log('Database initialized successfully!');
    }

    // Миграции для существующих БД
    await applyMigrations(sql);
    await sql`INSERT INTO app_migrations (name) VALUES (${SCHEMA_VERSION}) ON CONFLICT (name) DO NOTHING`;
  } catch (error) {
    console.error('Error checking database:', error);
    // Если произошла ошибка, пытаемся инициализировать
    await initDatabase(sql);
  }
}

/**
 * Миграции, которые применяются к уже существующей БД
 */
async function applyMigrations(sql) {
  try {
    await sql`
      ALTER TABLE card_sets
      ADD COLUMN IF NOT EXISTS is_hidden_from_students BOOLEAN NOT NULL DEFAULT false
    `;
  } catch (e) {
    console.error('Migration is_hidden_from_students failed:', e);
  }

  // Migration: word_type for context fill mode distractors
  try {
    await sql`
      ALTER TABLE cards
      ADD COLUMN IF NOT EXISTS word_type VARCHAR(20)
    `;
  } catch (e) {
    console.error('Migration word_type failed:', e);
  }

  // Migration: push_tokens table
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS push_tokens (
        token       TEXT PRIMARY KEY,
        user_id     UUID,
        platform    VARCHAR(20) DEFAULT 'web',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `;
  } catch (e) {
    console.error('Migration push_tokens failed:', e);
  }

  // word_form для карточек (раньше клиент делал ALTER TABLE сам при каждой загрузке карточек)
  try {
    await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS word_form VARCHAR(100)`;
  } catch (e) {
    console.error('Migration word_form failed:', e);
  }

  // Таблицы библиотеки (раньше их создавал клиент — src/services/LibraryService.ts)
  try {
    await sql`CREATE TABLE IF NOT EXISTS library_sets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      original_set_id UUID,
      title VARCHAR(100) NOT NULL,
      description TEXT,
      category VARCHAR(50),
      tags TEXT[],
      language_from VARCHAR(10),
      language_to VARCHAR(10),
      cards_count INTEGER DEFAULT 0,
      imports_count INTEGER DEFAULT 0,
      likes_count INTEGER DEFAULT 0,
      rating_sum INTEGER DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'published',
      is_featured BOOLEAN DEFAULT false,
      cover_emoji VARCHAR(10),
      published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS library_cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      hint TEXT,
      order_index INTEGER DEFAULT 0
    )`;
    await sql`CREATE TABLE IF NOT EXISTS library_imports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
      imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, library_set_id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS library_likes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, library_set_id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS library_ratings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, library_set_id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS library_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      library_set_id UUID NOT NULL REFERENCES library_sets(id) ON DELETE CASCADE,
      reason VARCHAR(100),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_library_sets_status ON library_sets(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_library_sets_category ON library_sets(category)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_library_sets_user_id ON library_sets(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_library_cards_set ON library_cards(library_set_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_library_imports_user ON library_imports(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_library_likes_user ON library_likes(user_id)`;
  } catch (e) {
    console.error('Migration library tables failed:', e);
  }

  // Migration 020: серверный SRS — журнал ответов, поля первого выучивания, одноразовое понижение уровней
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS answers (
        id              UUID PRIMARY KEY,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        mode            VARCHAR(20) NOT NULL,
        correct         BOOLEAN NOT NULL,
        self_rating     SMALLINT,
        was_due         BOOLEAN NOT NULL,
        step_before     SMALLINT NOT NULL,
        step_after      SMALLINT NOT NULL,
        answered_at     TIMESTAMPTZ NOT NULL,
        received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        time_spent_ms   INTEGER,
        rejected_reason VARCHAR(40)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_answers_user_answered ON answers(user_id, answered_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_answers_user_received ON answers(user_id, received_at DESC)`;
    await sql`ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS first_learned_at TIMESTAMPTZ`;
    await sql`ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS first_mature_at TIMESTAMPTZ`;
    await sql`ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS last_answer_id UUID`;

    // Одноразовые миграции данных: строка в app_migrations = уже применено
    await sql`
      CREATE TABLE IF NOT EXISTS app_migrations (
        name       VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    // Уровни, набранные по старым правилам (шаг рос без учёта интервалов), могли быть накручены:
    // всё выше «знаю» (шаг ≥ 5) → шаг 3 и сразу к повторению. Решение от 2026-09-27, план §1.6.
    const claimed = await sql`
      INSERT INTO app_migrations (name) VALUES ('020_downgrade_legacy_levels')
      ON CONFLICT (name) DO NOTHING
      RETURNING name
    `;
    if (claimed.length > 0) {
      await sql`
        UPDATE card_progress
        SET learning_step = 3, status = 'young', next_review = NOW(), updated_at = NOW()
        WHERE learning_step >= 5
      `;
      await sql`
        UPDATE cards c SET learning_step = 3, status = 'young', next_review = NOW()
        FROM card_sets s
        WHERE s.id = c.set_id AND NOT s.is_official AND c.learning_step >= 5
      `;
    }
  } catch (e) {
    console.error('Migration 020_server_srs failed:', e);
  }

  // Migration 021: очки и рейтинг курса (план, этап 2)
  try {
    // Срок следующего повторения назначил правильный ответ (а не ошибка) — только тогда повторение
    // вовремя даёт очки; иначе цикл «ошибся → ответил» давал бы очки бесконечно
    await sql`ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS review_scheduled BOOLEAN NOT NULL DEFAULT false`;
    await sql`
      CREATE TABLE IF NOT EXISTS score_events (
        id         BIGSERIAL PRIMARY KEY,
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        card_id    UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        answer_id  UUID NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
        kind       VARCHAR(20) NOT NULL,
        points     SMALLINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        UNIQUE (answer_id, kind)
      )
    `;
    // «Новое слово», «выучено», «выучено надолго» — один раз за карточку навсегда
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_score_events_once
      ON score_events (user_id, card_id, kind) WHERE kind IN ('new', 'learned', 'mature')
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_score_events_user_created ON score_events(user_id, created_at)`;
    await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS timezone TEXT`;
    await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS rating_enabled BOOLEAN NOT NULL DEFAULT true`;
    await sql`ALTER TABLE course_members ADD COLUMN IF NOT EXISTS hide_from_rating BOOLEAN NOT NULL DEFAULT false`;
    await sql`
      CREATE TABLE IF NOT EXISTS weekly_closures (
        course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        week_start DATE NOT NULL,
        closed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (course_id, week_start)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS weekly_results (
        course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        week_start DATE NOT NULL,
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        place      SMALLINT NOT NULL,
        points     INTEGER NOT NULL,
        reward     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (course_id, week_start, user_id)
      )
    `;
  } catch (e) {
    console.error('Migration 021_course_rating failed:', e);
  }

  // Migration 022: триггеры повторения (план, этап 3)
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freezes INTEGER NOT NULL DEFAULT 0`;
    // Не больше одного напоминания в день
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_reminder_date DATE`;
    // «Напомнить повторить» от учителя — не чаще раза в сутки на курс
    await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS last_review_reminder_at TIMESTAMPTZ`;
    // Статистика учителя читала reviews, а ответы с этапа 1 пишутся в answers — объединяем оба журнала
    await sql`
      CREATE OR REPLACE VIEW review_log AS
        SELECT id, card_id, user_id, reviewed_at FROM reviews
        UNION ALL
        SELECT id, card_id, user_id, (answered_at AT TIME ZONE 'UTC') AS reviewed_at
        FROM answers WHERE rejected_reason IS NULL
    `;
  } catch (e) {
    console.error('Migration 022_review_triggers failed:', e);
  }

  // Migration 023: обратная связь — «Написать нам» и окно оценки приложения (смотрится в админке)
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS app_feedback (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
        kind         VARCHAR(10) NOT NULL CHECK (kind IN ('message', 'rating')),
        category     VARCHAR(20),
        rating       SMALLINT CHECK (rating BETWEEN 1 AND 5),
        has_problem  BOOLEAN,
        tags         TEXT[],
        message      TEXT,
        app_version  VARCHAR(20),
        platform     VARCHAR(10),
        os_version   VARCHAR(40),
        user_role    VARCHAR(10),
        status       VARCHAR(10) NOT NULL DEFAULT 'new',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_feedback_created ON app_feedback(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_feedback_user_created ON app_feedback(user_id, created_at DESC)`;
  } catch (e) {
    console.error('Migration 023_app_feedback failed:', e);
  }

  // Migration 024: книга видна ученикам — переключатель на каждую книгу (api/books.js)
  try {
    await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS student_visible BOOLEAN NOT NULL DEFAULT false`;
  } catch (e) {
    console.error('Migration 024_book_student_visible failed:', e);
  }

  // Migration 025: контроль выхода из приложения во время живого теста (plan/done/exam_lockdown.md).
  // Только добавляем колонки с DEFAULT — старые клиенты и старые INSERT'ы не ломаются.
  try {
    await sql`ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS exit_control BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS away_at TIMESTAMPTZ`;
    await sql`ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS away_count INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS left_reason VARCHAR(20)`;
    await sql`ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS client_exit_control BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE test_participants ADD COLUMN IF NOT EXISTS rejoin_allowed BOOLEAN NOT NULL DEFAULT false`;
  } catch (e) {
    console.error('Migration 025_exam_exit_control failed:', e);
  }

  // Migration 026: журнал push-уведомлений (plan/new/push_notifications.md, шаг 0.3). Только новая таблица.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS push_log (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID NOT NULL,
        type                TEXT NOT NULL,
        category            TEXT NOT NULL,
        variant             TEXT,
        local_date          DATE NOT NULL,
        status              TEXT NOT NULL,
        tokens              INT DEFAULT 0,
        delivered           INT DEFAULT 0,
        payload             JSONB,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        opened_at           TIMESTAMPTZ,
        lesson_started_at   TIMESTAMPTZ,
        lesson_completed_at TIMESTAMPTZ,
        slot                TEXT
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS push_log_user_date ON push_log (user_id, local_date)`;
    await sql`CREATE INDEX IF NOT EXISTS push_log_type_created ON push_log (type, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS push_log_created ON push_log (created_at)`;
    // Одна ежедневная рассылка в категории в день (шаг 2.2): резерв до отправки, повторный cron не продублирует
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS push_log_daily_once ON push_log (user_id, category, local_date, slot)
      WHERE slot IS NOT NULL AND status IN ('sending', 'sent')
    `;
  } catch (e) {
    console.error('Migration 026_push_log failed:', e);
  }

  // Migration 027: дни недели — фильтр только для выбранных самим (план пушей, шаг 0.6)
  try {
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_days_custom BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE user_stats ALTER COLUMN notif_days SET DEFAULT 'mon,tue,wed,thu,fri,sat,sun'`;
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_categories_off TEXT[] NOT NULL DEFAULT '{}'`;
  } catch (e) {
    console.error('Migration 027_notif_days_custom failed:', e);
  }

  // Migration 028: разрешение на уведомления на устройстве (план пушей, шаг 1.4). NULL — неизвестно.
  try {
    await sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS permission TEXT`;
  } catch (e) {
    console.error('Migration 028_push_token_permission failed:', e);
  }

  // Migration 029: профиль привычек для пушей (план пушей, шаг 2.6). Только новая таблица.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS user_habits (
        user_id           UUID PRIMARY KEY,
        usual_time        TIME,
        usual_days        TEXT[] NOT NULL DEFAULT '{}',
        day_type          TEXT,
        median_lesson_sec INT,
        sec_per_answer    NUMERIC,
        favorite_mode     TEXT,
        accuracy_14d      NUMERIC,
        active_days_7     INT NOT NULL DEFAULT 0,
        segment           TEXT,
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `;
  } catch (e) {
    console.error('Migration 029_user_habits failed:', e);
  }

  // Migration 030: ответы «о себе» и согласие подстраивать напоминания (план пушей, 2.7). Nullable/DEFAULT.
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS age_range TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS class_days TEXT[]`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS class_hour SMALLINT`;
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_use_habits BOOLEAN NOT NULL DEFAULT true`;
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_time_custom BOOLEAN NOT NULL DEFAULT false`;
    // Разово: время не по умолчанию (19:00) человек выбирал сам — привычки его не меняют (2.9)
    const claimedTime = await sql`
      INSERT INTO app_migrations (name) VALUES ('030_notif_time_custom_backfill')
      ON CONFLICT (name) DO NOTHING RETURNING name
    `;
    if (claimedTime.length > 0) {
      await sql`UPDATE user_stats SET notif_time_custom = true WHERE notif_hour <> 19 OR COALESCE(notif_minute, 0) <> 0`;
    }
  } catch (e) {
    console.error('Migration 030_about_me failed:', e);
  }

  // Migration 031: расписание занятий курса (план пушей, шаг 2.8). Nullable.
  try {
    await sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS schedule JSONB`;
  } catch (e) {
    console.error('Migration 031_course_schedule failed:', e);
  }

  // Migration 032: о каком наборе курса ученикам уже сообщили (план пушей, 3.5). Разово — все старые наборы.
  try {
    await sql`ALTER TABLE card_sets ADD COLUMN IF NOT EXISTS announced_at TIMESTAMPTZ`;
    const claimedSets = await sql`
      INSERT INTO app_migrations (name) VALUES ('032_set_announced_backfill')
      ON CONFLICT (name) DO NOTHING RETURNING name
    `;
    if (claimedSets.length > 0) {
      await sql`UPDATE card_sets SET announced_at = COALESCE(created_at, NOW()) WHERE announced_at IS NULL`;
    }
  } catch (e) {
    console.error('Migration 032_set_announced failed:', e);
  }

  // Migration 033: дашборд пушей (план пушей, 5.1) — журнал оттока и три представления.
  // Тексты представлений — в database/migrations/033_push_views.sql (там же комментарии).
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS push_channel_events (
        id         BIGSERIAL PRIMARY KEY,
        user_id    UUID NOT NULL,
        event      TEXT NOT NULL,
        detail     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS push_channel_events_created ON push_channel_events (created_at)`;
    await sql`
      CREATE OR REPLACE VIEW push_funnel_daily AS
      SELECT local_date, type, variant,
             COUNT(*) FILTER (WHERE status NOT IN ('dry_run', 'requeued')) AS eligible,
             COUNT(*) FILTER (WHERE status = 'sent') AS sent,
             COUNT(*) FILTER (WHERE delivered > 0) AS delivered,
             COUNT(opened_at) AS opened,
             COUNT(lesson_started_at) AS lesson_started,
             COUNT(lesson_completed_at) AS lesson_completed,
             ROUND(100.0 * COUNT(opened_at) / NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0), 1) AS open_pct,
             ROUND(100.0 * COUNT(lesson_completed_at) / NULLIF(COUNT(opened_at), 0), 1) AS opened_to_lesson_pct
      FROM push_log
      GROUP BY local_date, type, variant
    `;
    await sql`
      CREATE OR REPLACE VIEW push_churn_weekly AS
      WITH recipients AS (
        SELECT date_trunc('week', created_at)::date AS week, COUNT(DISTINCT user_id) AS n
        FROM push_log WHERE status = 'sent' GROUP BY 1
      ),
      ev AS (
        SELECT date_trunc('week', created_at)::date AS week, event, detail, COUNT(DISTINCT user_id) AS n
        FROM push_channel_events GROUP BY 1, 2, 3
      )
      SELECT ev.week, ev.event, ev.detail, ev.n AS users, r.n AS recipients,
             ROUND(1000.0 * ev.n / NULLIF(r.n, 0), 1) AS per_1000
      FROM ev LEFT JOIN recipients r ON r.week = ev.week
    `;
    await sql`
      CREATE OR REPLACE VIEW push_holdout_retention AS
      WITH u AS (
        SELECT u.id, date_trunc('week', u.created_at)::date AS cohort_week, u.created_at::date AS reg_day,
               CASE WHEN (('x' || right(replace(u.id::text, '-', ''), 7))::bit(28)::int % 100) < 10
                    THEN 'holdout' ELSE 'push' END AS push_group
        FROM users u
        WHERE NOT COALESCE(u.teacher, false) AND NOT COALESCE(u.is_anonymous, false)
      ),
      r AS (
        SELECT u.*,
               EXISTS (SELECT 1 FROM answers a WHERE a.user_id = u.id AND a.answered_at::date = u.reg_day + 1) AS d1,
               EXISTS (SELECT 1 FROM answers a WHERE a.user_id = u.id AND a.answered_at::date BETWEEN u.reg_day + 7 AND u.reg_day + 13) AS d7,
               EXISTS (SELECT 1 FROM answers a WHERE a.user_id = u.id AND a.answered_at::date BETWEEN u.reg_day + 30 AND u.reg_day + 36) AS d30
        FROM u
      )
      SELECT cohort_week, push_group, COUNT(*) AS users,
             ROUND(100.0 * COUNT(*) FILTER (WHERE d1) / NULLIF(COUNT(*) FILTER (WHERE reg_day <= CURRENT_DATE - 2), 0), 1) AS d1_pct,
             ROUND(100.0 * COUNT(*) FILTER (WHERE d7) / NULLIF(COUNT(*) FILTER (WHERE reg_day <= CURRENT_DATE - 14), 0), 1) AS d7_pct,
             ROUND(100.0 * COUNT(*) FILTER (WHERE d30) / NULLIF(COUNT(*) FILTER (WHERE reg_day <= CURRENT_DATE - 37), 0), 1) AS d30_pct
      FROM r
      GROUP BY cohort_week, push_group
    `;
  } catch (e) {
    console.error('Migration 033_push_views failed:', e);
  }

  // Migration 034: наборы по ссылке (plan/new/share_set.md, Share 1). Только новые таблицы.
  // Тексты и комментарии — в database/migrations/034_set_shares.sql.
  try {
    await sql`CREATE TABLE IF NOT EXISTS set_shares (
      code        VARCHAR(16) PRIMARY KEY,
      set_id      UUID NOT NULL REFERENCES card_sets(id) ON DELETE CASCADE,
      owner_id    UUID NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      disabled_at TIMESTAMPTZ,
      views       INTEGER NOT NULL DEFAULT 0,
      imports     INTEGER NOT NULL DEFAULT 0
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_set_shares_active_set ON set_shares(set_id) WHERE disabled_at IS NULL`;
    await sql`CREATE TABLE IF NOT EXISTS set_share_imports (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL,
      code        VARCHAR(16) NOT NULL REFERENCES set_shares(code) ON DELETE CASCADE,
      course_id   UUID,
      new_set_id  UUID REFERENCES card_sets(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_set_share_imports_place
      ON set_share_imports(user_id, code, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid))`;
    await sql`CREATE INDEX IF NOT EXISTS idx_set_share_imports_user_time ON set_share_imports(user_id, created_at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS set_share_reports (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code        VARCHAR(16) NOT NULL REFERENCES set_shares(code) ON DELETE CASCADE,
      reporter_id UUID NOT NULL,
      reason      VARCHAR(20) NOT NULL,
      comment     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      UNIQUE(code, reporter_id)
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_set_share_reports_open ON set_share_reports(created_at) WHERE resolved_at IS NULL`;
    await sql`CREATE TABLE IF NOT EXISTS user_blocks (
      user_id         UUID NOT NULL,
      blocked_user_id UUID NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, blocked_user_id)
    )`;
  } catch (e) {
    console.error('Migration 034_set_shares failed:', e);
  }

  // Migration 035: «Мои обращения» (plan/new/support_threads.md, Support 1) — переписка по обращению.
  // Тексты и комментарии — в database/migrations/035_feedback_replies.sql.
  try {
    await sql`CREATE TABLE IF NOT EXISTS app_feedback_replies (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_id UUID NOT NULL REFERENCES app_feedback(id) ON DELETE CASCADE,
      author      VARCHAR(5) NOT NULL CHECK (author IN ('user', 'admin')),
      admin_id    UUID,
      message     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_feedback_replies_thread ON app_feedback_replies(feedback_id, created_at)`;
    await sql`ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`;
    await sql`ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
    await sql`ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS last_admin_reply_at TIMESTAMPTZ`;
    await sql`ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS user_seen_at TIMESTAMPTZ`;
    // Старые обращения: последнее сообщение — само обращение; «Прочитано» до 035 — без даты, ставим дату создания.
    // Повторный прогон безопасен: строки с ответами и уже проставленным read_at не трогаем.
    await sql`UPDATE app_feedback f SET last_message_at = f.created_at
      WHERE f.last_message_at <> f.created_at
        AND NOT EXISTS (SELECT 1 FROM app_feedback_replies r WHERE r.feedback_id = f.id)`;
    await sql`UPDATE app_feedback SET read_at = created_at WHERE status = 'read' AND read_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_feedback_user_last ON app_feedback(user_id, last_message_at DESC)`;
  } catch (e) {
    console.error('Migration 035_feedback_replies failed:', e);
  }

  // Migration 036: версия приложения у push-токена — пуш с новым экраном не шлём старым версиям
  // (plan/new/support_threads.md, Support 3). Старые версии её не присылают — остаётся NULL.
  try {
    await sql`ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS app_version VARCHAR(20)`;
  } catch (e) {
    console.error('Migration 036_push_token_version failed:', e);
  }

  // Migration 037: «Что нового» (plan/new/whats_new.md, News 5) — новости окна после обновления.
  // Поля — как WhatsNewItem в src/types/whatsNew.ts; database/migrations/037_whats_new.sql.
  try {
    await sql`CREATE TABLE IF NOT EXISTS whats_new (
      id           VARCHAR(64) PRIMARY KEY,
      min_version  VARCHAR(20) NOT NULL,
      roles        TEXT[] NOT NULL DEFAULT ARRAY['student', 'teacher'],
      platforms    TEXT[] NOT NULL DEFAULT ARRAY['ios', 'android', 'web'],
      min_os       VARCHAR(10),
      priority     INTEGER NOT NULL DEFAULT 0,
      tag          VARCHAR(40) NOT NULL DEFAULT '',
      title        VARCHAR(60) NOT NULL,
      text         VARCHAR(200) NOT NULL DEFAULT '',
      art          VARCHAR(20),
      action_label VARCHAR(40),
      action_route VARCHAR(40),
      published_at DATE NOT NULL DEFAULT CURRENT_DATE,
      expires_at   DATE,
      published    BOOLEAN NOT NULL DEFAULT false,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  } catch (e) {
    console.error('Migration 037_whats_new failed:', e);
  }

  // Migration 019: daily challenge rewards (один claim на челлендж в день)
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS diamond INTEGER DEFAULT 0`;
    await sql`
      CREATE TABLE IF NOT EXISTS daily_rewards (
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        challenge  VARCHAR(32) NOT NULL,
        day        DATE NOT NULL,
        amount     INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, challenge, day)
      )
    `;
  } catch (e) {
    console.error('Migration 019_daily_rewards failed:', e);
  }

  // Migration: notif columns for user_stats
  try {
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_enabled BOOLEAN DEFAULT true`;
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_hour INTEGER DEFAULT 19`;
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_minute INTEGER DEFAULT 0`;
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_days TEXT DEFAULT 'mon,tue,wed,thu,fri'`;
    await sql`ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS notif_streak BOOLEAN DEFAULT true`;
  } catch (e) {
    console.error('Migration notif columns failed:', e);
  }

  // Migration 012: Streak events log
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS streak_events (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        streak_day INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_streak_events_user ON streak_events(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_streak_events_created ON streak_events(created_at DESC)`;
  } catch (e) {
    console.error('Migration 012_streak_events failed:', e);
  }

  // Migration 011: Live test system
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS test_sessions (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code              VARCHAR(4) NOT NULL,
        teacher_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        set_id            UUID NOT NULL REFERENCES card_sets(id) ON DELETE CASCADE,
        course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        test_mode         VARCHAR(20) NOT NULL DEFAULT 'multiple',
        question_count    INTEGER NOT NULL,
        time_per_question INTEGER NOT NULL DEFAULT 0,
        status            VARCHAR(20) NOT NULL DEFAULT 'waiting',
        started_at        TIMESTAMPTZ,
        finished_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS test_participants (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id      UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        display_name    VARCHAR(255),
        question_order  JSONB,
        answer_count    INTEGER DEFAULT 0,
        correct_count   INTEGER DEFAULT 0,
        score           INTEGER DEFAULT 0,
        joined_at       TIMESTAMPTZ DEFAULT NOW(),
        finished_at     TIMESTAMPTZ,
        UNIQUE(session_id, user_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS test_answers (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        participant_id  UUID NOT NULL REFERENCES test_participants(id) ON DELETE CASCADE,
        card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        chosen_answer   TEXT,
        correct_answer  TEXT NOT NULL,
        is_correct      BOOLEAN NOT NULL,
        time_spent_sec  INTEGER,
        answered_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    // Indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_test_sessions_code ON test_sessions(code) WHERE status IN ('waiting', 'active')`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_sessions_teacher ON test_sessions(teacher_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_sessions_course ON test_sessions(course_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_participants_session ON test_participants(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_participants_user ON test_participants(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_test_answers_participant ON test_answers(participant_id)`;
  } catch (e) {
    console.error('Migration 011_live_test failed:', e);
  }

  // Migration 014: UNIQUE(participant_id, card_id) на test_answers — без него можно было
  // отправлять ответ на один и тот же вопрос сколько угодно раз, задваивая счётчики и
  // используя предыдущий ответ сервера (correctAnswer) как оракул. См. database/migrations/
  // 014_test_answers_unique.sql и plan/teacher_access_fix_plan.md, пункт 35.
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_test_answers_unique_participant_card ON test_answers(participant_id, card_id)`;
  } catch (e) {
    console.error('Migration 014_test_answers_unique failed:', e);
  }
}

/**
 * Инициализация структуры БД
 */
async function initDatabase(sql) {
  // Создание таблицы пользователей
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE,
      display_name VARCHAR(255),
      is_anonymous BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      settings JSONB DEFAULT '{
        "dailyGoal": 20,
        "notifications": false,
        "theme": "light"
      }'::jsonb
    )
  `;

  // Создание таблицы наборов карточек
  await sql`
    CREATE TABLE IF NOT EXISTS card_sets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      language_from VARCHAR(10) DEFAULT 'de',
      language_to VARCHAR(10) DEFAULT 'ru',
      is_public BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      total_cards INTEGER DEFAULT 0,
      mastered_cards INTEGER DEFAULT 0,
      studying_cards INTEGER DEFAULT 0
    )
  `;

  // Создание таблицы карточек
  await sql`
    CREATE TABLE IF NOT EXISTS cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      set_id UUID REFERENCES card_sets(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      example TEXT,
      image_url TEXT,
      audio_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      
      -- Spaced Repetition System данные
      interval INTEGER DEFAULT 0,
      ease_factor DECIMAL(3,2) DEFAULT 2.5,
      repetitions INTEGER DEFAULT 0,
      next_review TIMESTAMP DEFAULT NOW(),
      last_reviewed TIMESTAMP,
      status VARCHAR(20) DEFAULT 'new'
    )
  `;

  // Создание таблицы истории повторений
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      quality INTEGER NOT NULL,
      reviewed_at TIMESTAMP DEFAULT NOW(),
      time_spent INTEGER
    )
  `;

  // Персональный SRS-прогресс (отдельная строка на каждого пользователя по каждой карточке)
  await sql`
    CREATE TABLE IF NOT EXISTS card_progress (
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      status        VARCHAR(20) NOT NULL DEFAULT 'new',
      learning_step INT NOT NULL DEFAULT 0,
      next_review   TIMESTAMP NOT NULL DEFAULT NOW(),
      last_reviewed TIMESTAMP,
      interval      INTEGER NOT NULL DEFAULT 0,
      ease_factor   DECIMAL(3,2) NOT NULL DEFAULT 2.5,
      repetitions   INTEGER NOT NULL DEFAULT 0,
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, card_id)
    )
  `;

  // Добавить поле скрытия набора от учеников
  await sql`
    ALTER TABLE card_sets
    ADD COLUMN IF NOT EXISTS is_hidden_from_students BOOLEAN NOT NULL DEFAULT false
  `;

  // Создание индексов для оптимизации
  await sql`CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_card_sets_user_id ON card_sets(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_card_progress_user ON card_progress(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_card_progress_user_card ON card_progress(user_id, card_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_user_card ON reviews(user_id, card_id)`;
  // Использует api/teacher.js: ростер курса (streak/last_active агрегаты) и аггрегаты
  // курса/наборов. Раньше создавались лениво при каждом запросе — см. database/migrations/
  // 015_teacher_aggregate_indexes.sql и план, пункт 28.
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_user_reviewed ON reviews(user_id, reviewed_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_card_sets_course_id ON card_sets(course_id)`;
}

export { ensureDatabaseInitialized, initDatabase };
