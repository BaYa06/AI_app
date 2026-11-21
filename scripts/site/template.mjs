/**
 * Общий шаблон страниц flashlycards.app: константы, тексты шапки и подвала, <head>, шапка, подвал.
 * Используют scripts/build-site.mjs (статьи) и scripts/build-help.mjs (раздел «Помощь учителю»,
 * plan/new/teacher_help.md). Изменение здесь меняет все страницы сайта.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = path.join(ROOT, 'public', 'site');
export const ORIGIN = 'https://flashlycards.app';
export const APP_URL = 'https://app.flashlycards.app/';
export const APP_STORE = 'https://apps.apple.com/app/id6808731151';
export const OG_IMAGE = `${ORIGIN}/site/og.png`;

export const T = {
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
      ['/teachers/help', 'Помощь учителю'],
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

export const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const stripTags = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Ошибка сборки: печатаем и ставим код выхода 1, сборка продолжает искать остальные ошибки */
export const makeFail = (name) => (msg) => {
  console.error(`${name}: ${msg}`);
  process.exitCode = 1;
};

/** Статьи из site/pages: первая строка — комментарий с JSON-метаданными, дальше тело с h1 */
export function readPages() {
  const src = path.join(ROOT, 'site', 'pages');
  return fs
    .readdirSync(src)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(src, f), 'utf8');
      const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\s*/);
      if (!m) throw new Error(`${f}: нет JSON-метаданных в первом комментарии`);
      const meta = JSON.parse(m[1]);
      return { ...meta, file: f.replace(/\.html$/, ''), body: raw.slice(m[0].length).trim() };
    });
}

export const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="apple" viewBox="0 0 24 24"><path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.61 2.79-.41 6.9 1.15 9.16.77 1.1 1.68 2.34 2.87 2.3 1.15-.05 1.59-.74 2.98-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.12 2.78-2.23.88-1.28 1.24-2.52 1.26-2.59-.03-.01-2.41-.93-2.44-3.68zM14.1 5.96c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z"/></symbol>
  <symbol id="download" viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></symbol>
  <symbol id="globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></symbol>
</svg>`;

/** Платформа ставится классом на <html> до отрисовки — кнопки скачивания не прыгают (CLS) */
export const PLATFORM_SCRIPT =
  "<script>(function(){var u=navigator.userAgent,n=navigator,p=/iPhone|iPad|iPod/.test(u)||(n.platform==='MacIntel'&&n.maxTouchPoints>1)?'ios':/Android/i.test(u)?'android':/Mobi/i.test(u)?'mobile':'desktop';document.documentElement.classList.add('p-'+p)})()</script>";

export function downloadBlock(t) {
  return `<div class="stores">
  <a class="store dl-ios" href="${APP_STORE}"><svg aria-hidden="true" class="fill"><use href="#apple"/></svg><span><small>${t.appStoreSmall}</small><b>App Store</b></span></a>
  <a class="store dl-android" href="${APP_URL}?install=1"><svg aria-hidden="true"><use href="#download"/></svg><span><small>${t.android[0]}</small><b>${t.android[1]}</b></span></a>
  <a class="store store-sec dl-web" href="${APP_URL}"><svg aria-hidden="true"><use href="#globe"/></svg><span><small>${t.web[0]}</small><b>${t.web[1]}</b></span></a>
</div>
<div class="dl-qr"><img src="/site/qr.svg" width="112" height="112" alt="QR-код flashlycards.app" loading="lazy"><span>${t.qr}</span></div>
<p class="meta dl-note">${t.note}</p>`;
}

export function hreflang(alternates) {
  if (!alternates) return '';
  const links = Object.entries(alternates).map(
    ([lang, p]) => `<link rel="alternate" hreflang="${lang}" href="${ORIGIN}${p}">`
  );
  if (alternates.ru)
    links.push(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}${alternates.ru}">`);
  return links.join('\n');
}

/** Издатель — целиком на каждой странице: проверка Rich Results не ходит по @id на другие страницы */
export const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${ORIGIN}/#organization`,
  name: 'Flashly',
  url: ORIGIN + '/',
  logo: `${ORIGIN}/icons/icon-512.png`,
  email: 'support@flashlycards.app',
};

/**
 * Общая часть <head> после charset/viewport: title, description, canonical, hreflang, Open Graph,
 * иконки, стили, скрипт платформы. extra — дополнительные теги (свои стили, JSON-LD).
 */
export function headTags({ t, title, description, url, noindex, alternates, ogType, extra = '' }) {
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
${noindex ? '' : hreflang(alternates)}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Flashly">
<meta property="og:locale" content="${t.locale}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
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
${extra}`;
}

/** Подвал сайта. footLearn — пары [адрес, подпись] для колонки «Изучать» */
export function siteFooter(t, lang, footLearn) {
  const list = (items) =>
    items.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('');
  return `<footer>
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
    <div class="legal"><span>© 2026 Flashly</span><a href="${t.otherLang[0]}" hreflang="${lang === 'ru' ? 'en' : 'ru'}">${t.otherLang[1]}</a></div>
  </div>
</footer>`;
}

/** Ссылки колонки «Изучать»: статьи того же языка без главной */
export function footLearnLinks(pages, lang) {
  const t = T[lang];
  const learn = pages.filter((p) => p.lang === lang && !p.noindex && p.path !== t.home);
  return learn.length ? learn.map((p) => [p.path, p.nav || p.h1 || p.title]) : t.nav;
}
