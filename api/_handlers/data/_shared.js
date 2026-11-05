/**
 * api/data.js — Общие проверки и помощники (Clean 10 — перенесено без изменений).
 */
import { HttpError } from '../../_access.js';

export function optString(value, max = 1000) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'string expected');
  return value.slice(0, max);
}

export function isoOrNull(ms) {
  return ms ? new Date(Number(ms)).toISOString() : null;
}
