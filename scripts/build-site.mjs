#!/usr/bin/env node
/**
 * Сборка страниц официального сайта flashlycards.app (plan/new/seo_launch.md).
 * Общие части шаблона — scripts/site/template.mjs.
 *
 * Источники — site/pages/*.html: первая строка — комментарий с JSON-метаданными,
 * дальше — содержимое статьи (с h1). Скрипт оборачивает их в общий шаблон
 * (meta, canonical, hreflang, Open Graph, JSON-LD, шапка, блок скачивания, подвал) и пишет:
 *   public/site/p/<file>.html — страницы (vercel.json: rewrite «путь → /site/p/<file>.html»);
 *   public/site/404.html      — страница «не найдено»;
 *   public/site/sitemap.xml   — карта сайта (лендинг, официальные страницы, страницы из site/pages);
 *   public/site/llms.txt      — краткое описание для ИИ-ассистентов;
 *   public/site/help/…        — раздел «Помощь учителю» (scripts/build-help.mjs).
 *
 * Проверяет, что у каждой страницы есть rewrite в vercel.json и что редирект
 * «flashlycards.app → app.flashlycards.app» её не перехватит. Ошибка — код выхода 1
 * (запускается в build:web, поэтому сломанный маршрут не доедет до деплоя).
 *
 *   node scripts/build-site.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  OUT,
  ORIGIN,
  APP_URL,
  APP_STORE,
  OG_IMAGE,
  T,
  esc,
  stripTags,
  makeFail,
  readPages,
  ICONS,
  downloadBlock,
  headTags,
  siteFooter,
  footLearnLinks,
  ORGANIZATION,
} from './site/template.mjs';
import { buildHelp } from './build-help.mjs';

/** Страницы, написанные вручную (лендинг и документы), — только для sitemap */
const STATIC_PAGES = [
  { path: '/', updated: '2026-11-09', priority: '1.0', alternates: { ru: '/', en: '/en' } },
  { path: '/support', updated: '2026-11-08', priority: '0.5' },
  { path: '/privacy', updated: '2026-11-08', priority: '0.3' },
  { path: '/terms', updated: '2026-11-08', priority: '0.3' },
  { path: '/delete-account', updated: '2026-11-08', priority: '0.3' },
];

const fail = makeFail('build-site');

// ─── Шаблон (общие части — scripts/site/template.mjs) ─────────────────────────

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
    graph.push(ORGANIZATION);
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

function render(page, all) {
  const t = T[page.lang];
  const url = ORIGIN + page.path;
  const noindex = page.noindex === true;
  const faq = noindex ? [] : extractFaq(page.body);
  const learnLinks = all.filter((p) => p.lang === page.lang && !p.noindex && p.path !== t.home);
  const related = learnLinks.filter((p) => p.path !== page.path).slice(0, 4);
  const navLinks = t.nav
    .map(
      ([href, label]) =>
        `<a href="${href}"${href === page.path ? ' aria-current="page"' : ''}>${label}</a>`
    )
    .join('\n      ');
  const head = headTags({
    t,
    title: page.title,
    description: page.description,
    url,
    noindex,
    alternates: page.alternates,
    ogType: page.path === t.home ? 'website' : 'article',
    extra: noindex ? '' : `<script type="application/ld+json">${jsonLd(page, t, faq)}</script>`,
  });

  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
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

${siteFooter(t, page.lang, footLearnLinks(all, page.lang))}
</body>
</html>
`;
}

// ─── sitemap и llms.txt ───────────────────────────────────────────────────────

const xml = (s) => esc(s).replace(/'/g, '&apos;');

/** extra — адреса раздела «Помощь учителю» (scripts/build-help.mjs), у части есть ролик */
function sitemap(pages, extra = []) {
  const entries = [
    ...STATIC_PAGES,
    ...pages.filter((p) => !p.noindex).map((p) => ({ ...p, priority: p.priority || '0.8' })),
    ...extra,
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
    const video = p.video
      ? `\n    <video:video>\n      <video:thumbnail_loc>${xml(p.video.thumb)}</video:thumbnail_loc>\n      <video:title>${xml(p.video.title)}</video:title>\n      <video:description>${xml(p.video.description)}</video:description>\n      <video:player_loc>${xml(p.video.player)}</video:player_loc>\n      <video:duration>${p.video.duration}</video:duration>\n    </video:video>`
      : '';
    return `  <url>\n    <loc>${ORIGIN}${p.path}</loc>\n    <lastmod>${p.updated}</lastmod>\n    <priority>${p.priority}</priority>${alt}${video}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Генерируется scripts/build-site.mjs — правь там -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.join('\n')}
</urlset>
`;
}

function llms(pages, helpLines = []) {
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

## Помощь учителю
${helpLines.join('\n')}

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
const help = buildHelp(pages);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap(pages, help.sitemap));
fs.writeFileSync(path.join(OUT, 'llms.txt'), llms(pages, help.llms));
console.log(`build-site: ${pages.length} страниц, sitemap и llms.txt обновлены`);
