/**
 * Подключение к Neon для локальных админ-скриптов каталога книг.
 * Секреты берутся из .env.local (он в .gitignore). Эти скрипты никогда не попадают в бандл
 * приложения: они лежат вне src/ и запускаются только локально через `npx tsx`.
 *
 * К Neon подключаемся через WebSocket по порту 443 (@neondatabase/serverless Pool), а не по
 * обычному Postgres-порту 5432: в некоторых сетях (мобильный интернет, провайдер) 5432 закрыт,
 * и импорт падал по таймауту. 443 открыт везде, где работает сайт. Транзакции поддерживаются.
 * Локальная база (localhost) — обычным драйвером pg (для тестов).
 *
 * Флаг --staging (в аргументах скрипта): база берётся только из .env.staging (DATABASE_URL_UNPOOLED
 * или DATABASE_URL), без запасных вариантов из .env.local — иначе при пустом файле скрипт молча ушёл бы
 * в прод. Хост обязан быть staging-endpoint'ом. Остальные переменные (LIBRARY_AUTHOR_ID…) — из .env.local.
 * .env.staging закрыт в .gitignore правилом `.env.*`.
 */

import fs from 'fs';
import path from 'path';
import { config, parse } from 'dotenv';
import { Client } from 'pg';
import { Pool, neonConfig } from '@neondatabase/serverless';

config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

/** Минимальный интерфейс соединения, которым пользуются скрипты. */
export interface Db {
  query<R = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null }>;
  end(): Promise<void>;
}

/** Endpoint'ы Neon (проект flashcards_ai). Прод — ветка main, staging — ветка staging. */
const PROD_ENDPOINTS = ['ep-misty-scene-ahkv29p5'];
const STAGING_ENDPOINTS = ['ep-wild-king-ah80ir3s'];
const STAGING_FILE = '.env.staging';

/** Скрипт запущен с --staging: база только из .env.staging. */
export const isStagingRun = process.argv.includes('--staging');

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getStagingUrl(): string {
  const file = path.resolve(process.cwd(), STAGING_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(
      `--staging: нет файла ${STAGING_FILE}. Создайте его с одной строкой DATABASE_URL_UNPOOLED='<строка staging>'`
    );
  }
  const vars = parse(fs.readFileSync(file));
  const url = vars.DATABASE_URL_UNPOOLED || vars.DATABASE_URL;
  if (!url) throw new Error(`--staging: в ${STAGING_FILE} нет DATABASE_URL_UNPOOLED`);
  const host = hostOf(url);
  if (!STAGING_ENDPOINTS.some((ep) => host.startsWith(ep))) {
    throw new Error(
      `--staging: в ${STAGING_FILE} не staging-база (${host || 'не разобрать адрес'}). Ожидается ${STAGING_ENDPOINTS.join(', ')}`
    );
  }
  return url;
}

export function getDatabaseUrl(): string {
  if (isStagingRun) return getStagingUrl();
  // Unpooled: транзакции и advisory-lock надёжнее без pgbouncer.
  const url =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('Нет DATABASE_URL_UNPOOLED (или POSTGRES_URL) в .env.local');
  }
  return url;
}

function isLocalDatabase(url: string): boolean {
  return /@(localhost|127\.0\.0\.1)(:|\/)|^postgres(ql)?:\/\/(localhost|127\.0\.0\.1)/.test(url);
}

export async function connect(): Promise<Db> {
  const url = getDatabaseUrl();

  if (isLocalDatabase(url)) {
    const client = new Client({ connectionString: url });
    await client.connect();
    return {
      query: (text, params) => client.query(text, params),
      end: () => client.end(),
    } as Db;
  }

  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error(
      'Нужен Node.js 22+ (встроенный WebSocket) для подключения к Neon через порт 443'
    );
  }
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  return {
    query: (text, params) => client.query(text, params),
    end: async () => {
      client.release();
      await pool.end();
    },
  } as Db;
}

/**
 * Хост базы без логина и пароля — чтобы показать, куда пишет скрипт. Прод — только с явного разрешения:
 * скрипты, которые этим пользуются, без флага --prod с продом не работают.
 */
export function describeDatabaseTarget(): { host: string; isProd: boolean; isStaging: boolean } {
  const host = hostOf(getDatabaseUrl()) || 'неизвестно';
  return {
    host,
    isProd: PROD_ENDPOINTS.some((ep) => host.startsWith(ep)),
    isStaging: STAGING_ENDPOINTS.some((ep) => host.startsWith(ep)),
  };
}

/** Текст ошибки для вывода: у сетевых ошибок (AggregateError) message пустой — берём вложенные. */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    const inner = error.errors
      .map((e: unknown) => (e instanceof Error ? e.message : String(e)))
      .join('; ');
    return `нет соединения с базой (${inner}). Проверьте интернет.`;
  }
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export function getAdminUserId(): string {
  const id = (process.env.ADMIN_USER_ID || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Нет ADMIN_USER_ID (UUID владельца официальных наборов) в .env.local');
  }
  return id;
}

/** Служебный автор наборов библиотеки (scripts/create-library-author.ts). */
export function getLibraryAuthorId(): string {
  const id = (process.env.LIBRARY_AUTHOR_ID || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error(
      'Нет LIBRARY_AUTHOR_ID в .env.local — создайте автора: npx tsx scripts/create-library-author.ts'
    );
  }
  return id;
}
