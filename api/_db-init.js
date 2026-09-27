import { neon } from '@neondatabase/serverless';

/**
 * Проверка и автоматическая инициализация БД
 */
async function ensureDatabaseInitialized(sql) {
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
