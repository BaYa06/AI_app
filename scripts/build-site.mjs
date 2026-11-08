#!/usr/bin/env node
/**
 * Сборка страниц официального сайта flashlycards.app (plan/new/seo_launch.md).
 *
 * Источники — site/pages/*.html: первая строка — комментарий с JSON-метаданными,
 * дальше — содержимое статьи (с h1). Скрипт оборачивает их в общий шаблон
 * (meta, canonical, hreflang, Open Graph, JSON-LD, шапка, блок скачивания, подвал) и пишет:
 *   public/site/p/<file>.html — страницы (vercel.json: rewrite «путь → /site/p/<file>.html»);
 *   public/site/404.html      — страница «не найдено»;
 *   public/site/sitemap.xml   — карта сайта (лендинг, официальные страницы, страницы из site/pages);
 *   public/site/llms.txt      — краткое описание для ИИ-ассистентов.
 *
 * Проверяет, что у каждой страницы есть rewrite в vercel.json и что редирект
 * «flashlycards.app → app.flashlycards.app» её не перехватит. Ошибка — код выхода 1
 * (запускается в build:web, поэтому сломанный маршрут не доедет до деплоя).
 *
 *   node scripts/build-site.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'site', 'pages');
const OUT = path.join(ROOT, 'public', 'site');
const ORIGIN = 'https://flashlycards.app';
const APP_URL = 'https://app.flashlycards.app/';
const APP_STORE = 'https://apps.apple.com/app/id6808731151';
const OG_IMAGE = `${ORIGIN}/site/og.png`;

/** Страницы, написанные вручную (лендинг и документы), — только для sitemap */
const STATIC_PAGES = [
  { path: '/', updated: '2026-11-09', priority: '1.0', alternates: { ru: '/', en: '/en' } },
  { path: '/support', updated: '2026-11-08', priority: '0.5' },
  { path: '/privacy', updated: '2026-11-08', priority: '0.3' },
  { path: '/terms', updated: '2026-11-08', priority: '0.3' },
  { path: '/delete-account', updated: '2026-11-08', priority: '0.3' },
];

const T = {
  ru: {
    locale: 'ru_RU',
    home: '/',
    homeLabel: 'Flashly, на главную',
    nav: [
      ['/how-to-learn-words', 'Как учить слова'],
      ['/spaced-repetition', 'Интервальное повторение'],
      ['/teachers', 'Учителям'],
    ],
    download: 'Скачать',
    crumbsHome: 'Главная',
    related: 'Читай также',
    ctaTitle: 'Попробуй Flashly бесплатно',
    ctaLead:
      'Первый набор можно сделать за минуту: сфотографируй страницу учебника или добавь слова вручную.',
    appStoreSmall: 'Загрузить в',
    android: ['Для Android', 'Установить'],
    web: ['На компьютере', 'Открыть в браузере'],
    qr: 'Наведи камеру телефона, чтобы открыть Flashly на телефоне',
    note: 'iPhone — приложение из App Store. Android и компьютер — веб-версия, которую можно установить на главный экран.',
    tagline:
      'Flashly — карточки для изучения слов с интервальным повторением. Для школьников, студентов и учителей.',
    footLearn: 'Изучать',
    footDocs: 'Документы',
    footHelp: 'Помощь',
    docs: [
      ['/privacy', 'Политика конфиденциальности'],
      ['/terms', 'Условия использования'],
      ['/delete-account', 'Удаление аккаунта'],
    ],
    help: [
      ['/support', 'Поддержка'],
      ['/#faq', 'Частые вопросы'],
    ],
    otherLang: ['/en', 'English'],
  },
  en: {
    locale: 'en_US',
    home: '/en',
    homeLabel: 'Flashly home',
    nav: [
      ['/en#how', 'How it works'],
      ['/en#teachers', 'For teachers'],
      ['/en#faq', 'FAQ'],
    ],
    download: 'Download',
    crumbsHome: 'Home',
    related: 'Read next',
    ctaTitle: 'Try Flashly for free',
    ctaLead: 'Your first set takes a minute: snap a textbook page or type the words in yourself.',
    appStoreSmall: 'Download on the',
    android: ['For Android', 'Install'],
    web: ['On a computer', 'Open in browser'],
    qr: 'Point your phone camera here to open Flashly on your phone',
    note: 'iPhone: app on the App Store. Android and computer: web version you can add to your home screen.',
    tagline:
      'Flashly is a flashcards app for learning words with spaced repetition. For students and teachers.',
    footLearn: 'Learn',
    footDocs: 'Legal',
    footHelp: 'Help',
    docs: [
      ['/privacy', 'Privacy policy (RU)'],
      ['/terms', 'Terms of use (RU)'],
      ['/delete-account', 'Delete account (RU)'],
    ],
    help: [
      ['/support', 'Support (RU)'],
      ['/en#faq', 'FAQ'],
    ],
    otherLang: ['/', 'Русский'],
  },
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const stripTags = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const fail = (msg) => {
  console.error(`build-site: ${msg}`);
  process.exitCode = 1;
};

// ─── Чтение источников ────────────────────────────────────────────────────────

function readPages() {
  return fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(SRC, f), 'utf8');
      const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\s*/);
      if (!m) throw new Error(`${f}: нет JSON-метаданных в первом комментарии`);
      const meta = JSON.parse(m[1]);
      return { ...meta, file: f.replace(/\.html$/, ''), body: raw.slice(m[0].length).trim() };
    });
}

// ─── Шаблон ───────────────────────────────────────────────────────────────────

const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="apple" viewBox="0 0 24 24"><path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.61 2.79-.41 6.9 1.15 9.16.77 1.1 1.68 2.34 2.87 2.3 1.15-.05 1.59-.74 2.98-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.12 2.78-2.23.88-1.28 1.24-2.52 1.26-2.59-.03-.01-2.41-.93-2.44-3.68zM14.1 5.96c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z"/></symbol>
  <symbol id="download" viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></symbol>
  <symbol id="globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></symbol>
</svg>`;

/** Платформа ставится классом на <html> до отрисовки — кнопки скачивания не прыгают (CLS) */
const PLATFORM_SCRIPT =
  "<script>(function(){var u=navigator.userAgent,n=navigator,p=/iPhone|iPad|iPod/.test(u)||(n.platform==='MacIntel'&&n.maxTouchPoints>1)?'ios':/Android/i.test(u)?'android':/Mobi/i.test(u)?'mobile':'desktop';document.documentElement.classList.add('p-'+p)})()</script>";

function downloadBlock(t) {
  return `<div class="stores">
  <a class="store dl-ios" href="${APP_STORE}"><svg aria-hidden="true" class="fill"><use href="#apple"/></svg><span><small>${t.appStoreSmall}</small><b>App Store</b></span></a>
  <a class="store dl-android" href="${APP_URL}?install=1"><svg aria-hidden="true"><use href="#download"/></svg><span><small>${t.android[0]}</small><b>${t.android[1]}</b></span></a>
  <a class="store store-sec dl-web" href="${APP_URL}"><svg aria-hidden="true"><use href="#globe"/></svg><span><small>${t.web[0]}</small><b>${t.web[1]}</b></span></a>
</div>
<div class="dl-qr"><img src="/site/qr.svg" width="112" height="112" alt="QR-код flashlycards.app" loading="lazy"><span>${t.qr}</span></div>
<p class="meta dl-note">${t.note}</p>`;
}

function jsonLd(page, t, faq) {
  const url = ORIGIN + page.path;
  // Главная на другом языке (/en): описание приложения целиком, без «крошек» и статьи
  const graph = page.app
    ? [
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          url,
          name: page.title,
          description: page.description,
          inLanguage: page.lang,
          isPartOf: { '@id': `${ORIGIN}/#website` },
          about: { '@id': `${ORIGIN}/#app` },
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${ORIGIN}/#app`,
          ...page.app,
          url: ORIGIN + '/',
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'iOS, Web',
          installUrl: APP_STORE,
          downloadUrl: APP_STORE,
          image: OG_IMAGE,
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          publisher: {
            '@type': 'Organization',
            '@id': `${ORIGIN}/#organization`,
            name: 'Flashly',
            url: ORIGIN + '/',
          },
        },
      ]
    : [
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: t.crumbsHome, item: ORIGIN + t.home },
            { '@type': 'ListItem', position: 2, name: page.h1 || page.title, item: url },
          ],
        },
        {
          '@type': 'Article',
          headline: page.h1 || page.title,
          description: page.description,
          inLanguage: page.lang,
          url,
          mainEntityOfPage: url,
          image: OG_IMAGE,
          dateModified: page.updated,
          datePublished: page.published || page.updated,
          author: { '@id': `${ORIGIN}/#organization` },
          publisher: { '@id': `${ORIGIN}/#organization` },
          about: { '@id': `${ORIGIN}/#app` },
        },
      ];
  if (!page.app) {
    // Издатель на каждой странице целиком: проверка Rich Results не ходит по @id на другие страницы
    graph.push({
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: 'Flashly',
      url: ORIGIN + '/',
      logo: `${ORIGIN}/icons/icon-512.png`,
      email: 'support@flashlycards.app',
    });
  }
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function extractFaq(body) {
  const out = [];
  const re = /<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g;
  let m;
  while ((m = re.exec(body))) out.push([stripTags(m[1]), stripTags(m[2])]);
  return out;
}

function hreflang(alternates) {
  if (!alternates) return '';
  const links = Object.entries(alternates).map(
    ([lang, p]) => `<link rel="alternate" hreflang="${lang}" href="${ORIGIN}${p}">`
  );
  if (alternates.ru)
    links.push(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}${alternates.ru}">`);
  return links.join('\n');
}

function render(page, all) {
  const t = T[page.lang];
  const url = ORIGIN + page.path;
  const noindex = page.noindex === true;
  const faq = noindex ? [] : extractFaq(page.body);
  const learnLinks = all.filter((p) => p.lang === page.lang && !p.noindex && p.path !== t.home);
  const footLearn = learnLinks.length
    ? learnLinks.map((p) => [p.path, p.nav || p.h1 || p.title])
    : t.nav;
  const related = learnLinks.filter((p) => p.path !== page.path).slice(0, 4);
  const navLinks = t.nav
    .map(
      ([href, label]) =>
        `<a href="${href}"${href === page.path ? ' aria-current="page"' : ''}>${label}</a>`
    )
    .join('\n      ');
  const list = (items) =>
    items.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('');

  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
${noindex ? '' : hreflang(page.alternates)}
<meta property="og:type" content="${page.path === t.home ? 'website' : 'article'}">
<meta property="og:site_name" content="Flashly">
<meta property="og:locale" content="${t.locale}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="apple-itunes-app" content="app-id=6808731151">
<meta name="theme-color" content="#6467F2">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/site/site.css">
${PLATFORM_SCRIPT}
${noindex ? '' : `<script type="application/ld+json">${jsonLd(page, t, faq)}</script>`}
</head>
<body>
${ICONS}
<header class="top">
  <div class="wrap">
    <a class="logo" href="${t.home}" aria-label="${t.homeLabel}"><img src="/icons/icon-192.png" alt="" width="32" height="32">Flashly</a>
    <nav aria-label="${page.lang === 'ru' ? 'Разделы' : 'Sections'}">
      ${navLinks}
      <a class="btn" href="#download">${t.download}</a>
    </nav>
  </div>
</header>

<main class="wrap">
<article class="doc">
${page.body}
</article>
${
  related.length
    ? `<aside class="related" aria-labelledby="related-h">
  <h2 id="related-h">${t.related}</h2>
  <ul>${related.map((p) => `<li><a href="${p.path}"><b>${esc(p.h1 || p.title)}</b><span>${esc(p.description)}</span></a></li>`).join('')}</ul>
</aside>`
    : ''
}
<section class="cta" id="download" aria-labelledby="dl-h">
  <h2 id="dl-h">${t.ctaTitle}</h2>
  <p class="lead">${t.ctaLead}</p>
  ${downloadBlock(t)}
</section>
</main>

<footer>
  <div class="wrap">
    <div>
      <a class="logo" href="${t.home}"><img src="/icons/icon-192.png" alt="" width="32" height="32" loading="lazy">Flashly</a>
      <p>${t.tagline}</p>
    </div>
    <div>
      <h2 class="fh">${t.footLearn}</h2>
      <ul>${list(footLearn)}</ul>
    </div>
    <div>
      <h2 class="fh">${t.footDocs}</h2>
      <ul>${list(t.docs)}</ul>
    </div>
    <div>
      <h2 class="fh">${t.footHelp}</h2>
      <ul>${list(t.help)}<li><a href="mailto:support@flashlycards.app">support@flashlycards.app</a></li></ul>
    </div>
    <div class="legal"><span>© 2026 Flashly</span><a href="${t.otherLang[0]}" hreflang="${page.lang === 'ru' ? 'en' : 'ru'}">${t.otherLang[1]}</a></div>
  </div>
</footer>
</body>
</html>
`;
}

// ─── sitemap и llms.txt ───────────────────────────────────────────────────────

function sitemap(pages) {
  const entries = [
    ...STATIC_PAGES,
    ...pages.filter((p) => !p.noindex).map((p) => ({ ...p, priority: p.priority || '0.8' })),
  ];
  const urls = entries.map((p) => {
    const alt = p.alternates
      ? Object.entries(p.alternates)
          .map(
            ([l, h]) => `\n    <xhtml:link rel="alternate" hreflang="${l}" href="${ORIGIN}${h}"/>`
          )
          .join('') +
        (p.alternates.ru
          ? `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${p.alternates.ru}"/>`
          : '')
      : '';
    return `  <url>\n    <loc>${ORIGIN}${p.path}</loc>\n    <lastmod>${p.updated}</lastmod>\n    <priority>${p.priority}</priority>${alt}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Генерируется scripts/build-site.mjs — правь там -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

function llms(pages) {
  const ru = pages.filter((p) => p.lang === 'ru' && !p.noindex);
  return `# Flashly — карточки для изучения слов (Flashly flashcards app)

> Flashly — бесплатное приложение с карточками для запоминания иностранных слов и терминов по методу интервального повторения. Есть приложение для iPhone (App Store) и веб-версия для Android и компьютера. Интерфейс на русском; аудитория — школьники, студенты, учителя и репетиторы в СНГ и Центральной Азии. Сайт: ${ORIGIN}. Не путать с приложениями-фонариками и другими проектами с похожим названием.

Ключевые факты:
- Интервальное повторение: слово возвращается через 1, 3, 7, 14, 30 и 60 дней; оценки «Не знаю», «Почти», «Уверенно».
- Статусы слова: «Новое», «Учится», «Знаю», «Выучено надолго».
- Наборы можно создать из фото страницы, PDF, таблицы или текста: ИИ находит слова, переводит и добавляет примеры; можно и вручную.
- Озвучка слов: английский, немецкий, русский, испанский, французский, итальянский, китайский, японский, корейский, турецкий.
- Режимы тренировки: «Карточки», «Тест», «Собери слово», «Слово в контексте», «Аудио».
- Библиотека готовых наборов по языкам и предметам; можно учить не только языки, но и термины, даты, определения.
- Для учителей: курсы, приглашение учеников по ссылке или коду, живые тесты на уроке, прогресс каждого ученика.
- Цели на день (5, 10 или 20 новых слов), серия дней, напоминания.
- Бесплатно. iPhone: ${APP_STORE}. Веб-версия: ${APP_URL}

## Главные страницы
- [Flashly — карточки для изучения слов](${ORIGIN}/): что умеет приложение, как скачать, частые вопросы
- [Flashly in English](${ORIGIN}/en): the same overview in English
${ru.map((p) => `- [${p.h1 || p.title}](${ORIGIN}${p.path}): ${p.description}`).join('\n')}

## Помощь и документы
- [Поддержка](${ORIGIN}/support): как связаться, почта support@flashlycards.app
- [Политика конфиденциальности](${ORIGIN}/privacy)
- [Условия использования](${ORIGIN}/terms)
- [Удаление аккаунта](${ORIGIN}/delete-account)
`;
}

// ─── Проверка маршрутов в vercel.json ────────────────────────────────────────

function checkRoutes(pages) {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const appRedirect = vercel.redirects.find((r) =>
    r.destination.startsWith('https://app.flashlycards.app')
  );
  const inner = appRedirect.source.match(/^\/:path\((.*)\)$/)[1];
  const redirectRe = new RegExp(`^(?:${inner})$`);
  for (const p of pages) {
    if (p.noindex) continue;
    const rw = vercel.rewrites.find((r) => r.source === p.path);
    if (!rw) fail(`нет rewrite для ${p.path} в vercel.json`);
    else if (rw.destination !== `/site/p/${p.file}.html`)
      fail(`rewrite ${p.path} ведёт на ${rw.destination}, нужно /site/p/${p.file}.html`);
    if (redirectRe.test(p.path.slice(1)))
      fail(`${p.path} попадает под редирект на app.flashlycards.app — добавь в исключения`);
    const lenT = [...p.title].length;
    const lenD = [...p.description].length;
    if (lenT > 60) fail(`${p.path}: title ${lenT} символов (> 60)`);
    if (lenD > 155) fail(`${p.path}: description ${lenD} символов (> 155)`);
    if ((p.body.match(/<h1[\s>]/g) || []).length !== 1)
      fail(`${p.path}: должен быть ровно один h1`);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

const pages = readPages();
checkRoutes(pages);
fs.mkdirSync(path.join(OUT, 'p'), { recursive: true });
for (const page of pages) {
  const target =
    page.file === '404' ? path.join(OUT, '404.html') : path.join(OUT, 'p', `${page.file}.html`);
  fs.writeFileSync(target, render(page, pages));
}
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap(pages));
fs.writeFileSync(path.join(OUT, 'llms.txt'), llms(pages));
console.log(`build-site: ${pages.length} страниц, sitemap и llms.txt обновлены`);
