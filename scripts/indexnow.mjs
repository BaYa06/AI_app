#!/usr/bin/env node
/**
 * IndexNow: сообщить Bing и Яндексу, что страницы flashlycards.app появились или обновились
 * (plan/new/seo_launch.md, SEO 4). Google IndexNow не поддерживает — для него sitemap в Search Console.
 *
 * Запускать после деплоя в Production, когда страницы уже открываются на flashlycards.app:
 *   node scripts/indexnow.mjs              — все адреса из public/site/sitemap.xml
 *   node scripts/indexnow.mjs /teachers /  — только перечисленные
 *   node scripts/indexnow.mjs --dry-run    — показать, что уйдёт, без отправки
 *
 * Ключ — файл public/<ключ>.txt, webpack кладёт его в корень сайта. Ключ публичный по смыслу
 * протокола: поисковик скачивает файл и сверяет, что адреса отправил владелец сайта.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'flashlycards.app';
const ORIGIN = `https://${HOST}`;

const keyFile = fs
  .readdirSync(path.join(ROOT, 'public'))
  .find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error('indexnow: нет файла ключа public/<32 hex>.txt');
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/, '');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const paths = args.filter((a) => a.startsWith('/'));

const sitemap = fs.readFileSync(path.join(ROOT, 'public', 'site', 'sitemap.xml'), 'utf8');
const urlList = paths.length
  ? paths.map((p) => ORIGIN + p)
  : [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const body = { host: HOST, key, keyLocation: `${ORIGIN}/${keyFile}`, urlList };
console.log(`indexnow: ${urlList.length} адресов\n${urlList.join('\n')}`);
if (dryRun) process.exit(0);

// Ключ должен открываться на сайте, иначе поисковик отклонит запрос (403)
const check = await fetch(body.keyLocation);
if (!check.ok || (await check.text()).trim() !== key) {
  console.error(`indexnow: ${body.keyLocation} не отдаёт ключ — сначала деплой в Production`);
  process.exit(1);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
// 200 — принято, 202 — принято, ключ ещё проверяется
console.log(`indexnow: ответ ${res.status} ${res.statusText}`);
if (res.status >= 300) process.exit(1);
