import { neon } from '@neondatabase/serverless';
import { log } from './_log.js';

/**
 * Landing page для /join/TOKEN
 * Серверный рендер: OG-теги + кнопки "Открыть в приложении" / "Открыть как PWA"
 */
const APP_STORE_URL = 'https://apps.apple.com/app/id6808731151';
/** Код учебного центра: ALFA-DEC-7K (plan/new/center_books.md, Center 5) */
const CENTER_CODE_RE = /^[A-Z0-9]+-[A-Z0-9-]*[A-Z0-9]$/;

export default async function handler(req, res) {
  const { token } = req.query;

  // Ссылка учебного центра: страница для тех, у кого ещё нет приложения. iOS не передаёт ссылку в
  // только что установленное приложение — поэтому код крупно и «Скопировать код». В базу не ходим:
  // открытая страница не должна подтверждать, что код существует (перебор в обход лимита попыток).
  const centerCode = String(token || '').toUpperCase();
  if (centerCode.length >= 5 && centerCode.length <= 14 && CENTER_CODE_RE.test(centerCode)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(renderCenterPage(centerCode));
  }

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send(renderPage({ error: 'Неверная ссылка приглашения' }));
  }

  try {
    const sql = neon(process.env.POSTGRES_URL);

    const result = await sql`
      SELECT
        c.title AS course_title,
        COALESCE(u.display_name, u.user_name, u.email) AS teacher_name
      FROM course_invites ci
      JOIN courses c ON c.id = ci.course_id
      JOIN users u ON u.id = ci.created_by
      WHERE ci.token = ${token}
        AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
    `;

    if (result.length === 0) {
      return res.status(404).send(renderPage({ error: 'Приглашение не найдено или истекло' }));
    }

    const { course_title, teacher_name } = result[0];

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res
      .status(200)
      .send(renderPage({ courseTitle: course_title, teacherName: teacher_name, token }));
  } catch (error) {
    log.error('join', 'Join page error', error);
    return res.status(500).send(renderPage({ error: 'Ошибка сервера' }));
  }
}

function renderPage({ courseTitle, teacherName, token, error }) {
  const title = courseTitle ? `${courseTitle} — Flashly` : 'Приглашение в курс — Flashly';
  const description = courseTitle
    ? `${teacherName} приглашает тебя в курс «${courseTitle}»`
    : 'Присоединяйся к курсу на Flashly';

  const pwaUrl = token
    ? `https://ai-app-seven-zeta.vercel.app/join/${token}`
    : 'https://ai-app-seven-zeta.vercel.app';
  const deepLink = token ? `flashly://join/${token}` : 'flashly://';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#6C5CE7">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">

  <!-- OG Tags -->
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(pwaUrl)}">

  <!-- iOS deep link -->
  <meta name="apple-itunes-app" content="app-id=6808731151, app-argument=${esc(deepLink)}">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0F0F23;
      color: #FFFFFF;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1A1A2E;
      border: 1px solid #2A2A4A;
      border-radius: 20px;
      padding: 32px 24px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      background: rgba(108, 92, 231, 0.15);
      color: #A78BFA;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .teacher {
      color: #94A3B8;
      font-size: 15px;
      margin-bottom: 24px;
    }
    .desc {
      color: #94A3B8;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 28px;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      text-align: center;
      cursor: pointer;
      border: none;
      margin-bottom: 10px;
    }
    .btn-primary {
      background: #6C5CE7;
      color: #FFFFFF;
    }
    .btn-secondary {
      background: rgba(108, 92, 231, 0.12);
      color: #A78BFA;
      border: 1px solid #2A2A4A;
    }
    .error {
      color: #F87171;
      font-size: 16px;
      margin: 20px 0;
    }
    .logo {
      color: #64748B;
      font-size: 13px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    ${
      error
        ? `
      <div class="icon">😔</div>
      <p class="error">${esc(error)}</p>
      <a href="https://ai-app-seven-zeta.vercel.app" class="btn btn-primary">Открыть Flashly</a>
    `
        : `
      <div class="icon">🎓</div>
      <div class="badge">Приглашение в курс</div>
      <h1>${esc(courseTitle)}</h1>
      <p class="teacher">Учитель: ${esc(teacherName)}</p>
      <p class="desc">Присоединяйся к курсу, чтобы изучать материалы учителя с интервальным повторением</p>
      <a href="https://ai-app-seven-zeta.vercel.app/?join=${esc(token)}" class="btn btn-primary">Открыть Flashly</a>
    `
    }
    <p class="logo">Flashly — учи слова эффективно</p>
  </div>

</body>
</html>`;
}

function renderCenterPage(code) {
  const deepLink = `flashly://join/${code}`;
  const pwaUrl = `https://ai-app-seven-zeta.vercel.app/?join=${code}`;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#6467F2">
  <meta name="robots" content="noindex">
  <title>Доступ к книгам учебного центра — Flashly</title>
  <meta name="description" content="Код доступа к книгам учебного центра во Flashly">
  <meta property="og:title" content="Доступ к книгам учебного центра во Flashly">
  <meta property="og:description" content="Скопируй код, установи Flashly и выбери свою книгу">
  <meta name="apple-itunes-app" content="app-id=6808731151, app-argument=${esc(deepLink)}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F3F4FA;
      color: #111827; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background: #fff; border: 1px solid #E3E5EE; border-radius: 20px; padding: 28px 22px; max-width: 400px; width: 100%; }
    h1 { font-size: 24px; line-height: 1.25; margin-bottom: 20px; }
    .code { border: 2px dashed #C7CAF5; background: #F5F6FF; border-radius: 18px; padding: 18px; text-align: center; margin-bottom: 20px; }
    .code small { display: block; font-size: 13px; color: #4B5563; margin-bottom: 8px; }
    .code b { display: block; font: 800 28px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; margin-bottom: 12px; }
    .copy { height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid #C7CAF5; background: #fff; font: 600 15px inherit;
      color: #4338CA; cursor: pointer; }
    ol { padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 22px; }
    .btn { display: block; text-align: center; height: 52px; line-height: 52px; border-radius: 14px; font-weight: 600; font-size: 16px;
      text-decoration: none; margin-bottom: 10px; }
    .store { background: #111827; color: #fff; }
    .open { color: #4F46E5; height: 40px; line-height: 40px; font-size: 14px; }
    .note { font-size: 12px; color: #6B7280; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Тебе открыт доступ к книгам учебного центра во Flashly</h1>
    <div class="code">
      <small>Твой код</small>
      <b id="code">${esc(code)}</b>
      <button class="copy" id="copy" type="button">Скопировать код</button>
    </div>
    <ol>
      <li>Скопируй код.</li>
      <li>Установи Flashly из App Store.</li>
      <li>В приложении нажми «У меня есть код от учителя или центра», затем «Вставить код».</li>
    </ol>
    <a class="btn store" href="${APP_STORE_URL}">Скачать в App Store</a>
    <a class="btn open" href="${esc(deepLink)}">Flashly уже установлен? Открыть в приложении</a>
    <a class="btn open" href="${esc(pwaUrl)}">Открыть в браузере</a>
    <p class="note">Код вводится один раз. Книгу и юнит выберешь сам.</p>
  </main>
  <script>
    document.getElementById('copy').addEventListener('click', function () {
      var btn = this, code = document.getElementById('code').textContent;
      function done() { btn.textContent = 'Код скопирован'; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, function () {});
      } else {
        var r = document.createRange(); r.selectNode(document.getElementById('code'));
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand('copy'); done(); } catch (e) {}
      }
    });
  </script>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
