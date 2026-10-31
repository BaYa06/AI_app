-- Migration 037: «Что нового» (plan/new/whats_new.md, News 5).
-- Новости окна после обновления. Поля — как WhatsNewItem в src/types/whatsNew.ts.
-- Приложение берёт опубликованные строки (GET /api/data?action=news) и накладывает их на запасную
-- копию из сборки (src/constants/whatsNew.ts): строка с тем же id заменяет новость из сборки,
-- снятая с публикации — скрывает её. Правят строки в локальной админке (npm run admin → «Что нового»).

CREATE TABLE IF NOT EXISTS whats_new (
  id           VARCHAR(64) PRIMARY KEY,           -- никогда не меняется: иначе новость покажется снова
  min_version  VARCHAR(20) NOT NULL,              -- с какой версии приложения есть то, о чём новость
  roles        TEXT[] NOT NULL DEFAULT ARRAY['student', 'teacher'],
  platforms    TEXT[] NOT NULL DEFAULT ARRAY['ios', 'android', 'web'],
  min_os       VARCHAR(10),                       -- например '26' — только iOS 26
  priority     INTEGER NOT NULL DEFAULT 0,        -- больше — раньше
  tag          VARCHAR(40) NOT NULL DEFAULT '',
  title        VARCHAR(60) NOT NULL,              -- правило — до 40 символов, админка подсвечивает
  text         VARCHAR(200) NOT NULL DEFAULT '',  -- правило — до 140 символов
  art          VARCHAR(20),                       -- иллюстрация из сборки; незнакомая — без картинки
  action_label VARCHAR(40),
  action_route VARCHAR(40),                       -- только вкладки: Home, Library, Study, Statistics, Profile, TestTab
  published_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at   DATE,
  published    BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
