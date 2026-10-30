-- Migration 034: наборы по ссылке (plan/new/share_set.md, Share 1). Только новые таблицы.

-- Ссылка на набор: /s/<code>. code — 10 символов base62 (перебором не найти).
-- Одна действующая ссылка на набор; «Закрыть доступ» ставит disabled_at, новая ссылка — новый code.
CREATE TABLE IF NOT EXISTS set_shares (
  code        VARCHAR(16) PRIMARY KEY,
  set_id      UUID NOT NULL REFERENCES card_sets(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ,
  views       INTEGER NOT NULL DEFAULT 0,
  imports     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_set_shares_active_set ON set_shares(set_id) WHERE disabled_at IS NULL;

-- Кто куда добавил набор по ссылке: в «Мои наборы» (course_id NULL) и в каждый свой курс — по разу.
CREATE TABLE IF NOT EXISTS set_share_imports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  code        VARCHAR(16) NOT NULL REFERENCES set_shares(code) ON DELETE CASCADE,
  course_id   UUID,
  new_set_id  UUID REFERENCES card_sets(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_set_share_imports_place
  ON set_share_imports(user_id, code, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_set_share_imports_user_time ON set_share_imports(user_id, created_at DESC);

-- Жалобы (App Review 1.2): набор сразу скрывается у пожаловавшегося, разбор — в админке (Share 6).
CREATE TABLE IF NOT EXISTS set_share_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(16) NOT NULL REFERENCES set_shares(code) ON DELETE CASCADE,
  reporter_id UUID NOT NULL,
  reason      VARCHAR(20) NOT NULL,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(code, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_set_share_reports_open ON set_share_reports(created_at) WHERE resolved_at IS NULL;

-- «Заблокировать автора»: ссылки blocked_user_id у user_id больше не открываются.
CREATE TABLE IF NOT EXISTS user_blocks (
  user_id         UUID NOT NULL,
  blocked_user_id UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, blocked_user_id)
);
