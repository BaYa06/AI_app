# Безопасные релизы: TestFlight и один боевой сервер

Приложение в App Store, бэкенд один (Vercel + Neon + Supabase). TestFlight-сборка — тот же
бинарник, что уйдёт в App Store, поэтому «тестовый сервер» в неё зашивать нельзя. Риск не в
TestFlight, а в деплое сервера: старые версии приложения у пользователей ходят на тот же API,
а миграции (api/_db-init.js) применяются к боевой базе при первом запросе после деплоя.

Шаг = коммит «Release N».

## Release 1 — App Store Connect (без кода) ⬜ (пользователь, при создании версии 1.4.1)
- App Store Connect → приложение → версия → **Phased Release for Automatic Updates** → включить.
  Новая версия доходит до пользователей за 7 дней (1% → 100%), выкладку можно приостановить.
- Проверять TestFlight на **отдельном тестовом аккаунте** (не на основном), чтобы не трогать
  свои реальные данные; основной админ-аккаунт — только для проверки админских функций.

## Release 2 — правила совместимости API и миграций ✅
Старые версии приложения живут у пользователей месяцами. Сервер не должен их ломать.
1. **Миграции только добавляют**: `ADD COLUMN IF NOT EXISTS`, новые таблицы, новые индексы.
   Новая колонка — с `DEFAULT` или nullable, чтобы старые INSERT'ы не падали.
2. **Нельзя в одном релизе**: удалять/переименовывать колонки и таблицы, менять тип колонки,
   добавлять `NOT NULL` без `DEFAULT`. Делать в два шага: добавить новое → через 2+ релиза,
   когда старых версий почти нет, убрать старое.
3. **API**: новые поля в ответах — можно; удалять/переименовывать поля, менять их тип и смысл,
   удалять `action` в api/*.js — нельзя (только через `minVersion`, см. Release 5).
   Новый обязательный параметр запроса — нельзя: старые клиенты его не шлют, нужен дефолт.
4. **Порядок выкладки**: сначала сервер (push в main → Vercel), проверить, что текущая версия
   из App Store работает; потом TestFlight → ревью. Никогда не наоборот.
5. Перед push в main с изменениями api/ или _db-init.js — пройтись по пунктам 1–3.

## Release 3 — staging: ветка dev, тестовый сервер, тестовые сборки ✅
Схема: `dev` → Vercel Preview `ai-app-git-dev-baya06s-projects.vercel.app` → ветка базы Neon;
`main` → рабочий сервер `ai-app-seven-zeta.vercel.app` → рабочая база.
- ✅ Vercel Authentication для Preview выключена (иначе приложение получает 302 на вход Vercel).
- ✅ src/config/apiBase.ts: APP_ENV=staging → API_ORIGIN тестового сервера; веб берёт свой домен.
- ✅ Метка «Тестовый сервер» сверху экрана в staging-сборке (StagingBadge).
- ✅ codemagic.yaml: `ios-testflight-staging` (APP_ENV=staging) и `ios-testflight` (production);
  номер сборки = последний в App Store Connect + 1, чтобы 10 загрузок подряд не конфликтовали.
- ✅ Neon: ветка `staging` (без auto delete), compute `ep-wild-king-ah80ir3s`; в Vercel
  `POSTGRES_URL` для Preview → ветка Git `dev`. Рабочая база — `ep-misty-scene-ahkv29p5`.
  Проверено 13.10.2026: запросы тестового сервера будят compute `staging`.
  Свежие данные из рабочей базы: Neon → ветка staging → Reset from parent.
  Проверено 13.10.2026 по таблице `card_sets` в Neon: набор из TestFlight-staging есть только в
  ветке `staging`, в `main` его нет. Интеграция Neon задаёт свою `POSTGRES_URL` для всех
  окружений, но запись для Preview → `dev` её перекрывает.
  **Проверять разделение только по Neon или по вебу** (ai-app-seven-zeta.vercel.app): на одном
  iPhone TestFlight-сборка заменяет версию из App Store, и «Открыть» в App Store запускает её же.
- ✅ Ветка `dev` на GitHub, Preview-деплой `ai-app-git-dev-baya06s-projects.vercel.app` работает.
- ⬜ Первая сборка «iOS TestFlight Staging» в Codemagic (13.10 — очередь Codemagic, инцидент macOS M2).
- Хук pre-push поднимает версию на каждом push (и в dev) — оставлено так по решению пользователя.

Как работать:
1. Пишем код в `dev`, push сколько угодно — рабочий сервер не меняется.
2. Codemagic → «iOS TestFlight Staging» из ветки `dev` → TestFlight (метка «Тестовый сервер»).
3. Готово → merge `dev` в `main` (сервер выкатится на прод) → проверить, что версия из App Store
   работает → Codemagic «iOS TestFlight Release» из `main` → быстрая проверка → ревью.

Осторожно: тестовая база — копия рабочей, в ней push-токены реальных пользователей. Действия на
тестовом сервере, которые шлют push (напоминания учителя и т.п.), дойдут до реальных людей.

## Release 4 — Crashlytics ✅ (код) / ⬜ (проверка на устройстве)
- `@react-native-firebase/crashlytics` 22.4.0 (как остальной Firebase), Podfile: modular headers
  для FirebaseCoreExtension/PromisesObjC; pod install добавил шаг «[RNFB] Crashlytics
  Configuration» — загрузка dSYM в Firebase при сборке.
- src/services/crashReporting(.native).ts: метка `app_env` (staging/production), UUID
  пользователя, ошибки из ErrorBoundary. Только iOS; в режиме разработки не собирается.
- Политика конфиденциальности: «Отчёты о сбоях», Firebase Crashlytics в таблице сервисов.
- ⬜ App Store Connect → Конфиденциальность приложения: добавить «Диагностика → Данные о сбоях»
  (связаны с пользователем: да — UUID; отслеживание: нет; цель: функциональность приложения).
  Сделать ДО отправки версии с Crashlytics в ревью.
- ⬜ Первая staging-сборка: Firebase Console → Crashlytics → приложение появилось.
- JS-ошибки приходят с номерами строк минифицированного бандла; при необходимости — загрузка
  source maps (отдельная задача).

## Release 5 — minVersion ⬜
API отдаёт минимальную поддерживаемую версию; приложение ниже неё показывает «Обновите
приложение» со ссылкой в App Store. Запасной выход, если совместимость всё же придётся сломать.
