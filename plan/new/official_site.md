# Официальный сайт flashlycards.app (Site N)

## Context
Купили домен **flashlycards.app** (регистратор name.com). Сейчас всё живёт на `ai-app-seven-zeta.vercel.app`: PWA, API, `/privacy`, `/terms`, ссылки `/s/<code>` и `/join/<token>`. Нужен официальный сайт: лендинг, который находят поисковики, и все официальные страницы на своём домене.

Прототип лендинга согласован: https://claude.ai/artifact/SDBEKuUy6QSqbXrtr2cqCJ
Android-версии в Google Play пока **нет**: на сайте только App Store, Google Play добавляем в Site 10.

## Схема
```
flashlycards.app             → лендинг + официальные страницы
  /privacy /terms /support /delete-account
  /s/<code>  /join/<token>   → позже (Site 7)
app.flashlycards.app         → PWA
ai-app-seven-zeta.vercel.app → старый адрес, НЕ отключаем никогда
                               (API установленных iOS-версий, старые PWA)
```
- Один проект Vercel, отдельный не нужен. Что показать, решает vercel.json по адресу запроса (`has: host`).
- PWA уходит на `app.`, потому что корень `/` занимает лендинг (сейчас последнее правило `rewrites` отдаёт `index.html`). Поддомен — самый простой вариант: Service Worker, вход и push работают как сейчас.
- Лендинг — простой HTML без React: веб-версия приложения сначала грузит большой JS, и поисковик видит почти пустую страницу.

## Где сейчас прописан старый адрес
| Где | Что |
|---|---|
| `src/config/legal.ts` | ссылки на privacy и terms (те же указаны в App Store Connect) |
| `src/config/apiBase.ts` | `PRODUCTION_ORIGIN` — API для нативного приложения |
| `src/screens/HomeScreen.tsx` | `inviteBaseUrl` для приглашений |
| `api/share.js` | `DEFAULT_ORIGIN`, переменная `SHARE_ORIGIN` уже предусмотрена |
| `api/join.js` | адреса в странице приглашения |
| `ios/FlashcardsApp/FlashcardsApp.entitlements` | `applinks:` — Universal Links |
| `public/.well-known/apple-app-site-association` | одинаковый для всех доменов, менять не нужно |
| Supabase → Auth → Redirect URLs | `window.location.origin/auth-callback` для входа в PWA |

## Лендинг (по прототипу)
1. Шапка: иконка, разделы (Как это работает, Возможности, Учителям, Вопросы), кнопка «Скачать».
2. Главный экран: «Учись умнее. Запоминай надолго.», кнопка App Store, «Бесплатно для iPhone. Есть веб-версия». Справа живая карточка-тренажёр: переворот, «Не знаю» / «Почти» / «Уверенно», статус слова, помечена «Пример».
3. Лента повторений: интервалы из `SRSService` — сегодня, 1, 3, 7, 14, 30, 60 дней — в цветах статусов «Новое», «Учится», «Знаю», «Выучено надолго».
4. Три шага: создай набор → учи по 5 минут → смотри прогресс.
5. Возможности: набор из фото/PDF/файла, озвучка, библиотека, не только языки, серия и цели, поделиться набором.
6. Для учителей: курс, приглашение по ссылке/коду, живые тесты, прогресс учеников; карточка курса помечена «Пример».
7. Частые вопросы: бесплатно ли, какие языки, набор из учебника, смена телефона, класс для учителя, удаление аккаунта (Профиль → «Удалить аккаунт»).
8. Блок скачивания и подвал: документы (Политика, Условия, Удаление аккаунта), помощь (Поддержка, Вопросы, support@flashlycards.app), © 2026 Flashly.

Брендбук: `#6467F2` / `#818CF8`, фон тёмной темы `#101122`, системный шрифт, иконки lucide, без эмодзи, на «ты», без выдуманных данных.

## Шаги (шаг = коммит «Site N», ветка dev; Production — только с разрешения)

### Site 1 — лендинг в проекте ✅
- Прототип перенесён в `public/site/index.html`, webpack копирует его в `dist/site/` (пока доступен по `/site/`).
- Кнопка скачивания только **App Store** (`apps.apple.com/app/id6808731151`).
- Иконка файлом `/icons/icon-192.png`, а не data URI.
- Ссылки в подвале уже на итоговые адреса: `/privacy`, `/terms`, `/support`, `/delete-account` (две последние появятся в Site 4), почта `support@flashlycards.app` (пересылка в name.com настроена).
- Временно `noindex`, чтобы копия на старом адресе не попала в поиск — убрать в Site 5.
- Позже по желанию: заменить карточку-тренажёр на настоящие скриншоты.

### Site 2 — подключение домена (без кода)
- Vercel: добавить `flashlycards.app`, `www.flashlycards.app` (редирект на корень), `app.flashlycards.app`.
- name.com: записи, которые покажет Vercel (A для корня, CNAME для `www` и `app`), либо передать DNS в Vercel. TXT для Google Search Console.
- По желанию: почта `support@flashlycards.app` через пересылку в name.com.
- Сначала проверить на Preview ветки dev.

### Site 3 — маршруты по адресу ✅
- `flashlycards.app/` → лендинг через `middleware.js` (Routing Middleware, `matcher: '/'`). Правило в vercel.json не работает: на «/» лежит `index.html` приложения, а файл важнее rewrites.
- vercel.json `redirects`: адреса приложения на `flashlycards.app` (`/auth-callback`, `/home` …) → `app.flashlycards.app` (временный редирект). Остаются на корне: `/api`, `/ai`, `/s`, `/join`, `/privacy`, `/terms`, `/admin`, `/site`, `/icons`, `/fonts`, `/.well-known`, файлы с точкой. В Site 4 добавить в исключения `/support` и `/delete-account`.
- Лендинг снимает Service Worker приложения на `flashlycards.app` (остался у тех, кто открывал домен до Site 3).
- `app.flashlycards.app` и старый адрес — без изменений.
- Проверить API, `/s/`, `/join/`, `/admin` на всех адресах.

### Site 4 — официальные страницы ✅
- Общий стиль `public/site/site.css` (токены брендбука), шапка и подвал как на лендинге.
- `/privacy`, `/terms` — новое оформление, текст без изменений; почта для связи `onlinechina06@gmail.com` → `support@flashlycards.app`, дата «обновлено 8 ноября 2026».
- Новые `/support` (`public/site/support.html`) и `/delete-account` (`public/site/delete-account.html`) — содержание только из политики и условий; пока `noindex` до Site 5.
- vercel.json: rewrites `/support`, `/delete-account`; исключения редиректа на `app.`; на старом адресе `/privacy`, `/terms` → 308 на `flashlycards.app`.
- ⚠️ Редирект со старого адреса начнёт работать только после слияния в `main`. Слияние `dev` → `main` и перевод `flashlycards.app` / `app.flashlycards.app` с Preview на Production — **одновременно** (иначе старые ссылки на политику уведут на сборку `dev`).

### Site 5 — поиск и превью ссылок
- Убрать `noindex` из `public/site/index.html` (поставлен в Site 1).
- title/description, canonical на `flashlycards.app`, Open Graph, favicon, JSON-LD `SoftwareApplication`, Smart App Banner.
- `sitemap.xml`, `robots.txt`; PWA, `/admin` и старый адрес — `noindex`.
- Отправить сайт в Google Search Console.

### Site 6 — приложение на новом домене (новая сборка, TestFlight)
- `src/config/legal.ts` → новый домен.
- `FlashcardsApp.entitlements`: добавить `applinks:flashlycards.app` (старые оставить).
- Supabase → Auth → Redirect URLs: добавить `https://app.flashlycards.app/auth-callback`.
- API (`src/config/apiBase.ts`) пока на старом адресе.

### Site 7 — ссылки «Поделиться» и приглашения
- Только когда большинство обновится до сборки из Site 6.
- Vercel env `SHARE_ORIGIN=https://flashlycards.app`; `inviteBaseUrl` в HomeScreen и адреса в `api/join.js`.
- Старые ссылки продолжают работать.

### Site 8 — карточка App Store и внешние ссылки
- App Store Connect: Privacy Policy, Support, Marketing URL → новый домен (политику можно менять без новой сборки).
- Соцсети и профили.

### Site 9 — пользователи PWA (по желанию)
- PWA привязана к адресу, с которого её установили: вход, локальные данные и push живут на `ai-app-seven-zeta.vercel.app`.
- Старый адрес работает — у них ничего не меняется.
- Если бы перенаправили старый адрес: разлогин, push пропадут, иконка может открывать браузер; данные аккаунта вернутся после входа. Поэтому не перенаправляем.
- Мягкая плашка в старой PWA: «Мы переехали: скачай приложение или открой app.flashlycards.app».

### Site 10 — Google Play (когда выйдет Android-версия)
- Кнопка Google Play на лендинге (главный экран и блок скачивания), вопрос «Есть ли версия для Android».
- «Бесплатно для iPhone» → «Бесплатно для iPhone и Android».
- JSON-LD: ссылка на Google Play; Android App Links (`/.well-known/assetlinks.json`) для `/s/` и `/join/`.
- Google Play Console: политика `flashlycards.app/privacy`, удаление аккаунта `flashlycards.app/delete-account`, сайт.

## Перенос в прод (main отстаёт на 1.7.1, 152 коммита)
Цель — пользователи 1.7.1 и веба ничего не замечают. Сервер выходит раньше новой сборки (Release 2).

Что меняется на сервере: API разбит по `_handlers` (все action из main сохранены); миграции 012, 036, 038, 039, 040 только добавляют (038 обнуляет владельца у официальных наборов + триггер защиты); новая логика push (cron-job.org сразу применит её ко всем); озвучка Azure (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`); веб получит новую версию сразу.

### A. Подготовка
- ✅ A1 (я): сверка API main ↔ dev. 277 функций сервера: 184 без изменений, все action и маршруты на месте, проверки входа те же. Изменения по существу — новое поле `kind` (необязательное, с умолчанием), «уже добавлен» в библиотеке без учёта курсов, импорт из библиотеки ещё и в каждый свой курс — формат ответов прежний.
  - ⚠️ Заметно для 1.7.1: лайк и оценка в библиотеке отвечают текущим состоянием и ничего не пишут (library_catalog, решение 8) — нажатый лайк пропадёт после обновления экрана. **Решение владельца (08.11.2026): оставляем как есть.**
  - Триггер 038 (наборы книг только для чтения): все записи в card_sets/cards ограничены владельцем, кроме `announced_at` в push «новый набор» — он берёт только наборы с `course_id`, а наборы книг создаются без него (scripts/import-book.ts). Подтвердить на A2.
- ✅ A2 (08.11.2026): репетиция на копии рабочей базы. schema_037 → schema_040 без ошибок, данные не тронуты (448 пользователей, 972 набора, 52 182 карточки). Наборы книг на проде уже без владельца и с триггерами (038 ничего не меняет), риск push «новый набор» = 0. **Миграции идут ~35 с** — поэтому шаг B0. Ветку `rehearsal-1-8` и `.env.rehearsal` удалить.
- ✅ A3 (владелец, 08.11.2026): `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` заданы для Production и Preview (коннектор Vercel список переменных не читает — проверка озвучки в B5).
- ⬜ A4 (владелец): Supabase → Redirect URLs — `https://app.flashlycards.app/auth-callback`.
- ⬜ A5 (владелец): Neon — ветка `before-1.8` из рабочей базы перед слиянием.
- ⬜ A6 (я): Site 5 в dev.
- A7: заморозка dev на время переноса. A8: утро буднего дня, не вечер и не около 20:30 UTC (cron close-week).

### B. Перенос (~30 мин)
0. **B0 — миграции заранее** (владелец, за несколько минут до слияния): `node scripts/rehearse-migrations.mjs --prod` (POSTGRES_URL из .env.local, подтверждение словом «prod»). Без этого первый запрос после деплоя ждёт ~35 с, а несколько экземпляров Vercel запустят миграции одновременно. Текущий сервер 1.7.1 с новой схемой работает (только добавления).
1. merge dev → main, push (Production-деплой).
2. Сразу домены `flashlycards.app`, `app.flashlycards.app`: Preview → Production.
3. Проверить, что новый сервер видит schema_040 (миграции уже применены в B0) и ошибок нет.
4. curl-проверка: старый адрес, API, `/privacy` `/terms` + редиректы, лендинг, `app.`, `/s/`, `/join/`.
5. iPhone с 1.7.1 из App Store: вход, главная, занятие, библиотека, набор по ссылке, курс и тест, push. Новая сборка (TestFlight из main): озвучка слова (Azure на проде).
6. 1–2 часа: Vercel Runtime Errors, Crashlytics, панель push.

### C. Откат
Vercel → предыдущий Production-деплой → Instant Rollback (миграции аддитивные — старый код с ними работает); домены → Preview; данные — ветка Neon `before-1.8`.

### D. После
Импорт каталога библиотеки `--prod`; сборка 1.8.x из main → TestFlight → ревью (данные о сбоях, поэтапный выпуск); Site 8; Site 6–7 в новой сборке.

## Отложено
Проблема: при входе через Google (окно браузера в `SignInScreen` / `EmailAuthScreen`) Google пишет «перейти на yiwsmjbeirgomkrckoju.supabase.co» — выглядит подозрительно. Вход через Apple нативный, его не касается. Supabase сейчас на тарифе **Free**.
- **A. Свой домен Supabase `auth.flashlycards.app`:** тариф Pro (~$25/мес) + Custom Domain (~$10/мес), цены перепроверить. CNAME `auth` + TXT в name.com, новый callback `https://auth.flashlycards.app/auth/v1/callback` в Google Cloud, `SUPABASE_URL` в `supabaseClient.ts` (новая сборка). Старый `…supabase.co` продолжит работать.
- **B. Нативный вход через Google** (`signInWithIdToken`, как у Apple) — бесплатно, убирает окно браузера на iOS/Android; в PWA остаётся старое окно.
- **C. Оформление экрана согласия Google OAuth:** название Flashly, логотип, главная `flashlycards.app`, политика, домен в Authorized domains, проверка бренда. Делает окно аккуратнее, но `supabase.co` полностью убирает только A.
- **Почта:** письма Supabase с `noreply@flashlycards.app` через свой SMTP (например, Resend, бесплатный тариф) — меньше попадают в спам, работает на Free.
- Рекомендация: сейчас B + C, потом A, если понадобится Pro по другим причинам.

## Уязвимые места
1. Нельзя отключать или перенаправлять старый адрес целиком: на нём API для уже установленных версий и PWA пользователей.
2. Ссылки на новый домен до сборки с `applinks` открываются в браузере, а не в приложении — порядок Site 6 → Site 7 обязателен.
3. Без нового адреса в Supabase Redirect URLs вход через Google в PWA на `app.` сломается.
4. Правила по адресу в vercel.json не должны задеть `/api/*` и `/.well-known/*`.
5. Подключение домена затрагивает Production — только с разрешения; сначала Preview ветки dev.

## Проверка
- Лендинг и официальные страницы открываются на `flashlycards.app`, PWA — на `app.flashlycards.app`, старый адрес работает как раньше.
- Вход Google / Apple / почта в PWA на новом адресе.
- Ссылки `/s/<code>` и `/join/<token>` открывают приложение (TestFlight) и после Site 7.
- Google Search Console видит sitemap, страницы индексируются.
