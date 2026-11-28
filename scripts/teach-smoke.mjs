#!/usr/bin/env node
/**
 * Проверка веб-кабинета учителя без входа и сервера (plan/new/web_cabinet.md, Web 28).
 * Открывает каждую страницу кабинета в headless Chrome в режиме `?preview=teacher` (вымышленные данные,
 * только dev-сборка), ждёт отрисовку и проверяет, что на странице есть ожидаемый текст и нет сообщений об ошибке.
 *
 * Использование:
 *   npm run web                 # в одном окне (кабинет на http://localhost:3000/teach)
 *   npm run teach:smoke         # в другом; адрес: TEACH_URL=http://localhost:3055 npm run teach:smoke
 *   CHROME_BIN=/путь/к/chrome   # если Chrome не по умолчанию
 *
 * Это проверка вёрстки и маршрутов, а не боевого входа и API: их проверяют руками по чек-листу.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = (process.env.TEACH_URL || 'http://localhost:3000').replace(/\/$/, '');
const CHROME =
  process.env.CHROME_BIN ||
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);
if (!CHROME) {
  console.error('Не найден Chrome. Укажи путь: CHROME_BIN=/путь/к/chrome npm run teach:smoke');
  process.exit(2);
}

// [адрес, что должно быть на странице]
const ROUTES = [
  ['/teach?preview=teacher', ['Обзор', 'Кому нужна помощь']],
  ['/teach/courses/c1?preview=teacher', ['A2 · вечерняя группа', 'Занятия за неделю']],
  ['/teach/courses/c3?preview=teacher', ['В курсе пока никого нет']],
  ['/teach/courses/c1/students/s0-0?preview=teacher', ['Занятия за 4 недели', 'Юниты']],
  ['/teach/exams?preview=teacher', ['Идут сейчас', 'Черновики', 'Прошедшие']],
  ['/teach/courses/c1/exams/new?preview=teacher', ['Новый экзамен', 'Что получится']],
  ['/teach/exams/draft1?preview=teacher', ['Что увидят ученики', 'Открыть экзамен']],
  ['/teach/exams/wait1?preview=teacher', ['Ждём учеников', 'Как войти']],
  ['/teach/exams/act1?preview=teacher', ['Экзамен идёт', 'Нужно внимание']],
  ['/teach/exams/fin1?preview=teacher', ['Итоги экзамена', 'Средний балл']],
  ['/teach/exams/fin1/questions/w2?preview=teacher', ['Как видели ученики', 'Что сделать']],
  ['/teach/exams/fin1/students/p5?preview=teacher', ['Подготовка', 'Изменить балл']],
  ['/teach/courses/c1/tests/new?preview=teacher', ['Быстрый тест', 'Создать тест']],
  ['/teach/tests/quick1?preview=teacher', ['Ждём учеников', 'Начать тест']],
  ['/teach/tests/quick2?preview=teacher', ['Тест идёт', 'Нужно внимание']],
  ['/teach/tests/quick3?preview=teacher', ['Итоги теста', 'Самые трудные слова']],
  ['/teach/projector/x?preview=teacher', ['Ждём окно учителя']],
  ['/teach/nope?preview=teacher', ['Страница не найдена']],
  ['/teach?preview=guest', ['Привяжи аккаунт']],
  ['/teach?preview=notTeacher', ['только для учителей']],
  ['/teach?preview=error', ['Не получилось войти']],
];

// Сообщения, которых на странице быть не должно
const FORBIDDEN = [
  'Что-то пошло не так',
  'Не получилось загрузить',
  'Cannot read',
  'is not a function',
  'is not defined',
];
// Известный шум dev-сервера: Supabase иногда рвёт блокировку при закрытии страницы — к кабинету не относится
const IGNORE = /signal is aborted without reason/;

let failed = 0;
for (const [route, expected] of ROUTES) {
  const profile = mkdtempSync(path.join(tmpdir(), 'teach-smoke-'));
  let dom = '';
  try {
    dom = execFileSync(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        `--user-data-dir=${profile}`,
        '--window-size=1440,1000',
        '--virtual-time-budget=25000',
        '--dump-dom',
        BASE + route,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 90_000,
        maxBuffer: 50 * 1024 * 1024,
      }
    );
  } catch (e) {
    dom = String(e.stdout || '');
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  const text = dom.replace(IGNORE, '');
  // Подписи разделов набраны заглавными (Overline) — сравниваем без учёта регистра
  const lower = text.toLowerCase();
  const missing = expected.filter((t) => !lower.includes(t.toLowerCase()));
  const bad = FORBIDDEN.filter((t) => text.includes(t));
  if (missing.length || bad.length) {
    failed++;
    console.log(`✗ ${route}`);
    if (missing.length) console.log(`    нет на странице: ${missing.join(' | ')}`);
    if (bad.length) console.log(`    лишнее на странице: ${bad.join(' | ')}`);
  } else {
    console.log(`✓ ${route}`);
  }
}
console.log(
  failed
    ? `\nПровалено страниц: ${failed} из ${ROUTES.length}`
    : `\nВсе ${ROUTES.length} страниц открылись как надо`
);
process.exit(failed ? 1 : 0);
