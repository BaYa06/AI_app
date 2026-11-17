-- Учителя учебного центра (plan/new/center_books.md, Center 13): ссылка-приглашение
-- flashlycards.app/t/<код>. Одна действующая ссылка на центр; «Новая ссылка» в кабинете заменяет
-- код — старая перестаёт работать. Учителя уже в organization_members (роль teacher, миграция 052).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS teacher_invite VARCHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_teacher_invite
  ON organizations(teacher_invite) WHERE teacher_invite IS NOT NULL;
