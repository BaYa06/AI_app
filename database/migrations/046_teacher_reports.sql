-- Migration 046: отчёты учителя (plan/new/teacher_cabinet.md, Teacher 53).
-- Применяется автоматически в api/_db-init.js; файл — для истории и ручного применения.
--
-- kind: parent (один ученик, student_id) / group (весь курс, student_id NULL).
-- data — снимок отчёта на момент создания: публичная страница /r/<code> показывает его, а не
-- живые цифры. Ссылка действует до expires_at (30 дней) или пока учитель её не отзовёт.
-- Только новая таблица: старые версии приложения её не замечают (Release 2).
CREATE TABLE IF NOT EXISTS teacher_reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(16) NOT NULL UNIQUE,
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(10) NOT NULL,
  period     VARCHAR(10) NOT NULL,
  comment    TEXT NOT NULL DEFAULT '',
  data       JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_teacher_reports_creator ON teacher_reports(created_by, created_at DESC);
