/**
 * Push Tokens Store (in-memory + file fallback)
 * @description Хранилище FCM push-токенов.
 *
 * В Vercel Serverless Functions файловая система read-only (кроме /tmp),
 * поэтому для production нужно использовать базу данных.
 *
 * === КАК ЗАМЕНИТЬ НА POSTGRESQL/NEON ===
 *
 * 1) Создайте таблицу:
 *    CREATE TABLE push_tokens (
 *      token      TEXT PRIMARY KEY,
 *      platform   TEXT NOT NULL DEFAULT 'web',
 *      user_id    TEXT,
 *      created_at TIMESTAMPTZ DEFAULT now(),
 *      updated_at TIMESTAMPTZ DEFAULT now()
 *    );
 *
 * 2) В subscribe.js:
 *    INSERT INTO push_tokens (token, platform, user_id, updated_at)
 *    VALUES ($1, $2, $3, now())
 *    ON CONFLICT (token) DO UPDATE SET user_id = $3, updated_at = now();
 *
 * 3) В unsubscribe.js:
 *    DELETE FROM push_tokens WHERE token = $1;
 *
 * 4) Удалите этот файл.
 * ========================================
 */

import fs from 'fs';
import path from 'path';

// В Vercel serverless — /tmp единственная writable директория
const isVercel = !!process.env.VERCEL;
const STORE_PATH = isVercel
  ? '/tmp/push-tokens.json'
  : path.join(process.cwd(), '.push-tokens.json');

/**
 * @typedef {{ token: string, platform: string, userId: string|null, createdAt: string, updatedAt: string }} TokenEntry
 */

/**
 * Загружает токены из файла.
 * @returns {TokenEntry[]}
 */
export function loadTokens() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[push-store] Failed to load tokens:', err.message);
  }
  return [];
}

/**
 * Сохраняет токены в файл.
 * @param {TokenEntry[]} tokens
 */
export function saveTokens(tokens) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[push-store] Failed to save tokens:', err.message);
  }
}
