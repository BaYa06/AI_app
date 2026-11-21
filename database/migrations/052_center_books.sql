-- Migration 052: книги учебного центра по коду (plan/new/center_books.md, Center 1).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- Только добавляющие изменения (Release 2): новые таблицы, nullable-колонки, функции.
-- Старые версии приложения ничего из этого не видят.
--
-- Центр = organizations (из plan/new/organizations_plan.md, 1.1). Книга центра — books.organization_id.
-- Ученик центра по коду — org_students (доступ до access_until). Учителя и владелец кабинета —
-- organization_members. Место центра = человек, у которого сейчас есть доступ к книгам центра.

CREATE TABLE IF NOT EXISTS organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  city           TEXT,
  logo_url       TEXT,
  greeting       TEXT,
  contact        TEXT,
  code_prefix    VARCHAR(8),
  seat_limit     INT NOT NULL DEFAULT 0 CHECK (seat_limit >= 0),
  contract_until TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'admin', 'teacher')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);

-- NULL = общая книга. Удалить центр с книгами нельзя (NO ACTION): иначе книги стали бы общими.
ALTER TABLE books ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE books ADD COLUMN IF NOT EXISTS org_position INT;
CREATE INDEX IF NOT EXISTS idx_books_organization ON books(organization_id) WHERE organization_id IS NOT NULL;

-- Группа учителя центра (Center 14). NULL = обычный курс.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_courses_organization ON courses(organization_id) WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS org_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code              VARCHAR(20) NOT NULL,
  label             TEXT,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until       TIMESTAMPTZ NOT NULL,
  access_days       INT NOT NULL CHECK (access_days > 0),
  max_activations   INT NOT NULL CHECK (max_activations >= 0),
  activations_count INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_codes_code ON org_codes(upper(code));
CREATE INDEX IF NOT EXISTS idx_org_codes_org ON org_codes(organization_id);

CREATE TABLE IF NOT EXISTS org_code_activations (
  code_id      UUID NOT NULL REFERENCES org_codes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (code_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_code_activations_user ON org_code_activations(user_id);

CREATE TABLE IF NOT EXISTS org_students (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_until    TIMESTAMPTZ NOT NULL,
  code_id         UUID REFERENCES org_codes(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_students_user ON org_students(user_id);

-- Какую книгу и с какого юнита учит ученик. Прогресс по словам — в card_progress.
CREATE TABLE IF NOT EXISTS user_books (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  current_unit_id UUID REFERENCES book_units(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, book_id)
);

-- Книги центра видит пользователь, у которого есть доступ к центру сейчас: ученик по коду с
-- неистёкшим доступом, участник центра (владелец, админ, учитель) или админ Flashly.
-- Договор центра кончился — закрыто всем, кроме админа Flashly.
CREATE OR REPLACE FUNCTION flashly_org_access(p_org uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.is_admin)
      OR EXISTS (
        SELECT 1 FROM organizations o
         WHERE o.id = p_org
           AND (o.contract_until IS NULL OR o.contract_until > NOW())
           AND (
             EXISTS (SELECT 1 FROM org_students s
                      WHERE s.organization_id = o.id AND s.user_id = p_user AND s.access_until > NOW())
             OR EXISTS (SELECT 1 FROM organization_members m
                         WHERE m.organization_id = o.id AND m.user_id = p_user)
           )
      )
$fn$;

-- Официальный набор юнита p_unit доступен пользователю: общая книга (или юнит без книги — как
-- раньше), доступ к центру, или юнит открыт в группе центра, где пользователь учитель или ученик.
CREATE OR REPLACE FUNCTION flashly_unit_access(p_unit uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE((
    SELECT b.organization_id IS NULL
        OR flashly_org_access(b.organization_id, p_user)
        OR EXISTS (
          SELECT 1 FROM course_units cu
            JOIN courses c ON c.id = cu.course_id
            JOIN organizations o ON o.id = c.organization_id
           WHERE cu.unit_id = u.id AND cu.is_open
             AND c.organization_id = b.organization_id
             AND (o.contract_until IS NULL OR o.contract_until > NOW())
             AND (c.user_id = p_user
                  OR EXISTS (SELECT 1 FROM course_members m WHERE m.course_id = c.id AND m.user_id = p_user))
        )
      FROM book_units u JOIN books b ON b.id = u.book_id
     WHERE u.id = p_unit
  ), true)
$fn$;

-- Карточка не из закрытой книги центра. Для счёта «ждут повторения» (серия, push).
CREATE OR REPLACE FUNCTION flashly_card_access(p_card uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE((
    SELECT NOT s.is_official OR s.unit_id IS NULL OR flashly_unit_access(s.unit_id, p_user)
      FROM cards c JOIN card_sets s ON s.id = c.set_id
     WHERE c.id = p_card
  ), true)
$fn$;

-- Занятые места центра: ученики с неистёкшим доступом по коду и ученики групп центра.
-- Один человек — одно место.
CREATE OR REPLACE FUNCTION flashly_org_seats_used(p_org uuid) RETURNS int
LANGUAGE sql STABLE AS $fn$
  SELECT COUNT(*)::int FROM (
    SELECT s.user_id FROM org_students s
     WHERE s.organization_id = p_org AND s.access_until > NOW()
    UNION
    SELECT m.user_id FROM course_members m JOIN courses c ON c.id = m.course_id
     WHERE c.organization_id = p_org AND m.role = 'student'
  ) seats
$fn$;

-- Пользователь уже занимает место центра.
CREATE OR REPLACE FUNCTION flashly_org_has_seat(p_org uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXISTS (SELECT 1 FROM org_students s
                  WHERE s.organization_id = p_org AND s.user_id = p_user AND s.access_until > NOW())
      OR EXISTS (SELECT 1 FROM course_members m JOIN courses c ON c.id = m.course_id
                  WHERE c.organization_id = p_org AND m.user_id = p_user AND m.role = 'student')
$fn$;

-- Активация кода центра. Строка центра блокируется FOR UPDATE: активации одного центра идут по
-- очереди, поэтому последнее место не займут двое. Ответ: reason = ok | not_found | expired |
-- already_active | full | contract_ended. Лимиты и счётчики кода не возвращаются.
-- p_dry_run = true — те же проверки без записи: экран «Центр найден» до нажатия «Выбрать книгу»
-- (иначе «Это не мой центр» уже занял бы место).
DROP FUNCTION IF EXISTS flashly_activate_org_code(uuid, text);
CREATE OR REPLACE FUNCTION flashly_activate_org_code(p_user uuid, p_code text, p_dry_run boolean DEFAULT false)
RETURNS TABLE (out_reason text, out_org uuid, out_until timestamptz)
LANGUAGE plpgsql AS $fn$
DECLARE
  c org_codes%ROWTYPE;
  o organizations%ROWTYPE;
  cur timestamptz;
  new_until timestamptz;
BEGIN
  SELECT * INTO c FROM org_codes WHERE upper(code) = upper(btrim(p_code));
  IF NOT FOUND OR NOT c.is_active THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO o FROM organizations WHERE id = c.organization_id FOR UPDATE;
  SELECT * INTO c FROM org_codes WHERE id = c.id FOR UPDATE;
  SELECT s.access_until INTO cur FROM org_students s
   WHERE s.organization_id = o.id AND s.user_id = p_user;

  -- Этот код пользователь уже вводил: место второй раз не тратится, продлить им нельзя
  IF EXISTS (SELECT 1 FROM org_code_activations a WHERE a.code_id = c.id AND a.user_id = p_user) THEN
    IF cur IS NOT NULL AND cur > NOW() THEN
      RETURN QUERY SELECT 'already_active'::text, o.id, cur;
    ELSE
      RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::timestamptz;
    END IF;
    RETURN;
  END IF;

  IF NOW() < c.valid_from OR NOW() > c.valid_until THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  IF o.contract_until IS NOT NULL AND o.contract_until <= NOW() THEN
    RETURN QUERY SELECT 'contract_ended'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  IF c.activations_count >= c.max_activations THEN
    RETURN QUERY SELECT 'full'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  IF NOT flashly_org_has_seat(o.id, p_user) AND flashly_org_seats_used(o.id) >= o.seat_limit THEN
    RETURN QUERY SELECT 'full'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- Дни складываются с оставшимися, но не дальше договора центра (решение 1)
  new_until := GREATEST(COALESCE(cur, NOW()), NOW()) + make_interval(days => c.access_days);
  IF o.contract_until IS NOT NULL AND new_until > o.contract_until THEN
    new_until := o.contract_until;
  END IF;

  IF p_dry_run THEN
    RETURN QUERY SELECT 'ok'::text, o.id, new_until;
    RETURN;
  END IF;

  INSERT INTO org_code_activations (code_id, user_id) VALUES (c.id, p_user);
  UPDATE org_codes SET activations_count = activations_count + 1 WHERE id = c.id;
  INSERT INTO org_students (organization_id, user_id, access_until, code_id)
  VALUES (o.id, p_user, new_until, c.id)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET access_until = EXCLUDED.access_until, code_id = EXCLUDED.code_id, updated_at = NOW();

  RETURN QUERY SELECT 'ok'::text, o.id, new_until;
END
$fn$;
