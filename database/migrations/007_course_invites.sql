-- Migration 007: Course invites and members
-- Система приглашений учеников в курс
-- Дата: 2026-03-20

-- ==============================================
-- Таблица course_invites — токены приглашений
-- ==============================================

CREATE TABLE IF NOT EXISTS course_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  token       VARCHAR(64) UNIQUE NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_invites_token ON course_invites(token);
CREATE INDEX IF NOT EXISTS idx_course_invites_course_id ON course_invites(course_id);

COMMENT ON TABLE course_invites IS 'Токены приглашений в курс. Одна ссылка на курс, работает для всех учеников';
COMMENT ON COLUMN course_invites.token IS 'Случайный hex-токен (64 символа) для ссылки приглашения';
COMMENT ON COLUMN course_invites.created_by IS 'user_id учителя, создавшего приглашение';
COMMENT ON COLUMN course_invites.expires_at IS 'Срок действия приглашения. NULL = бессрочно';

-- ==============================================
-- Таблица course_members — участники курса
-- ==============================================

CREATE TABLE IF NOT EXISTS course_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMP DEFAULT NOW(),
  role        VARCHAR(20) DEFAULT 'student',
  UNIQUE(course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_members_user_id ON course_members(user_id);
CREATE INDEX IF NOT EXISTS idx_course_members_course_id ON course_members(course_id);

COMMENT ON TABLE course_members IS 'Участники курса. UNIQUE(course_id, user_id) предотвращает дублирование';
COMMENT ON COLUMN course_members.role IS 'Роль участника: student | teacher';
