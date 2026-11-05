# Архитектура Flashly

Документ для разработчика, который впервые открывает проект: как устроено приложение, где что
лежит и какие правила проверяет CI.

## Схема

```
 iOS (React Native 0.73) / веб (react-native-web + webpack)
                    │
                    │  HTTPS, Authorization: Bearer <Supabase JWT>
                    ▼
        Vercel Functions  api/*.js  ─────────►  Neon (PostgreSQL)
        data, progress, teacher, test,          схема: api/_db-init.js
        library, books, share, push, ai          + database/migrations/*.sql
                    │
                    ├──►  Firebase Admin — отправка push (api/push/)
                    └──►  Gemini / Groq — ИИ-импорт и примеры (api/_ai/)

 Supabase  — только вход (Apple, Google, гость, e-mail) и Realtime-каналы живого теста/курса.
 Firebase  — push (FCM), аналитика, Crashlytics. Данных пользователя в Firebase нет.
```

- Приложение **не ходит в базу напрямую**: все данные — через `api/`. Пользователя сервер берёт
  из JWT, а не из тела запроса; права на набор/карточку/курс проверяет SQL на сервере.
- Ветки: `dev` → тестовый сервер (Vercel Preview + ветка Neon `staging`), `main` → рабочий.
  Подробно — `plan/new/release_safety.md`.

## Приложение (`src/`)

| Папка | Что там |
|---|---|
| `screens/XScreen.tsx` | Экран: состояние, загрузка, связка частей |
| `screens/x/` | Части экрана: `styles.ts`, компоненты, хуки (`useXxx.ts`) |
| `components/ui/` | UI-кит брендбука (Button, Sheet, Dialog, toast…) — только он для интерфейса |
| `components/…` | Общие компоненты по разделам (home, study, share, push…) |
| `store/` | Zustand-сторы (наборы, карточки, курсы, настройки, урок дня…) |
| `services/` | Всё, что ходит в сеть, хранилище, нативные модули |
| `services/auth/session.ts` | Единственное место чтения сессии Supabase |
| `services/api/client.ts` | HTTP-клиент к `api/` (`apiFetch`, `rawApiFetch`) |
| `services/neon/` | Методы данных по доменам; фасад — `services/NeonService.ts` |
| `services/analyticsEvents/` | Каталог событий; фасад — `services/analytics.ts` |
| `services/realtime.ts` | Каналы Supabase Realtime |
| `utils/logger.ts` | Логгер: в релизе ошибки уходят в Crashlytics |

## Сервер (`api/`)

- Файл `api/x.js` = эндпоинт `/api/x`. Файлы и папки с `_` Vercel не публикует.
- `api/x.js` — роутер: `action` → функция. Сами функции — в `api/_handlers/x/*.js`.
- **Контракт с приложением не меняется**: URL, имена `action`, поля запросов и ответов —
  старые версии приложения из App Store ходят на тот же сервер (`plan/new/release_safety.md`).
- Миграция = блок в `api/_db-init.js` + `SCHEMA_VERSION` + файл в `database/migrations/`
  (`database/migrations/MIGRATION_GUIDE.md`).

## Правила, которые проверяются автоматически

| Правило | Где проверяется |
|---|---|
| TypeScript без ошибок | `npm run type-check`, CI |
| ESLint без ошибок, prettier | `npm run lint`, `npm run format:check`, pre-commit, CI |
| Нет `console.*` — только `log` из `@/utils/logger` / `api/_log.js` | ESLint |
| Экраны/компоненты/хуки не импортируют `supabase` и не вызывают `fetch` | ESLint |
| Серверные пакеты (`firebase-admin`, `@google/genai`, …) не попадают в `src/` | ESLint |
| Миграции в коде и файлах сходятся, `SCHEMA_VERSION` поднят | `npm run db:check-migrations`, pre-commit, CI |
| Брендбук (цвета, размеры, тексты) | `npm run brand:check`, pre-commit, CI |
| SRS клиента = SRS сервера; права доступа в API | jest (`srs.test.ts`, `api/__tests__/access.test.js`) |

## Новый экран

`npm run new:screen -- Имя` → `src/screens/ИмяScreen.tsx` и `src/screens/имя/styles.ts`, дальше —
маршрут в `src/types/navigation.ts` и экран в `src/navigation/AppNavigator.tsx`. Экран держим
до ~400 строк: части — в папку экрана.

## Планы

Крупные изменения делаются по планам в `plan/new/` (готовые — в `plan/done/`): шаг плана = коммит.
