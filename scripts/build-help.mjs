/**
 * Раздел «Помощь учителю» flashlycards.app/teachers/help (plan/new/teacher_help.md).
 *
 * Источник — site/help/content.ru.json (темы, вопросы, ролики). Пишет в public/site/help/
 * (папка генерируется заново при каждой сборке, в git не хранится):
 *   index.html          — хаб: поиск, «Идёт урок?», ролики, «Первые 10 минут», темы, частые вопросы;
 *   c/<тема>.html       — тема: вопросы с ответами, раскрываются на месте;
 *   <slug>.html         — вопрос: короткий ответ, «Где», вертикальный ролик 9:16, шаги;
 *   index.json          — данные для поиска и просмотра роликов (help.js);
 *   help.css, help.js   — копии из site/help/assets.
 *
 * Вопросы с "draft": true (функции ещё нет на проде) попадают только в сборки не для production
 * (VERCEL_ENV !== 'production': preview ветки dev, локально) — с пометкой «черновик» и noindex.
 * В sitemap и llms.txt черновиков нет никогда.
 *
 * Вызывается из scripts/build-site.mjs (buildHelp), отдельно не запускается.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  OUT,
  ORIGIN,
  T,
  esc,
  makeFail,
  headTags,
  siteFooter,
  footLearnLinks,
  ORGANIZATION,
} from './site/template.mjs';

const fail = makeFail('build-help');
const SRC = path.join(ROOT, 'site', 'help');
const DEST = path.join(OUT, 'help');
const BASE = '/teachers/help';
const PROD = process.env.VERCEL_ENV === 'production';

const ICON_PATHS = {
  start: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  students:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3 3-5 6-5s5.4 2 6 5"/><path d="M16 4.5a3 3 0 0 1 0 6M18 14c1.6.6 2.7 2.2 3 5"/>',
  sets: '<rect x="4" y="6" width="13" height="14" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/>',
  books: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6"/>',
  lesson: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  homework:
    '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 12l2.5 2.5L16 9"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  center: '<path d="M3 21h18M5 21V8l7-5 7 5v13M10 21v-5h4v5"/>',
};
const svg = (inner, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
const CHEV = svg('<path d="m9 6 6 6-6 6"/>', 'h-chev');
const SEARCH_ICON = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');

// ─── Чтение и проверка контента ───────────────────────────────────────────────

function load() {
  const data = JSON.parse(fs.readFileSync(path.join(SRC, 'content.ru.json'), 'utf8'));
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const all = data.questions;
  const slugs = new Set();
  for (const q of all) {
    const where = `вопрос ${q.slug || '?'}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.slug || ''))
      fail(`${where}: slug — латиница через дефис`);
    if (slugs.has(q.slug)) fail(`${where}: slug повторяется`);
    slugs.add(q.slug);
    if (!cats.has(q.category)) fail(`${where}: нет темы ${q.category}`);
    if (!q.question || !q.answer) fail(`${where}: нужны question и answer`);
    if ([...(q.answer || '')].length > 155) fail(`${where}: answer длиннее 155 символов`);
    if (!Array.isArray(q.steps) || !q.steps.length) fail(`${where}: нужен хотя бы один шаг`);
    if (!Array.isArray(q.where) || !q.where.length) fail(`${where}: нужен where`);
    if (q.video?.youtubeId && !/^[A-Za-z0-9_-]{11}$/.test(q.video.youtubeId))
      fail(`${where}: youtubeId — 11 символов из ссылки YouTube`);
    if (q.video?.poster && !fs.existsSync(path.join(SRC, 'img', q.video.poster)))
      fail(`${where}: нет файла site/help/img/${q.video.poster}`);
  }
  for (const q of all)
    for (const r of q.related || [])
      if (!slugs.has(r)) fail(`вопрос ${q.slug}: related ${r} не найден`);
  for (const [k, list] of Object.entries(data.home))
    for (const s of list) if (!slugs.has(s)) fail(`home.${k}: ${s} не найден`);

  const questions = all.filter((q) => !(PROD && q.draft));
  const bySlug = new Map(questions.map((q) => [q.slug, q]));
  const categories = data.categories.filter((c) => questions.some((q) => q.category === c.id));
  const pick = (list) => list.filter((s) => bySlug.has(s)).map((s) => bySlug.get(s));
  return {
    categories,
    cats,
    questions,
    bySlug,
    home: {
      urgent: pick(data.home.urgent),
      firstSteps: pick(data.home.firstSteps),
      popular: pick(data.home.popular),
    },
  };
}

const hasVideo = (q) => Boolean(q.video?.youtubeId);
const qUrl = (q) => `${BASE}/${q.slug}`;
const catUrl = (c) => `${BASE}/c/${c.id}`;
const poster = (q) =>
  q.video.poster
    ? `/site/help/img/${q.video.poster}`
    : `https://i.ytimg.com/vi/${q.video.youtubeId}/oardefault.jpg`; // вертикальная обложка Shorts
/** «1:30» → «PT1M30S» */
const isoDuration = (d) => {
  const [m, s] = String(d || '0:00')
    .split(':')
    .map(Number);
  return `PT${m}M${s}S`;
};
const ld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

// ─── Куски разметки ───────────────────────────────────────────────────────────

function badges(q, ctx, { withCat = false } = {}) {
  const out = [];
  if (q.draft) out.push('<span class="h-badge h-draftb">черновик</span>');
  if (q.urgent) out.push('<span class="h-badge h-urg">на уроке</span>');
  if (q.isNew) out.push('<span class="h-badge h-new">новое</span>');
  if (hasVideo(q)) out.push(`<span class="h-badge h-vid">▶ ${esc(q.video.duration || '')}</span>`);
  if (withCat) out.push(`<span class="h-badge">${esc(ctx.cats.get(q.category).title)}</span>`);
  return out.join('');
}

const whereLine = (q) =>
  `<div class="h-where"><span class="h-wl">Где:</span>${q.where
    .map((w) => `<span class="h-crumb">${esc(w)}</span>`)
    .join('<span class="h-sep" aria-hidden="true">›</span>')}</div>`;

function qRow(q, ctx, opts = {}) {
  return `<details class="h-q"${opts.open ? ' open' : ''}>
<summary><span class="h-qt"><b>${esc(q.question)}</b><span class="h-meta">${badges(q, ctx, opts)}</span></span>${CHEV}</summary>
<div class="h-qb"><p class="h-short">${esc(q.answer)}</p>${whereLine(q)}<a class="h-more" href="${qUrl(q)}">${hasVideo(q) ? 'Шаги и ролик' : 'Подробнее'} →</a></div>
</details>`;
}

const supportBlock = () => `<section class="h-support" aria-labelledby="h-sup">
  <div><h2 id="h-sup">Не нашли ответ?</h2><p>Напишите нам из приложения: Профиль → «Мои обращения» → «Написать нам», или на <a href="mailto:support@flashlycards.app">support@flashlycards.app</a>. Отвечаем в течение дня.</p></div>
  <a class="btn" href="/support">Поддержка</a>
</section>`;

function crumbsNav(items) {
  return `<nav class="h-crumbs" aria-label="Навигация">${items
    .map(([href, label], i) =>
      i === items.length - 1
        ? `<span aria-current="page">${esc(label)}</span>`
        : `<a href="${href}">${esc(label)}</a><span aria-hidden="true">›</span>`
    )
    .join('')}</nav>`;
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([href, label], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: label,
      item: ORIGIN + href,
    })),
  };
}

function layout(ctx, { url, title, description, noindex, graph, body, draft, slug = '' }) {
  const t = T.ru;
  const head = headTags({
    t,
    title,
    description,
    url: ORIGIN + url,
    noindex,
    ogType: url === BASE ? 'website' : 'article',
    extra: `<link rel="stylesheet" href="/site/help/help.css">
<script defer src="/site/help/help.js"></script>
${noindex ? '' : `<script type="application/ld+json">${ld({ '@context': 'https://schema.org', '@graph': [...graph, ORGANIZATION] })}</script>`}`,
  });
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body class="h-body"${slug ? ` data-slug="${slug}"` : ''}>
${draft ? '<div class="h-draftbar">Черновик: этой функции ещё нет на проде, на flashlycards.app страница не появится</div>' : ''}
<header class="top h-top">
  <div class="wrap">
    <a class="logo" href="${BASE}" aria-label="Помощь учителю Flashly"><img src="/icons/icon-192.png" alt="" width="32" height="32"><span class="h-brand">Flashly</span><span class="h-sub">Помощь учителю</span></a>
    <form class="h-search" role="search" action="${BASE}" method="get">
      ${SEARCH_ICON}
      <input id="hq" name="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Что случилось? Например: ученик не видит набор" aria-label="Поиск по справке для учителей">
      <kbd class="h-kbd" aria-hidden="true">/</kbd>
      <button class="h-clear" type="button" aria-label="Очистить поиск" hidden>×</button>
    </form>
    <a class="h-to" href="/teachers">Учителям</a>
  </div>
</header>

<main class="wrap h-main">
<div id="h-results" class="h-narrow" aria-live="polite" hidden></div>
<div id="h-page">
${body}
</div>
</main>

${siteFooter(t, 'ru', ctx.footLearn)}
</body>
</html>
`;
}

const catGrid = (cats, ctx) =>
  `<div class="h-cats">${cats
    .map(
      (c) =>
        `<a class="h-cat" href="${catUrl(c)}"><span class="h-ic">${svg(ICON_PATHS[c.icon] || ICON_PATHS.start)}</span><span><b>${esc(c.title)}</b><small>${esc(c.description)} · ${ctx.questions.filter((q) => q.category === c.id).length}</small></span></a>`
    )
    .join('')}</div>`;

// ─── Страницы ─────────────────────────────────────────────────────────────────

function hubPage(ctx) {
  const { home, videos } = ctx;
  // Один список частых вопросов: сначала то, что нужно срочно на уроке, без повторов
  const faq = [...home.urgent, ...home.popular]
    .filter((q, i, all) => all.indexOf(q) === i)
    .slice(0, 8);
  const body = `<h1>Чем помочь?</h1>
<p class="lead h-lead">Впервые во Flashly — пройдите 4 шага ниже. Есть вопрос — напишите его в поиске вверху.</p>

<section id="start" aria-labelledby="h-first">
  <div class="h-sh"><h2 id="h-first">Начните здесь</h2><span class="overline h-muted" id="h-first-count"></span></div>
  <ol class="h-path">${home.firstSteps
    .map(
      (q) =>
        `<li><a class="h-step" href="${qUrl(q)}" data-slug="${q.slug}"><b>${esc(q.question.replace(/\?$/, ''))}</b><span>${esc(q.answer)}</span>${hasVideo(q) ? `<small>▶ Ролик · ${esc(q.video.duration || '')}</small>` : ''}</a></li>`
    )
    .join('')}</ol>
</section>
${
  videos.length
    ? `
<section id="reels" aria-labelledby="h-reels-h">
  <div class="h-sh"><h2 id="h-reels-h">Короткие ролики</h2></div>
  <div class="h-reels">${videos
    .map((q) =>
      q.video.poster
        ? // Своя обложка уже с заголовком — текст поверх не дублируем
          `<button class="h-reel h-reel-own" type="button" data-video="${q.slug}" data-slug="${q.slug}" style="background-image:url('${poster(q)}')" aria-label="Ролик: ${esc(q.question)}, ${esc(q.video.duration || '')}"><span class="h-pl">${PLAY}</span><small>${esc(q.video.duration || '')}</small></button>`
        : `<button class="h-reel" type="button" data-video="${q.slug}" data-slug="${q.slug}" style="background-image:linear-gradient(180deg,rgba(17,17,40,0) 40%,rgba(17,17,40,.85)),url('${poster(q)}')" aria-label="Ролик: ${esc(q.question)}, ${esc(q.video.duration || '')}"><span class="h-pl">${PLAY}</span><b>${esc(q.question)}</b><small>${esc(q.video.duration || '')}</small></button>`
    )
    .join('')}</div>
</section>`
    : ''
}

<section id="faq" aria-labelledby="h-pop">
  <div class="h-sh"><h2 id="h-pop">Частые вопросы</h2></div>
  <p class="h-note">Нажмите на вопрос — ответ откроется здесь же. Метка «на уроке» — то, что бывает нужно срочно.</p>
  <div class="h-list">${faq.map((q) => qRow(q, ctx)).join('')}</div>
</section>

<section id="topics" aria-labelledby="h-topics">
  <div class="h-sh"><h2 id="h-topics">Все темы</h2></div>
  ${catGrid(ctx.categories, ctx)}
</section>

${supportBlock()}`;
  return layout(ctx, {
    url: BASE,
    title: 'Помощь учителю Flashly: ответы и короткие ролики',
    description:
      'Как пригласить учеников, создать набор, подключить учебник и провести живой тест. Короткие ответы, шаги и ролики для учителей.',
    graph: [
      breadcrumbLd([
        ['/', 'Главная'],
        ['/teachers', 'Учителям'],
        [BASE, 'Помощь учителю'],
      ]),
      {
        '@type': 'CollectionPage',
        name: 'Помощь учителю Flashly',
        url: ORIGIN + BASE,
        inLanguage: 'ru',
        hasPart: ctx.categories.map((c) => ({
          '@type': 'WebPage',
          name: c.title,
          url: ORIGIN + catUrl(c),
        })),
      },
    ],
    body,
  });
}

function categoryPage(c, ctx) {
  const list = ctx.questions.filter((q) => q.category === c.id);
  const others = ctx.categories.filter((o) => o.id !== c.id);
  const allDraft = list.every((q) => q.draft);
  const body = `<div class="h-narrow">
${crumbsNav([
  [BASE, 'Помощь учителю'],
  [catUrl(c), c.title],
])}
<h1>${esc(c.title)}</h1>
<p class="lead h-lead">${esc(c.description)}. Нажмите на вопрос — короткий ответ откроется здесь же.</p>
<div class="h-list">${list.map((q) => qRow(q, ctx)).join('')}</div>
<section aria-labelledby="h-other"><h2 id="h-other" class="h-h2">Другие темы</h2>${catGrid(others, ctx)}</section>
${supportBlock()}
</div>`;
  const published = list.filter((q) => !q.draft);
  return layout(ctx, {
    url: catUrl(c),
    title: `${c.title} — помощь учителю Flashly`,
    description: `${c.description}: ${published
      .slice(0, 3)
      .map((q) => q.question.replace(/\?$/, ''))
      .join('; ')}.`.slice(0, 155),
    noindex: allDraft,
    draft: allDraft,
    graph: [
      breadcrumbLd([
        [BASE, 'Помощь учителю'],
        [catUrl(c), c.title],
      ]),
      ...(published.length
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: published.map((q) => ({
                '@type': 'Question',
                name: q.question,
                acceptedAnswer: { '@type': 'Answer', text: q.answer },
              })),
            },
          ]
        : []),
    ],
    body,
  });
}

function questionPage(q, ctx) {
  const c = ctx.cats.get(q.category);
  const related = (q.related || []).map((s) => ctx.bySlug.get(s)).filter(Boolean);
  const more = related.length
    ? related
    : ctx.questions.filter((o) => o.category === q.category && o.slug !== q.slug).slice(0, 4);
  const v = hasVideo(q);
  const videoCol = v
    ? `<div class="h-vcol">
  <button class="h-video" type="button" data-video="${q.slug}" style="background-image:url('${poster(q)}')" aria-label="Смотреть ролик: ${esc(q.question)}, ${esc(q.video.duration || '')}"><span class="h-play">${PLAY}</span><span class="h-dur">${esc(q.video.duration || '')}</span></button>
  ${
    q.video.chapters?.length
      ? `<div class="h-chapters">${q.video.chapters
          .map(([tm, label]) => {
            const [m, s] = tm.split(':').map(Number);
            return `<button type="button" data-video="${q.slug}" data-start="${m * 60 + s}"><span>${esc(tm)}</span>${esc(label)}</button>`;
          })
          .join('')}</div>`
      : ''
  }
</div>`
    : '';
  const body = `<article class="h-narrow h-article">
${crumbsNav([
  [BASE, 'Помощь учителю'],
  [catUrl(c), c.title],
  [qUrl(q), q.question],
])}
<h1>${esc(q.question)}</h1>
<div class="h-meta">${badges(q, ctx)}</div>
<div class="h-answer"><div class="overline">Коротко</div><p>${esc(q.answer)}</p></div>
${whereLine(q)}
<div class="h-grid${v ? '' : ' h-novid'}">
${videoCol}
<div class="h-scol">
  <h2 class="h-h2">По шагам</h2>
  <ol class="h-steps">${q.steps.map((s) => `<li><div>${esc(s)}</div></li>`).join('')}</ol>
  ${q.platform ? `<p class="h-platform">${esc(q.platform)}</p>` : ''}
  ${q.tips?.length ? `<div class="h-tips"><b>Если не получилось</b><ul>${q.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
</div>
</div>
<div class="h-helpful" id="h-helpful"><span>Помогло?</span><button type="button" data-helpful="1">Да</button><button type="button" data-helpful="0">Нет</button><button type="button" class="h-copy" data-copy="${ORIGIN}${qUrl(q)}">Скопировать ссылку</button></div>
${more.length ? `<section aria-labelledby="h-more"><h2 id="h-more" class="h-h2">Ещё по теме</h2><div class="h-list">${more.map((o) => qRow(o, ctx)).join('')}</div></section>` : ''}
${supportBlock()}
</article>`;
  const title = [...q.question].length + 10 <= 60 ? `${q.question} — Flashly` : q.question;
  const graph = [
    breadcrumbLd([
      [BASE, 'Помощь учителю'],
      [catUrl(c), c.title],
      [qUrl(q), q.question],
    ]),
    {
      '@type': 'Article',
      headline: q.question,
      description: q.answer,
      inLanguage: 'ru',
      url: ORIGIN + qUrl(q),
      dateModified: q.updated,
      author: { '@id': `${ORIGIN}/#organization` },
      publisher: { '@id': `${ORIGIN}/#organization` },
    },
  ];
  if (v)
    graph.push({
      '@type': 'VideoObject',
      name: q.question,
      description: q.answer,
      thumbnailUrl: [poster(q).startsWith('http') ? poster(q) : ORIGIN + poster(q)],
      uploadDate: q.video.uploaded || q.updated,
      duration: isoDuration(q.video.duration),
      embedUrl: `https://www.youtube-nocookie.com/embed/${q.video.youtubeId}`,
      contentUrl: `https://www.youtube.com/shorts/${q.video.youtubeId}`,
    });
  return layout(ctx, {
    url: qUrl(q),
    title,
    description: q.answer,
    noindex: Boolean(q.draft),
    draft: Boolean(q.draft),
    slug: q.slug,
    graph,
    body,
  });
}

/** Данные для поиска и просмотра роликов (help.js) */
function indexJson(ctx) {
  return JSON.stringify({
    questions: ctx.questions.map((q) => ({
      s: q.slug,
      c: ctx.cats.get(q.category).title,
      q: q.question,
      a: q.answer,
      w: q.where,
      k: [q.keywords || '', q.steps.join(' ')].join(' '),
      v: hasVideo(q) ? q.video.duration || '' : '',
      u: q.urgent ? 1 : 0,
      n: q.isNew ? 1 : 0,
      d: q.draft ? 1 : 0,
    })),
    videos: ctx.videos.map((q) => ({
      s: q.slug,
      ss: ctx.questions.filter((o) => o.video?.youtubeId === q.video.youtubeId).map((o) => o.slug),
      q: q.question,
      a: q.answer,
      id: q.video.youtubeId,
      dur: q.video.duration || '',
    })),
  });
}

// ─── Маршруты ─────────────────────────────────────────────────────────────────

function checkRoutes() {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const need = [
    [BASE, '/site/help/index.html'],
    [`${BASE}/c/:cat`, '/site/help/c/:cat.html'],
    [`${BASE}/:slug`, '/site/help/:slug.html'],
  ];
  for (const [source, destination] of need) {
    const rw = vercel.rewrites.find((r) => r.source === source);
    if (!rw) fail(`нет rewrite ${source} → ${destination} в vercel.json`);
    else if (rw.destination !== destination)
      fail(`rewrite ${source} ведёт на ${rw.destination}, нужно ${destination}`);
  }
  const appRedirect = vercel.redirects.find((r) =>
    r.destination.startsWith('https://app.flashlycards.app')
  );
  const inner = appRedirect.source.match(/^\/:path\((.*)\)$/)[1];
  if (new RegExp(`^(?:${inner})$`).test(`${BASE.slice(1)}/x`))
    fail(`${BASE} попадает под редирект на app.flashlycards.app — добавь в исключения`);
}

// ─── Сборка ───────────────────────────────────────────────────────────────────

/**
 * Собирает раздел. pages — статьи из site/pages (для подвала).
 * Возвращает адреса для sitemap и строки для llms.txt (без черновиков).
 */
export function buildHelp(pages) {
  const ctx = load();
  // Один ролик может отвечать на несколько вопросов: в ленте и в просмотре он один раз
  ctx.videos = ctx.questions.filter(
    (q, i, all) =>
      hasVideo(q) && all.findIndex((o) => o.video?.youtubeId === q.video.youtubeId) === i
  );
  ctx.footLearn = footLearnLinks(pages, 'ru');
  checkRoutes();
  for (const c of ctx.categories)
    if ([...`${c.title} — помощь учителю Flashly`].length > 60) fail(`тема ${c.id}: title > 60`);

  fs.rmSync(DEST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DEST, 'c'), { recursive: true });
  for (const f of ['help.css', 'help.js'])
    fs.copyFileSync(path.join(SRC, 'assets', f), path.join(DEST, f));
  if (fs.existsSync(path.join(SRC, 'img')))
    fs.cpSync(path.join(SRC, 'img'), path.join(DEST, 'img'), { recursive: true });

  fs.writeFileSync(path.join(DEST, 'index.html'), hubPage(ctx));
  for (const c of ctx.categories)
    fs.writeFileSync(path.join(DEST, 'c', `${c.id}.html`), categoryPage(c, ctx));
  for (const q of ctx.questions)
    fs.writeFileSync(path.join(DEST, `${q.slug}.html`), questionPage(q, ctx));
  fs.writeFileSync(path.join(DEST, 'index.json'), indexJson(ctx));

  const published = ctx.questions.filter((q) => !q.draft);
  const pubCats = ctx.categories.filter((c) => published.some((q) => q.category === c.id));
  const latest = (list) =>
    list
      .map((q) => q.updated)
      .sort()
      .pop();
  const sitemap = [
    { path: BASE, updated: latest(published), priority: '0.7' },
    ...pubCats.map((c) => ({
      path: catUrl(c),
      updated: latest(published.filter((q) => q.category === c.id)),
      priority: '0.6',
    })),
    ...published.map((q) => ({
      path: qUrl(q),
      updated: q.updated,
      priority: '0.6',
      video: hasVideo(q)
        ? {
            thumb: poster(q).startsWith('http') ? poster(q) : ORIGIN + poster(q),
            title: q.question,
            description: q.answer,
            player: `https://www.youtube-nocookie.com/embed/${q.video.youtubeId}`,
            duration: (() => {
              const [m, s] = String(q.video.duration || '0:00')
                .split(':')
                .map(Number);
              return m * 60 + s;
            })(),
          }
        : null,
    })),
  ];
  const llms = [
    `- [Помощь учителю](${ORIGIN}${BASE}): короткие ответы и ролики для учителей — как работать с курсами, учениками, наборами и учебниками`,
    ...published.map((q) => `- [${q.question}](${ORIGIN}${qUrl(q)}): ${q.answer}`),
  ];
  console.log(
    `build-help: ${ctx.questions.length} вопросов (${ctx.questions.length - published.length} черновиков${PROD ? '' : ' — видны, сборка не для production'}), ${ctx.categories.length} тем, ${ctx.videos.length} роликов`
  );
  return { sitemap, llms };
}
