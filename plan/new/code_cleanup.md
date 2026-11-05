# Чистота кода: проект, который не стыдно открыть

Цель — чтобы сильный разработчик, открыв репозиторий, увидел продакшн, а не «писали быстро».
Аудит 04.11.2026: секреты не в git, SQL параметризован, миграции пронумерованы, 176 тестов
проходят — это сохраняем. Проблемы — гигиена репозитория, огромные файлы, красный tsc,
сырые логи, доступ к сети и авторизации размазан по экранам, CI ничего не проверяет.

Шаг = коммит «Clean N». Порядок важен: сначала дешёвое и безопасное (1–4), потом сеть
и CI (5–7), потом большие рефакторинги (8–11). Поведение приложения не меняется ни на одном
шаге — только структура. Каждый шаг: `npx jest` зелёный, ошибок tsc в `src` не больше, чем
в прошлом коммите (tsc только по src, см. память), проверка в dev → тестовый сервер.

**Правило совместимости API (из release_safety.md) действует на всех шагах:** URL эндпоинтов,
имена `action`, поля запросов и ответов не меняются. Старые версии из App Store ходят на тот
же сервер. Переименование — только с алиасом, старый путь живёт минимум 2+ релиза.

---

## Clean 1 — мусор в репозитории ✅
Что видно первым при открытии репозитория.
Сделано 04.11.2026: tsc в src 88 → 85 (3 ошибки были в удалённом старом экране), jest 176/176,
веб собирается, wav в сборке. `plan/ideas/` не тронута — решение пользователя (в git или нет).
Исходные xlsx остались только локально и в старой истории git — оригиналы перенести в Drive.
1. Удалить старый `src/screens/HomeScreen.tsx` (793 строки, навигация его не использует).
   Переименовать `HomeScreen.new.tsx` → `HomeScreen.tsx`, поправить импорт в
   `src/navigation/AppNavigator.tsx` и экспорт в `src/screens/index.ts`.
2. Удалить из корня `correct.wav`, `correct2.wav` — копии `public/`, webpack берёт из `public/`.
3. Удалить `index.web.js` — webpack использует `index.web.jsx`. Проверить `npm run build:web`.
4. `books/*.xlsx`, `sets/*.xlsx` — исходные данные импорта, не код. Убрать из git
   (`git rm --cached`), добавить в `.gitignore`, в `scripts/README` или `database/README.md`
   написать, где лежат исходники (Google Drive) и как запускать импорт.
5. `.gitignore`: добавить `ios/**/xcuserdata/`, `plan/ideas/` (если личное), `sounds/` (если
   это сырьё — финальные звуки уже в `android/.../assets` и iOS-бандле).
6. `.DS_Store`, `dist/` — уже в `.gitignore`, проверить, что ничего не закоммичено.

Проверка: веб собирается, главная открывается, звуки «правильно» играют на iOS и в вебе.

## Clean 2 — один источник правды для схемы БД ✅
Сделано 04.11.2026: дописаны 036_push_token_version.sql и 012_streak_events.sql (номер 012 был занят
дважды, у streak_events файла не было). `npm run db:check-migrations` проверяет ещё и
SCHEMA_VERSION = schema_<последний номер> — ровно та ошибка, из-за которой 038/039 не выполнились.
Старые ручные миграции — закрытый список MANUAL в скрипте. Хук pre-commit запускает проверку,
если в коммите _db-init.js или migrations/.

Сейчас схема живёт в двух местах: `database/migrations/*.sql` (001–039, нет 036) и
`api/_db-init.js` (79 CREATE/ALTER, миграции применяются при первом запросе). Миграция 036
есть только в `_db-init.js`.
1. Записать `database/migrations/036_push_token_version.sql` из `_db-init.js` — закрыть дыру.
2. В `database/migrations/MIGRATION_GUIDE.md` зафиксировать правило: исполняется
   `_db-init.js`, а `.sql` — документация и обязательна для каждой новой миграции
   (номер = номер в комментарии `_db-init.js`).
3. Скрипт `scripts/check-migrations.mjs`: сверяет номера `Migration NNN` в `_db-init.js` с
   файлами в `migrations/`, падает при расхождении. Подключить в pre-commit.
Перевод на настоящий раннер миграций — не в этом плане (рискованно для боевой базы).

## Clean 3 — логгер вместо console.* ✅ (3a ✅, 3b ✅, 3c ✅)

**3c сделано 04.11.2026** — `api/_log.js` + 78 вызовов в api/. Vercel и так собирает консоль,
поэтому смысл — единый формат `[tag] message`, стек у Error и `debug`, который молчит в
продакшне (VERCEL_ENV=production); info/warn/error пишутся как раньше. В `api/push/_send.js`
логгер импортирован как `logger` — там своя функция `log` (журнал пушей в БД).
check-migrations по-прежнему находит `Migration NNN_name failed` — пример в MIGRATION_GUIDE
обновлён на log.error. Локальная админка (api/admin.js, не в git) не тронута.

252 вызова `console.*` в `src`, 78 в `api`.

**3a сделано 04.11.2026** — `src/utils/logger.ts` + services/store (140 вызовов), тест logger.test.ts.
Важно: в релизе babel уже вырезал console.log/warn (`transform-remove-console`), а console.error
никуда не уходил — до логгера ошибки в продакшне не видел никто. Уровни:
- `debug`/`info` — только `__DEV__`;
- `warn` — разработка: консоль; релиз: строка в журнал Crashlytics (видна в следующем отчёте);
- `error` — console.error + некритичная ошибка в Crashlytics, раз за запуск на тег+текст;
  в отчёт идут только тег, текст и текст ошибки — объекты из details (токены, наборы) нет.
Правило выбора: обрыв сети, ответ 4xx, неверный код/ссылка пользователя — `warn`;
ответ 5xx и необъяснимое — `error` (NeonService: `resp.status >= 500 ? log.error : log.warn`).
**3b сделано 04.11.2026** — screens, components, App.tsx, utils, hooks, polyfills (122 вызова).
В `src` не осталось `console.*`, кроме логгера и ErrorBoundary (там `reportError` уже шлёт
отчёт — log.error задвоил бы его). Ошибки входа — `error` (отмену Apple код отсекает раньше);
опрос монитора живого теста, озвучка, звуки, распознавание речи — `warn`.
Найдено: ESLint не запускается — `.eslintrc.js` с `module.exports` при `"type": "module"`
(нужно `.eslintrc.cjs`) → Clean 4.
1. `src/utils/logger.ts`: `log.debug/info/warn/error(tag, ...args)`. В релизе debug/info —
   ничего, warn — в Crashlytics как лог, error — `recordError` в Crashlytics.
2. `api/_log.js`: то же для сервера, с префиксом `[tag]` — читается в логах Vercel.
3. Заменить вызовы механически (по папкам: services → store → screens → components → api).
   `console.error` в catch → `log.error` (теперь доходит до Crashlytics — бонус).
4. ESLint: `no-console: error` для `src/**` и `api/**` (кроме самих логгеров).
Можно разбить на 3a (логгер + services/store), 3b (screens/components), 3c (api).

## Clean 4 — линт и форматирование зелёные ✅ (4a ✅, 4b ✅, 4c ✅)

**4c сделано 04.11.2026** — правила: `comma-dangle: off` (запятые расставляет prettier),
`curly: ['warn', 'multi-line']` (стиль проекта — однострочные `if (x) return;`). Предупреждений
1973 → 145, ошибок 0. pre-commit: ESLint `--quiet` (только ошибки) и `prettier --check` по
проиндексированным JS/TS (имена с пробелами и кириллицей — через `-z`/`xargs -0`), прежние
проверки миграций и брендбука сохранены. README — раздел «Линтер, форматирование и pre-commit».

**4b сделано 04.11.2026** — prettier 3.7.4 по 271 файлу (src, api, scripts, database, server,
конфиги), `.prettierignore`, скрипты `format` / `format:check`, в lint добавлены `.mjs,.cjs`.
Доказательство, что смысл не изменился: сравнение AST каждого файла (HEAD vs рабочая версия,
@babel/parser) — 271/271; допущены только позиции, комментарии, скобки, кавычки, висячие запятые,
JSX-текст по правилам компилятора JSX, `(typeof X)[number]`, `a || (b || c)`, ключ без кавычек.
JSON, md, yml не форматировались. Lint: 0 ошибок, предупреждений 1973 (с .mjs/.cjs).

**4a сделано 04.11.2026** — `.eslintrc.js` → `.eslintrc.cjs` (ESM-пакет), `.eslintignore`
(сборки, нативные папки, ассеты), Node-окружение для api/scripts/database, `no-console: error`
для src/api (кроме логгеров). Линт: 0 ошибок, 2080 предупреждений (curly 1659, пробелы —
уйдут в 4b; exhaustive-deps 89 остаётся warn — зависимости не добавляем, это меняет поведение).
Исправлено 29 ошибок без изменения поведения: неиспользуемые импорты/переменные, no-shadow.
MultipleChoiceScreen: `useCallback` стоял после раннего `return` (rules-of-hooks, риск
«Rendered more hooks») — перенесён выше без изменений. tsc в src 85 → 63 (ушли TS6133).
`prettier/prettier` выключен: eslint-plugin-prettier из @react-native/eslint-config 0.73
падает с prettier 3 → в 4b форматирование проверяем `prettier --check`, а не через ESLint.
На 4b: добавить `.mjs,.cjs` в `--ext` скрипта lint.
1. Запустить `npm run lint`, посчитать ошибки, исправить автофиксом (`--fix`) то, что можно.
2. Остальное — исправить или (если правило не подходит проекту) отключить в `.eslintrc.js`
   осознанно, с комментарием почему. Цель: `npm run lint` → 0 ошибок.
3. `prettier --check` по `src` и `api`; один коммит «форматирование» отдельно от логики,
   чтобы не смешивать с другими изменениями в истории.
4. `lint` и `prettier --check` добавить в pre-commit хук на изменённые файлы.

## Clean 5 — единый API-клиент и авторизация в одном месте ✅ (код; ⬜ проверка на устройстве)

**Карта 04.11.2026 (Explore):** 69 вызовов getSession (один разбит на 2 строки в App.tsx),
17 прямых `fetch` в экранах/хуках (почти все — `/api/test`, без таймаута), общего хелпера
токена нет, 401 нигде не обновляет сессию (только autoRefresh), 5 разных форм ошибок в
сервисах. `supabase.channel` (Realtime) — в 4 экранах тестов и useCourseRealtime.
Уточнения к пунктам ниже (безопаснее плана, поведение не меняется):
- повтор запроса: опция `retry` в клиенте есть, по умолчанию выкл. и никем не используется —
  сейчас повторов нет нигде, а повтор POST (answer, join, buyStreakFreeze) опасен;
- заголовок версии приложения — НЕ добавляем: на web это CORS preflight, изменение контракта;
- `onAuthChange` сохраняет отсрочку `setTimeout(0)` (deadlock getSession внутри колбэка, App.tsx);
- session.ts без кэша токена; импортирует только supabaseClient; сторы импортируют его напрямую,
  не через баррел `@/services` (циклы);
- для ESLint-запрета нужна обёртка `services/realtime.ts`; экраны входа и App.tsx — исключения;
- тексты ошибок экзаменов сохранить: их переводит `describeTestError`.
**5a ✅ 04.11.2026** — `src/services/auth/session.ts`: getSession, getAccessToken, getUserId,
getCurrentUser (id, email, isAnonymous), onAuthChange (setTimeout(0), отписка). Без кэша.
Ошибка Supabase (`error`) → null + warn; ИСКЛЮЧЕНИЕ пробрасывается, как у прямого вызова
(иначе в 5b «нет сети» превратилось бы в «не авторизован», а strict-загрузка — в пустые данные).
Тест — 12 случаев. Существующий код не тронут.
**5b ✅ 04.11.2026** — 24 вызова в 16 файлах services/store → session.ts; каждая замена
эквивалентна (то же поле, та же ветка без токена, вызов внутри/вне try там же). Удалён мёртвый
AuthService.ts (MMKV-заглушка, только реэкспорт). settingsStore больше не тянет баррел
`@/services` (баррел всё равно грузится из App.tsx до первого рендера). Моки 3 тестов → session.
**5c ✅ 04.11.2026** — `src/services/api/client.ts`: `apiFetch(endpoint, {method, query, body,
headers, auth: required|optional|none, timeoutMs (false = голый fetch), signal, baseUrl, retry,
parse: json|none})` → `{ok, status, json, response, error: ApiError}`. Не бросает на HTTP/сети/
таймауте/нет токена (code: no_token|network|timeout|aborted|http, исходное исключение в
`error.original`) — так каждый сервис в 5d повторит свои ветки. Бросает только исключение
getAccessToken и JSON.stringify. Логов нет (сервисы логируют сами), новых заголовков нет,
retry по умолчанию 0 (только GET + network). Тест — 26 случаев.
**5d.1 ✅ 04.11.2026** — NeonService (callTeacherApi, callDataApi, callProgressApi,
buyStreakFreeze, submitAnswers) и diamondStore.callRewardsApi на apiFetch. Токен читается вне
try, как раньше (`auth: 'none'` + явный Authorization) — исключение сессии летит наружу.
Тест neonApiCalls.test.ts (27 случаев: точный URL, заголовки с порядком, тело, ветки, логи)
проходит и на старом коде, и на новом — запросы побайтно те же.
**5d.2 ✅ 05.11.2026** — Library, Book, Share, AiImport (importFiles, getAiUsage), push (web —
`baseUrl: '/api'`, native), pushPrompt на apiFetch; таймауты прежние (120/15/20 с, голый fetch →
`timeoutMs: false`), исходное исключение fetch пробрасывается, как раньше. В клиенте: свой
Content-Type в headers сохраняет порядок ключей вызывающего (pushPrompt: Authorization первым).
Тест serviceApiCalls.test.ts (39 случаев) проходит и на старом коде, и на новом.
**5e ✅ 05.11.2026** — 25 вызовов в 15 экранах/компонентах (Home, SetDetail, SetEditor,
Teacher*, StudentDetail, Library*, MyPublications, PersonalInfo, Statistics, CourseJoinCodeDialog,
Push*, SharedSetPreview): `supabase.auth.getSession()` → `getSession()` из session.ts — тот же
объект Session | null, код после вызова не менялся (`session?.user?.id` и т.п.). ProfileScreen —
исключение (signOut + onAuthStateChange без отсрочки), как экраны входа и App.tsx.
**5f–5i ✅ 05.11.2026 (один коммит)** — экраны экзаменов (TestJoin, ExamLobby, TestLobby,
LiveTest, TestWaiting, TestExam, TestDone, TestResultsTeacher, TestHistory), NotificationSettings
и useExamExitGuard: токен — `getAccessToken()` / `getSession()`, запрос — `rawApiFetch(path, init)`
из api/client.ts (прямая замена голого fetch: тот же Response, то же исключение сети, без
таймаута, тело не читается). Обработка ответов на экранах НЕ менялась — поэтому вместо
типизированного ExamService (переписал бы ветки 409/left, describeTestError) выбрана замена
1:1. Таймаут для экзаменов — сознательно не добавлен (изменение поведения), можно отдельным
решением. 17 запросов, тест rawApiFetch (4 случая).
**5j ✅ 05.11.2026** — `src/services/realtime.ts` (createChannel / removeChannel — те же вызовы
supabase) для 4 экранов экзаменов и useCourseRealtime; utils/distractors на rawApiFetch; из
ApiService удалены мёртвые checkDatabase/initDatabase. whatsNew и ApiService.generateExamples
остаются на fetch — они в src/services, правилу «fetch только в сервисах» это не противоречит.
`supabase` в интерфейсе теперь импортируют только SignIn, Welcome, EmailAuth, Profile.
**5k ✅ 05.11.2026** — ESLint для src/screens, src/components, src/hooks: запрещён импорт
supabaseClient (и `supabase` из баррела `@/services`, и относительный путь) и глобальный `fetch`;
исключения — SignIn, Welcome, EmailAuth, Profile. Проверено пробным файлом: 5 нарушений из 5.
**Итог Clean 5:** `supabase.auth.getSession` вне session.ts — только App.tsx и экраны входа;
прямого fetch в интерфейсе нет; 290 тестов (+109 за шаг), tsc 63, lint 0 ошибок, веб собирается.
Подшаги: 5a session.ts + тест · 5b сервисы и сторы на session.ts (+ удалить мёртвый AuthService)
· 5c api/client.ts + тест · 5d call*Api сервисов на клиент (контракты null/ApiResult/reason те же)
· 5e экраны: getSession → getUserId/getCurrentUser · 5f ExamService + useExamExitGuard
· 5g экраны учителя (ExamLobby, TestLobby, LiveTest) · 5h экраны ученика (TestJoin, TestWaiting,
TestExam, TestDone) · 5i TestResultsTeacher, TestHistory, настройки push · 5j realtime.ts,
distractors/whatsNew/ApiService на клиент · 5k ESLint-запреты.
`supabase.auth.getSession` вызывается 68 раз в 52 файлах; 10 экранов сами делают `fetch`.
Это главный архитектурный долг: токен, базовый URL, обработка 401 и ошибок — в каждом месте
по-своему.
1. `src/services/auth/session.ts`: `getAccessToken()`, `getUserId()`, `onAuthChange()` —
   единственное место, где вызывается `supabase.auth.*` (кроме экранов входа).
2. `src/services/api/client.ts` поверх существующего `ApiService`: `api.post(endpoint,
   action, body)` — сам подставляет токен, `API_ORIGIN`, версию приложения, таймаут,
   повтор при сетевой ошибке, единый тип ошибки `ApiError`.
3. Перевести экраны с прямым `fetch` на сервисы (по одному экрану за коммит 5a, 5b, …).
   Экран вызывает `SetsService.load()`, а не `fetch('/api/data', ...)`.
4. ESLint `no-restricted-imports`: `supabaseClient` нельзя импортировать из `src/screens` и
   `src/components`; `no-restricted-globals` для `fetch` в тех же папках.

## Clean 6 — TypeScript без ошибок ✅

**Сделано 05.11.2026** — `npm run type-check`: **0 ошибок** (было 63, и сам tsc падал RangeError).
- 6a `2a5dc37` — `include: ["src"]` в tsconfig: tsc больше не обходит dist/ios/Pods.
- 6b `3403cc9` — 62 ошибки, только типы: импорт @jest/globals в fitText.test (29), полифилы web,
  `src/types/modules.d.ts`, web-стили `as any` (как уже в проекте), явный return в эффектах.
  Container не принимает `edges` — проп игнорировался на 3 экранах, убран (возможно, там
  задумывались safe-area-отступы — отдельный вопрос дизайна). Удалён мёртвый
  SharedSetDetailScreen (моки, в навигации не было).
- 6c `94a96e5` — **ИСПРАВЛЕНИЕ БАГА**: гостевой импорт набора из библиотеки писал карточки с
  front/back вместо frontText/backText — на экранах без подстраховки (AudioLearning, ContextFill,
  OralTest, итоги, урок дня, виджет) текст был пустым. Отдельный коммит.
- 6d `3389aa2` — `src/utils/cardText.ts` (cardFront/cardBack, LegacyCard) вместо 28 `as any`;
  ESLint `no-explicit-any: warn`.
- 6e `53ccdb6` — типы навигации у 10 экранов стека. Вкладки (Home, Profile, Statistics) — на
  any: `MainTabScreenProps` (CompositeScreenProps RN6) сужает navigate до never — чинить тип
  отдельно (вместе с rn_upgrade.md).
**any: 201 → 164.** Остаток: ответы API и строки БД (`r: any`, `row: any`, NeonService),
`catch (e: any)` (19 — замена на unknown требует правки обработчиков), web-полифилы. Комментарий
к каждому не ставим (164 строки шума) — линт показывает их как warn; типы ответов API —
естественно делать вместе с Clean 9 (разнос NeonService по доменам).

Около 89 старых ошибок tsc в `src`, 190 `any`.
1. Починить tsc в корне (RangeError) — скорее всего, `allowJs` тянет `dist/`, `public/`,
   `android/`, `ios/`. Добавить в `exclude` или завести `include: ["src", "index*.js*"]`.
2. Ошибки tsc в `src` → 0. По папкам: types → services → store → components → screens.
3. `any`: для ответов API — типы в `src/types/api.ts` (общие с Clean 5); для событий и
   навигации — типы React Navigation (`NativeStackScreenProps`). Оставшиеся `any` —
   только с комментарием почему. ESLint `@typescript-eslint/no-explicit-any: warn`.
4. Цель шага: `npm run type-check` → 0 ошибок, включается в CI (Clean 7).

## Clean 7 — CI проверяет каждый PR ✅ (код) / ⬜ п.2 защита main — пользователь

**Сделано 05.11.2026** — `.github/workflows/checks.yml`: push в dev/main и PR → Node 24 (engines),
`npm ci` → lint → format:check → type-check → jest → brand:check → db:check-migrations; все шаги
выполняются, даже если предыдущий упал. Локально вся последовательность — 0. iOS-сборка в Actions
— только вручную (TestFlight собирает Codemagic). Бейдж Checks в README.
**Первый прогон в Actions будет после push в dev** — проверить, что `npm ci` на Ubuntu проходит
(patch-package, prepare-хук).
Сейчас `.github/workflows/ios-build.yml` только собирает iOS и проверяет бренд.
1. Новый `.github/workflows/checks.yml` на push в `dev` и PR в `main`, Ubuntu (дешёво):
   `npm ci` → `lint` → `type-check` → `jest` → `brand:check` → `check-migrations`.
2. Защита ветки `main` на GitHub: merge только при зелёном `checks` (настройка — пользователь).
3. iOS-сборку в Actions оставить ручной (`workflow_dispatch`) — её делает Codemagic.
4. Бейдж статуса в README.

## Clean 8 — разрезать огромные экраны ⬜ (8a частично ✅ — ждёт проверки на устройстве)

**8a (HomeScreen) 05.11.2026 — 3456 → 2285 строк**, всё — перенос без изменения логики, каждый
кусок сверен с HEAD (совпадает с точностью до пробелов/переносов):
- 8a.1 `7187f5b` — `src/screens/home/`: styles.ts, setsSort.ts, StaggerCard.tsx, pickCardsForGame.ts.
- 8a.2 `de1194e` — `home/components/`: StreakDialog, EditCourseDialog, DeleteCourseDialog,
  LeaveCourseDialog, InviteStudentsDialog, SetsSortSheet, SetActionSheet (разметка как была,
  значения — пропсами с теми же именами).
- 8a.3 `1fe7ff8` — SetListItem (тело visibleSets.map; key на компоненте — те же ключи).
- 8a.4 `b9c9de2` — хук useCourseInvite (состояние + обработчики приглашения).
- 8a.5 `0b53bc9` — хук useCourseRemoval (удаление курса и выход из курса; флаги окон остались в
  HomeScreen — их читает useWhatsNewOnHome).
Структура: экран остался `src/screens/HomeScreen.tsx` (импорт в навигации не менялся), куски —
в `src/screens/home/`. Цель ≤ 400 строк не достигнута: остаток — переплетённые группы (серия и
алмазы, мини-игры, боковая панель с жестами, запуск режимов изучения, урок дня, виджет) и
разметка тела. Продолжать — после проверки 8a на устройстве.
14 файлов больше 900 строк. Норма: экран ≤ 400 строк, логика — в хуках, куски UI —
в компонентах рядом с экраном.
Структура для экрана-гиганта:
```
src/screens/home/
  HomeScreen.tsx          — разметка и связка (≤ 400 строк)
  useHomeData.ts          — загрузка, кэш, обновление
  components/…            — секции экрана
  styles.ts
```
Порядок (один экран = один-два коммита, 8a, 8b, …), от самого рискованного:
1. `HomeScreen` (2846) 2. `SetDetailScreen` (1638) 3. `SetEditorScreen` (1353)
4. `TeacherCourseStatsScreen` (1292) 5. `StudyScreen` (1110) 6. `MultipleChoiceScreen` (1022)
7. `App.tsx` (1009) — вынести провайдеры, deep links, инициализацию в `src/app/*`
8. `StreakCelebration` (1024), `TeacherStudentsScreen` (970) — по остаточному принципу.
Перед резкой каждого экрана — проверить на устройстве основные сценарии, после — те же.
`npm run new:screen` обновить, чтобы генерировал папку по этой структуре.

## Clean 9 — разнести NeonService и большие сервисы ⬜
`NeonService.ts` (1280) — по доменам: `SetsService`, `CardsService`, `CoursesService`,
`ProfileService`, общий `api/client.ts` из Clean 5. `NeonService` остаётся тонким
реэкспортом на время перехода, потом удаляется. `analytics.ts` (894) — события в
`analytics/events.ts`, транспорт отдельно.

## Clean 10 — серверный API по модулям ⬜
`api/data.js` (1091), `api/test.js` (1167), `api/teacher.js` (849) — один файл, много
`action`. URL и `action` **не меняются** (совместимость).
1. Внутри: `api/data.js` становится роутером `action → обработчик`, обработчики —
   в `api/_handlers/data/*.js` (Vercel не публикует файлы и папки с `_`).
2. `api/test.js` — это экзамены. Код → `api/_handlers/exams/*`; сам `api/test.js` остаётся
   тонким роутером (URL `/api/test` не трогаем). В README объяснить, что `test` = экзамены.
3. Общая проверка входных данных: маленький валидатор `api/_validate.js` (или `zod`) —
   неверный запрос → 400 с понятной ошибкой, а не 500.
4. Убедиться, что после разбиения не вырос холодный старт (Vercel логи, до/после).

## Clean 11 — тесты на критичное ⬜
Сейчас покрыта только чистая логика. Добавить:
1. **API**: тесты обработчиков из Clean 10 с фейковым `sql` — права доступа (`_access.js`:
   чужой набор нельзя прочитать/удалить), экзамены, публикация в библиотеку.
2. **SRS**: `SRSService` — интервалы, оценки, граничные случаи (сейчас тестов нет).
3. **Синхронизация**: `SyncQueueService` — офлайн → онлайн, повтор, дубль.
4. **UI** (React Native Testing Library) — 2–3 критичных сценария: сессия «Изучить» до итогов,
   создание набора. Без снапшотов.
5. Порог покрытия в jest для `src/services` и `api/_handlers` — не опускаться ниже текущего.

## Clean 12 — зависимости и документация ⬜
1. `firebase-admin`, `@google-cloud/vertexai`, `@google/genai`, `dotenv`,
   `@neondatabase/serverless` — серверные, а лежат в `dependencies` мобильного приложения.
   Проверить, что Metro их не тянет в бандл; перенести в `devDependencies` (Vercel ставит
   и их) или в отдельный `api/package.json`. Проверить деплой на тестовом сервере.
2. Два AI SDK (`vertexai` в `server/import-files.js`, `genai` в `api/_ai/gemini.js`) —
   оставить один. `server/` — используется ли ещё? Если нет — удалить.
3. `npx depcheck` — удалить неиспользуемые пакеты.
4. README: архитектура в одной схеме (RN app → Vercel api/ → Neon; Supabase = только вход;
   Firebase = push, аналитика, Crashlytics), как запустить, ветки dev/main, где планы.
   Кратко `docs/ARCHITECTURE.md` — папки `src/` и правила (экран не ходит в сеть сам и т.д.).

---

## Чего НЕ делаем в этом плане
- Не меняем библиотеки состояния, навигацию, UI-кит — это отдельный план (rn_upgrade.md).
- Не трогаем URL и контракты API (только внутреннюю структуру).
- Не заменяем `_db-init.js` на внешний раннер миграций.
- Не гонимся за 100% покрытием — тесты только там, где ошибка стоит денег или данных.

## Итог: как поймём, что готово
- `npm run lint`, `type-check`, `jest` — 0 ошибок, и это проверяет CI на каждом PR.
- Нет файлов > 600 строк в `src/screens` и `api/`.
- `supabase.auth` и `fetch` — только в `src/services`.
- Нет `console.*` вне логгера, ошибки доходят до Crashlytics.
- В корне репозитория — только конфиги и README, без данных и медиа.
