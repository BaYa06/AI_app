/**
 * HTML публичной страницы отчёта `/r/<код>` (plan/new/teacher_cabinet.md, Teacher 53) — по образцу
 * _share-page.js: без входа, светлая и тёмная тема из токенов брендбука, в поиск не попадает.
 * Показывает сохранённый снимок отчёта (api/_report.js). Весь текст экранируется.
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plural(n, one, few, many) {
  const m10 = n % 10,
    m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

/** 2331 → «2 331» */
export function groupDigits(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const ICON_ZAP =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>';

const STYLES = `
:root{--primary:#6467F2;--primary-fill:#6467F2;--on-primary:#FFFFFF;--bg:#F6F7FB;--surface:#FFFFFF;--surface-muted:#F1F5F9;--border:#DBDBE6;--text:#111827;--text2:#6B7280;--success-text:#047857;--success-tint:rgba(16,185,129,0.1);--warning-text:#B45309;--bar1:rgba(100,103,242,0.2);--bar2:rgba(100,103,242,0.55)}
@media (prefers-color-scheme:dark){:root{--primary:#818CF8;--primary-fill:#6366F1;--bg:#101122;--surface:#1A1B30;--surface-muted:#232540;--border:rgba(255,255,255,0.1);--text:#F9FAFB;--text2:#9CA3AF;--success-text:#34D399;--success-tint:rgba(16,185,129,0.15);--warning-text:#FBBF24;--bar1:rgba(129,140,248,0.25);--bar2:rgba(129,140,248,0.55)}}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Roboto,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);font-size:16px;line-height:24px}
.page{max-width:440px;margin:0 auto;padding:24px 16px 32px;min-height:100vh;display:flex;flex-direction:column;gap:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:16px}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.brand{display:flex;align-items:center;gap:8px;font-weight:700}
.logo{width:28px;height:28px;border-radius:8px;background:var(--primary-fill);color:var(--on-primary);display:flex;align-items:center;justify-content:center}
.small{font-size:12px;line-height:16px;color:var(--text2)}
h1{font-size:20px;line-height:28px;font-weight:600;overflow-wrap:anywhere}
.sub{font-size:14px;line-height:20px;color:var(--text2);overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.fig{background:var(--bg);border-radius:12px;padding:12px;display:flex;flex-direction:column}
.fig b{font-size:24px;line-height:32px;font-weight:700}
.fig .ok{color:var(--success-text)}
.overline{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.8px;color:var(--text2)}
.bars{display:flex;align-items:flex-end;gap:8px;height:72px}
.bar{flex:1;border-radius:4px;min-height:3px;background:var(--bar2)}
.bar.low{background:var(--bar1)}
.bar.top{background:var(--primary-fill)}
.labels{display:flex;gap:8px;font-size:12px;line-height:16px;color:var(--text2);text-align:center}
.labels span{flex:1}
.block{display:flex;flex-direction:column;gap:6px}
.unit{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface-muted);border-radius:12px;padding:10px 12px;font-size:14px;line-height:20px;font-weight:600}
.unit.ok{background:var(--success-tint)}
.unit.ok span:last-child{color:var(--success-text)}
.unit span:last-child{color:var(--text2);flex-shrink:0}
.comment{font-size:14px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.footer{font-size:12px;line-height:16px;color:var(--text2);text-align:center}
.footer a{color:var(--text2)}
.error{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center}
.error p{font-size:14px;line-height:20px;color:var(--text2);max-width:320px}
`;

function layout({ title, body }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#6467F2">
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="page">
${body}
<p class="footer">Отчёт собран учителем в приложении <a href="/">Flashly</a></p>
</main>
</body>
</html>`;
}

const fig = (value, label, ok = false) =>
  `<div class="fig"><b${ok ? ' class="ok"' : ''}>${esc(value)}</b><span class="small">${esc(label)}</span></div>`;

/** Цифры отчёта: [значение, подпись, зелёным?] — те же для страницы, PDF и превью в приложении */
export function reportFigures(r) {
  const correct = r.correctPct === null || r.correctPct === undefined ? '—' : `${r.correctPct}%`;
  const answers = [
    groupDigits(r.answers),
    `${plural(r.answers, 'ответ', 'ответа', 'ответов')} на карточки`,
    false,
  ];
  const correctFig = [correct, 'верных ответов', (r.correctPct ?? 0) >= 80];
  if (r.kind === 'group') {
    return [
      [`${r.activeStudents} из ${r.students}`, 'учеников занимались', false],
      [
        String(r.inactive.length),
        `${plural(r.inactive.length, 'не заходит', 'не заходят', 'не заходят')} 7+ дней`,
        false,
      ],
      answers,
      correctFig,
    ];
  }
  return [
    [String(r.activeDays), `${plural(r.activeDays, 'день', 'дня', 'дней')} занятий`, false],
    [`${r.streak} ${plural(r.streak, 'день', 'дня', 'дней')}`, 'подряд без пропуска', false],
    answers,
    correctFig,
  ];
}

/** «Ünite 5 · все 50 слов» / «Ünite 5 · 12 из 50 слов» */
export function unitLabel(u) {
  const words = `${u.total} ${plural(u.total, 'слово', 'слова', 'слов')}`;
  return u.seen >= u.total ? `${u.title} · все ${words}` : `${u.title} · ${u.seen} из ${words}`;
}

export function reportSubtitle(r) {
  return [`группа ${r.course}`, r.teacher].filter(Boolean).join(' · ');
}

/** @param {object} r — снимок отчёта (api/_report.js, composeReport) */
export function renderReportPage(r) {
  const title = r.kind === 'group' ? `Группа ${r.course}` : r.student;
  const max = Math.max(0, ...r.weeks.map((w) => w.share));
  const bars = r.weeks.length
    ? `<div class="block">
  <span class="overline">ОТВЕТОВ ЗА НЕДЕЛЮ</span>
  <div class="bars">${r.weeks
    .map(
      (w) =>
        `<div class="bar${w.share === max ? ' top' : w.share < 30 ? ' low' : ''}" style="height:${Math.max(4, w.share)}%"></div>`
    )
    .join('')}</div>
  <div class="labels">${r.weeks.map((w) => `<span>${esc(w.label)} · ${groupDigits(w.answers)}</span>`).join('')}</div>
</div>`
    : '';
  const units =
    r.kind === 'parent' && r.units.length
      ? `<div class="block">${r.units
          .slice(-4)
          .map(
            (u) =>
              `<div class="unit${(u.correctPct ?? 0) >= 80 ? ' ok' : ''}"><span>${esc(unitLabel(u))}</span><span>${u.correctPct === null ? '—' : `${u.correctPct}% верно`}</span></div>`
          )
          .join('')}</div>`
      : '';
  const best =
    r.kind === 'group' && r.best.length
      ? `<div class="block"><span class="overline">ЛУЧШИЕ</span>${r.best
          .map(
            (b) =>
              `<div class="unit ok"><span>${esc(b.name)}</span><span>${groupDigits(b.answers)} · ${b.correctPct === null ? '—' : `${b.correctPct}%`}</span></div>`
          )
          .join('')}</div>`
      : '';
  const inactive =
    r.kind === 'group' && r.inactive.length
      ? `<div class="block"><span class="overline">НЕ ЗАХОДЯТ 7+ ДНЕЙ</span><p class="sub">${esc(r.inactive.join(', '))}</p></div>`
      : '';
  const comment = r.comment
    ? `<div class="block"><span class="overline">КОММЕНТАРИЙ УЧИТЕЛЯ</span><p class="comment">${esc(r.comment)}</p></div>`
    : '';
  const body = `
<section class="card">
  <div class="top">
    <div class="brand"><span class="logo">${ICON_ZAP}</span><span>Flashly</span></div>
    <span class="small">${esc(r.periodLabel)}</span>
  </div>
  <div>
    <h1>${esc(title)}</h1>
    <p class="sub">${esc(r.kind === 'group' ? r.teacher || '' : reportSubtitle(r))}</p>
  </div>
  <div class="grid">${reportFigures(r)
    .map(([value, label, ok]) => fig(value, label, ok))
    .join('')}</div>
  ${bars}
  ${units}
  ${best}
  ${inactive}
  ${comment}
</section>`;
  return layout({ title: `Отчёт: ${title} · Flashly`, body });
}

export function renderReportErrorPage() {
  return layout({
    title: 'Ссылка больше не действует · Flashly',
    body: `
<section class="error">
  <h1>Ссылка больше не действует</h1>
  <p>Отчёт доступен 30 дней или пока учитель не закрыл ссылку. Попроси учителя прислать новую.</p>
</section>`,
  });
}
