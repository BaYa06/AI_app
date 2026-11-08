# Поиск и ИИ: flashlycards.app в топе (SEO N)

## Цель
- Бренд: «flashly», «flashlycards», «flashly карточки», «flashly app» — первые места (1–4 недели после Search Console).
- Не бренд: «карточки для изучения английских / немецких / турецких слов», «как выучить слова»,
  «интервальное повторение», «приложение для заучивания слов» — 2–6 месяцев.
- Общие «flashcards», «изучить слова» — только с внешними ссылками (Quizlet, Anki, Duolingo держат их годами).
- ИИ-ассистенты советуют то, о чём пишут на других сайтах: см. «Вне сайта».

Название не уникальное (фонарик, другой стартап) — везде связка «Flashly — карточки для изучения слов» / «Flashly flashcards app».
Сравнение с Quizlet — **не делаем** (решение владельца, 09.11.2026).

## Решения
- PWA остаётся на `app.flashlycards.app` (а не `/app`): вход Supabase, push и Service Worker уже там; `app.` и старый адрес закрыты `X-Robots-Tag: noindex`.
- manifest один на все адреса → `start_url` и `scope` = `/`, `id: "/"` (как вычислялось раньше — установленные PWA не меняются).
- Тексты — только факты из кода: интервалы `SRSService` (0/1/3/7/14/30/60), 10 языков озвучки (`api/_ai/tts.js`), режимы, цели 5/10/20. Без отзывов, рейтингов, числа пользователей. Казахского и кыргызского среди языков приложения нет — не обещаем.
- Ветка `seo-launch` от `dev` → PR в `dev`; в `main` только с разрешения.

## Шаги (шаг = коммит «SEO N», ветка seo-launch)

### SEO 1 — лендинг ✅
H1/title «Flashly — карточки для изучения слов», hreflang, JSON-LD Organization + WebSite + SoftwareApplication + FAQPage (10 вопросов), кнопки по платформе (iOS → App Store, Android → `app.flashlycards.app/?install=1`, компьютер → браузер + QR), блок «Полезное», подвал «Изучать», контраст (Accessibility 95 → 100), favicon/apple-touch-icon, robots.txt с ИИ-ботами.

### SEO 2 — статьи, /en, 404, sitemap, llms.txt ✅
- Источники `site/pages/*.html` → `scripts/build-site.mjs` (в `build:web`) → `public/site/p/*.html`, `404.html`, `sitemap.xml`, `llms.txt`.
- Страницы: `/how-to-learn-words`, `/spaced-repetition`, `/learn/english`, `/learn/german`, `/learn/turkish`, `/teachers`, `/en`.
- Новая страница: файл в `site/pages/` + rewrite в vercel.json + путь в исключения редиректа на `app.` — генератор проверяет и валит сборку.
- Неизвестный адрес на `flashlycards.app`: исключения → страница 404 (noindex); остальное, как и раньше, 307 на `app.`.

### SEO 3 — PWA ✅
`InstallFromLink`: `?install=1` → системное окно установки (Chrome/Edge), App Store (iPhone) или инструкция. `beforeinstallprompt` ловится в `public/index.html`. manifest: id, описание, цвета, отдельные maskable.

### SEO 4 — IndexNow ✅
`public/<ключ>.txt` в корне, `node scripts/indexnow.mjs` после каждого деплоя с новыми страницами (Bing, Яндекс).

### SEO 5 — старый адрес ✅
Один раз тост «У Flashly новый адрес» на `ai-app-seven-zeta.vercel.app`, без редиректа.

### SEO 6 — наборы библиотеки в поиске (ждёт решения владельца)
Самый сильный рычаг для длинных запросов: страница на каждый **официальный** набор библиотеки — список слов, кнопка «Учить в Flashly». Сейчас `/s/` закрыты (`noindex`). Затрагивает сервер (`api/share.js` или новый `api/`), нужен деплой в прод.

### После слияния в Production (владелец)
1. Google Search Console: домен `flashlycards.app` (TXT в name.com) → sitemap `https://flashlycards.app/sitemap.xml` → «Проверка URL» → «Запросить индексирование» для `/` и статей.
2. Bing Webmaster Tools: импорт из Search Console, sitemap (Bing — поиск для ChatGPT и Copilot).
3. Яндекс.Вебмастер: сайт, sitemap, регион.
4. `node scripts/indexnow.mjs`.
5. App Store Connect: название/подзаголовок со словами «карточки», «слова»; Marketing URL `https://flashlycards.app`, Support URL `/support`, Privacy `/privacy`.

### Вне сайта (владелец, тексты готовлю я)
AlternativeTo (как альтернатива Quizlet и Anki), Product Hunt, статья на vc.ru / Хабре, Telegram-каналы учителей, авторы подборок «приложения для изучения слов». Профили Instagram, TikTok, LinkedIn — одно название «Flashly — карточки для изучения слов», ссылка `flashlycards.app`; после создания добавить их в `sameAs` (JSON-LD Organization на лендинге).

## Проверка
- Lighthouse mobile (локально, после): лендинг 100/100/100/100 в светлой и тёмной теме, статьи 100/100/100/100. До: 100/95/100/100.
- После деплоя: коды 200 у `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/manifest.webmanifest`, статей; `/app` и `app.` — `X-Robots-Tag: noindex`; Rich Results Test по `/` и статье; hreflang `/` ↔ `/en`; Chrome Android → DevTools → Application → Manifest.
