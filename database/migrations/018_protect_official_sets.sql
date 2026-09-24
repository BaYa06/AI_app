-- Миграция 018: защита официальных наборов каталога книг от изменений
-- Дата: 2026-09-24
-- План: plan/book_catalog_plan.md, часть 3
--
-- Официальные наборы (card_sets.is_official) общие для всех учеников. Приложение пока ходит
-- в Neon напрямую (NeonService.ts), и у deleteSet/updateCard/deleteCard нет проверки владельца —
-- защита держится на флаге isReadOnly в интерфейсе. Этот триггер — страховка на уровне БД от
-- ошибок в коде: менять официальные наборы и их карточки можно только в транзакции, где явно
-- включён флаг:
--   SET LOCAL flashly.official_write = 'on'
-- Его включает scripts/import-book.ts. От злоумышленника со строкой подключения из бандла это
-- не защищает (он может выставить флаг сам) — это закрывает часть 0.4 плана.
--
-- Применять через psql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f database/migrations/018_protect_official_sets.sql

BEGIN;

CREATE OR REPLACE FUNCTION flashly_official_write_allowed() RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(current_setting('flashly.official_write', true), '') = 'on'
$fn$;

-- card_sets: нельзя создать официальный набор, изменить или удалить существующий.
CREATE OR REPLACE FUNCTION flashly_guard_official_sets() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF flashly_official_write_allowed() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF (TG_OP IN ('UPDATE', 'DELETE') AND OLD.is_official)
     OR (TG_OP IN ('INSERT', 'UPDATE') AND NEW.is_official) THEN
    RAISE EXCEPTION 'Official set % is read-only', coalesce(NEW.id, OLD.id)
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce(NEW, OLD);
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_official_sets ON card_sets;
CREATE TRIGGER trg_guard_official_sets
  BEFORE INSERT OR UPDATE OR DELETE ON card_sets
  FOR EACH ROW EXECUTE FUNCTION flashly_guard_official_sets();

-- cards: нельзя добавить, изменить или удалить карточку официального набора
-- (в том числе перенести карточку в официальный набор или из него).
CREATE OR REPLACE FUNCTION flashly_guard_official_cards() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF flashly_official_write_allowed() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF EXISTS (
    SELECT 1 FROM card_sets cs
     WHERE cs.is_official
       AND cs.id IN (
         CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.set_id END,
         CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.set_id END
       )
  ) THEN
    RAISE EXCEPTION 'Cards of an official set are read-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce(NEW, OLD);
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_official_cards ON cards;
CREATE TRIGGER trg_guard_official_cards
  BEFORE INSERT OR UPDATE OR DELETE ON cards
  FOR EACH ROW EXECUTE FUNCTION flashly_guard_official_cards();

COMMIT;
