/**
 * Подключение к Neon для локальных админ-скриптов каталога книг.
 * Секреты берутся из .env.local (он в .gitignore). Эти скрипты никогда не попадают в бандл
 * приложения: они лежат вне src/ и запускаются только локально через `npx tsx`.
 *
 * К Neon подключаемся через WebSocket по порту 443 (@neondatabase/serverless Pool), а не по
 * обычному Postgres-порту 5432: в некоторых сетях (мобильный интернет, провайдер) 5432 закрыт,
 * и импорт падал по таймауту. 443 открыт везде, где работает сайт. Транзакции поддерживаются.
 * Локальная база (localhost) — обычным драйвером pg (для тестов).
 */

import path from 'path';
import { config } from 'dotenv';
import { Client } from 'pg';
import { Pool, neonConfig } from '@neondatabase/serverless';

config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

/** Минимальный интерфейс соединения, которым пользуются скрипты. */
export interface Db {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
  end(): Promise<void>;
}

export function getDatabaseUrl(): string {
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
    throw new Error('Нужен Node.js 22+ (встроенный WebSocket) для подключения к Neon через порт 443');
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
