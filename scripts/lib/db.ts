/**
 * Подключение к Neon для локальных админ-скриптов каталога книг.
 * Секреты берутся из .env.local (он в .gitignore). Эти скрипты никогда не попадают в бандл
 * приложения: они лежат вне src/ и запускаются только локально через `npx tsx`.
 */

import path from 'path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

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

export async function connect(): Promise<Client> {
  // Neon отдаёт sslmode=require, который pg сейчас трактует как verify-full и предупреждает об этом.
  // Фиксируем verify-full явно — то же строгое поведение, без предупреждения.
  const connectionString = getDatabaseUrl().replace(/([?&])sslmode=(prefer|require|verify-ca)\b/, '$1sslmode=verify-full');
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

export function getAdminUserId(): string {
  const id = (process.env.ADMIN_USER_ID || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Нет ADMIN_USER_ID (UUID владельца официальных наборов) в .env.local');
  }
  return id;
}
