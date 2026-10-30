/**
 * Страница-превью набора по ссылке /s/<code> (plan/new/share_set.md, Share 2).
 * Серверный HTML: OG-теги для превью в мессенджерах, карточки набора и кнопки по платформе.
 * Файл начинается с "_", поэтому Vercel не публикует его как отдельную функцию.
 *
 * Страница одинакова для всех (кэшируется на CDN), поэтому платформу определяет скрипт в <head>:
 * iOS — App Store + «Открыть в приложении» (flashly://share/<code>), остальные — веб-версия.
 */

export const APP_STORE_ID = '6808731151';
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
const PREVIEW_ROWS = 10;

// Как в src/constants/languages.ts (флаги языков — единственные эмодзи, разрешённые брендбуком).
const LANGUAGES = {
  en: ['🇬🇧', 'Английский'],
  de: ['🇩🇪', 'Немецкий'],
  ru: ['🇷🇺', 'Русский'],
  es: ['🇪🇸', 'Испанский'],
  fr: ['🇫🇷', 'Французский'],
  it: ['🇮🇹', 'Итальянский'],
  zh: ['🇨🇳', 'Китайский'],
  ja: ['🇯🇵', 'Японский'],
  ko: ['🇰🇷', 'Корейский'],
  tr: ['🇹🇷', 'Турецкий'],
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function pluralCards(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} карточка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} карточки`;
  return `${n} карточек`;
}

function languageLabel(code) {
  const lang = LANGUAGES[code];
  return lang ? `${lang[0]} ${lang[1]}` : String(code || '').toUpperCase();
}

const ICON_ZAP = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>';
const ICON_BOOK = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>';
const ICON_LAYERS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>';
const ICON_LINK_OFF = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><line x1="8" x2="12" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';

// Токены брендбука (plan/done/brandbook.md, раздел 2): светлая и тёмная тема.
const STYLES = `
:root{--primary:#6467F2;--primary-fill:#6467F2;--primary-pressed:#4F46E5;--on-primary:#FFFFFF;--bg:#FFFFFF;--surface:#FFFFFF;--surface-muted:#F1F5F9;--border:#DBDBE6;--text:#111827;--text2:#6B7280;--text3:#8A8F99;--tint:rgba(100,103,242,0.1)}
@media (prefers-color-scheme:dark){:root{--primary:#818CF8;--primary-fill:#6366F1;--primary-pressed:#4F46E5;--bg:#101122;--surface:#1A1B30;--surface-muted:#232540;--border:rgba(255,255,255,0.1);--text:#F9FAFB;--text2:#9CA3AF;--text3:#8A8F99;--tint:rgba(129,140,248,0.1)}}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Roboto,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);font-size:16px;line-height:24px}
.page{max-width:440px;margin:0 auto;padding:16px 16px 32px;min-height:100vh;display:flex;flex-direction:column;gap:24px}
.brand{display:flex;align-items:center;gap:8px;color:var(--primary);font-weight:700;font-size:18px;line-height:26px;text-decoration:none}
.brand span{color:var(--text)}
.hero{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.deck{width:64px;height:64px;border-radius:16px;background:var(--tint);color:var(--primary);display:flex;align-items:center;justify-content:center}
h1{font-size:24px;line-height:32px;font-weight:700;overflow-wrap:break-word;max-width:100%}
.author{display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;color:var(--text2)}
.avatar{width:24px;height:24px;border-radius:999px;background:#8B5CF6;color:#FFFFFF;font-size:12px;line-height:16px;font-weight:600;display:flex;align-items:center;justify-content:center}
.author b{color:var(--text);font-weight:600}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.chip{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:8px;background:var(--surface-muted);font-size:14px;line-height:20px}
.chip svg{color:var(--text2)}
.desc{font-size:14px;line-height:20px;color:var(--text2);text-align:center;overflow-wrap:break-word;max-width:100%}
.section{display:flex;flex-direction:column;gap:8px}
.overline{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.8px;color:var(--text2)}
.overline small{font-size:12px;font-weight:400;letter-spacing:0;color:var(--text3)}
.cards{list-style:none;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--surface)}
.cards li{display:flex;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)}
.cards li:last-child{border-bottom:none}
.front{font-weight:600;overflow-wrap:break-word}
.back{color:var(--text2);text-align:right;overflow-wrap:break-word}
.more{font-size:14px;line-height:20px;color:var(--text2);text-align:center}
.actions{position:sticky;bottom:0;margin:auto -16px 0;padding:12px 16px calc(16px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
.btn{display:flex;align-items:center;justify-content:center;height:52px;border-radius:12px;font-size:16px;line-height:24px;font-weight:600;text-decoration:none;border:none;cursor:pointer;font-family:inherit;width:100%}
.btn-primary{background:var(--primary-fill);color:var(--on-primary)}
.btn-primary:active{background:var(--primary-pressed)}
.btn-secondary{background:transparent;color:var(--primary);border:1.5px solid var(--primary)}
.btn-quiet{height:44px;background:transparent;color:var(--primary)}
.hint{font-size:12px;line-height:16px;color:var(--text2);text-align:center}
.only-ios{display:none}
.ios .only-ios{display:flex}
.ios .only-other{display:none}
.hint.only-ios{display:none}
.ios .hint.only-ios{display:block}
.link-btn{background:none;border:none;padding:0;font:inherit;font-weight:600;color:var(--primary);cursor:pointer}
.footer{font-size:12px;line-height:16px;color:var(--text3);text-align:center}
.footer a{color:var(--text3)}
.error{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center}
.error .deck{color:var(--text2);background:var(--surface-muted)}
.error h1{font-size:20px;line-height:28px;font-weight:600}
.error p{font-size:14px;line-height:20px;color:var(--text2);max-width:320px}
.toast{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);padding:12px 16px;border-radius:12px;background:#111827;color:#FFFFFF;font-size:14px;line-height:20px;font-weight:600;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
`;

// Ставит класс платформы до отрисовки, чтобы кнопки не «прыгали». iPadOS 13+ притворяется Mac — ловим по тачу.
const PLATFORM_SCRIPT = `(function(){var u=navigator.userAgent||'';var ios=/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1);document.documentElement.className=ios?'ios':'other';})();`;

function layout({ title, description, url, body, itunesArgument }) {
  const ogImage = new URL('/icons/icon-512.png', url).href;
  const banner = itunesArgument
    ? `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${esc(itunesArgument)}">`
    : `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}">`;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#6467F2">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Flashly">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary">
${banner}
<script>${PLATFORM_SCRIPT}</script>
<style>${STYLES}</style>
</head>
<body>
<main class="page">
<a class="brand" href="/" aria-label="Flashly">${ICON_ZAP}<span>Flashly</span></a>
${body}
<p class="footer">Flashly — карточки для изучения слов · <a href="/privacy">Конфиденциальность</a> · <a href="/terms">Условия</a></p>
</main>
</body>
</html>`;
}

/**
 * @param {{ code: string, url: string, set: object, author: { name: string|null }, cards: object[] }} data — то же, что отдаёт action=preview
 */
export function renderSharePage({ code, url, set, author, cards }) {
  const authorName = author.name || 'Пользователь Flashly';
  const count = pluralCards(set.cardsCount);
  const title = `${set.title} — ${count} · Flashly`;
  const sample = cards.slice(0, 5).map((c) => c.front).join(', ');
  const description = `Набор от ${authorName}. Давай учить вместе во Flashly!${sample ? ` ${sample}…` : ''}`;

  const rows = cards.slice(0, PREVIEW_ROWS)
    .map((c) => `<li><span class="front">${esc(c.front)}</span><span class="back">${esc(c.back)}</span></li>`)
    .join('');
  const rest = set.cardsCount - Math.min(cards.length, PREVIEW_ROWS);
  const languages = set.languageFrom && set.languageTo
    ? `<span class="chip">${esc(languageLabel(set.languageFrom))} → ${esc(languageLabel(set.languageTo))}</span>`
    : '';
  const deepLink = `flashly://share/${code}`;

  const body = `
<section class="hero">
  <div class="deck">${ICON_BOOK}</div>
  <h1>${esc(set.title)}</h1>
  <div class="author"><span class="avatar" aria-hidden="true">${esc(authorName.trim().charAt(0).toUpperCase())}</span><span>Набор от <b>${esc(authorName)}</b></span></div>
  <div class="chips">${languages}<span class="chip">${ICON_LAYERS}${esc(count)}</span></div>
  ${set.description ? `<p class="desc">${esc(set.description)}</p>` : ''}
</section>
<section class="section" aria-label="Карточки">
  <div class="overline">КАРТОЧКИ<small>${rest > 0 ? `показаны ${Math.min(cards.length, PREVIEW_ROWS)} из ${set.cardsCount}` : ''}</small></div>
  <ul class="cards">${rows}</ul>
  ${rest > 0 ? `<p class="more">и ещё ${esc(pluralCards(rest))} — в приложении</p>` : ''}
</section>
<section class="actions">
  <a class="btn btn-primary only-ios" href="${APP_STORE_URL}">Скачать Flashly в App Store</a>
  <a class="btn btn-quiet only-ios" href="${esc(deepLink)}">Уже есть Flashly? Открыть набор</a>
  <p class="hint only-ios">После установки нажми на ссылку ещё раз или в приложении: «Наборы» → «Добавить набор по ссылке». <button class="link-btn" id="copy" type="button">Скопировать ссылку</button></p>
  <a class="btn btn-primary only-other" href="/?share=${esc(code)}">Открыть в Flashly</a>
  <p class="hint only-other">Работает прямо в браузере — без установки</p>
</section>
<div class="toast" id="toast" role="status" aria-live="polite">Ссылка скопирована</div>
<script>
document.getElementById('copy').addEventListener('click', function () {
  var url = ${JSON.stringify(url)};
  var done = function () { var t = document.getElementById('toast'); t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2000); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () {}); else { var i = document.createElement('input'); i.value = url; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); done(); }
});
</script>`;

  return layout({ title, description, url, body, itunesArgument: url });
}

/** @param {'not_found'|'disabled'} reason */
export function renderShareErrorPage(reason, url) {
  const heading = reason === 'disabled' ? 'Ссылка больше не действует' : 'Набор не найден';
  const text = reason === 'disabled'
    ? 'Автор закрыл доступ к этому набору. Попроси автора прислать новую ссылку.'
    : 'Возможно, автор удалил набор или в ссылке ошибка.';
  const body = `
<section class="error">
  <div class="deck">${ICON_LINK_OFF}</div>
  <h1>${heading}</h1>
  <p>${text}</p>
</section>
<section class="actions">
  <a class="btn btn-primary only-ios" href="${APP_STORE_URL}">Скачать Flashly в App Store</a>
  <a class="btn btn-primary only-other" href="/">Открыть Flashly</a>
</section>`;
  return layout({ title: `${heading} · Flashly`, description: 'Flashly — карточки для изучения слов', url, body });
}
