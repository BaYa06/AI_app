#!/usr/bin/env node
/**
 * Ставит хуки из scripts/git-hooks/ в .git/hooks/ (шаг 8.1 плана брендбука).
 * Запускается на `npm install` (prepare) и вручную: `npm run hooks:install`.
 * Существующие хуки с другими именами (например, pre-push с поднятием версии) не трогает.
 * Без .git (архив, некоторые CI) — тихо выходит.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'scripts', 'git-hooks');

let hooksDir;
try {
  hooksDir = execSync('git rev-parse --git-path hooks', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  process.exit(0);
}
hooksDir = path.resolve(ROOT, hooksDir);
fs.mkdirSync(hooksDir, { recursive: true });

for (const name of fs.readdirSync(SRC)) {
  const target = path.join(hooksDir, name);
  fs.copyFileSync(path.join(SRC, name), target);
  fs.chmodSync(target, 0o755);
  console.log(`git hook: ${name} → ${path.relative(ROOT, target)}`);
}
