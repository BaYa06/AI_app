#!/usr/bin/env node
/**
 * Сверяет миграции в api/_db-init.js с файлами database/migrations/*.sql (plan/new/code_cleanup.md, Clean 2).
 *
 * Исполняется _db-init.js, а .sql — история и ручное применение. Скрипт проверяет:
 *  1. у каждой миграции в коде (`log.error('db-init', 'Migration NNN_name failed', e)`) есть файл NNN_name.sql;
 *  2. у каждого комментария `// Migration NNN:` есть такой catch с именем — иначе не понять, какой файл;
 *  3. каждый .sql либо есть в коде, либо в списке старых ручных миграций (MANUAL ниже);
 *  4. SCHEMA_VERSION = schema_<наибольший номер> — иначе миграции не выполнятся на сервере
 *     (так уже было с 038/039, см. комментарий у SCHEMA_VERSION);
 *  5. номера не повторяются (кроме исторического 012).
 *
 * Запуск: `npm run db:check-migrations`. Также в pre-commit, если в коммите _db-init.js или migrations/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_INIT = path.join(ROOT, 'api', '_db-init.js');
const DIR = path.join(ROOT, 'database', 'migrations');

// Применялись вручную до автоматических миграций — в _db-init.js их нет. Список закрыт: новые
// миграции добавляются только в _db-init.js.
const MANUAL = new Set([
  '001_add_learning_step',
  '002_add_courses',
  '003_add_streak_system',
  '004_add_user_name',
  '005_library',
  '006_add_teacher_role',
  '007_course_invites',
  '008_card_progress',
  '009_add_diamond',
  '010_add_onboarding_fields',
  '012_add_join_code',
  '013_course_invites_unique',
  '015_teacher_aggregate_indexes',
  '016_drop_is_disqualified',
  '017_book_catalog',
  '018_protect_official_sets',
]);
const ALLOWED_DUPLICATES = new Set(['012']);

const code = fs.readFileSync(DB_INIT, 'utf8');
const errors = [];

const named = new Set([...code.matchAll(/Migration (\d{3}_[a-z0-9_]+) failed/g)].map((m) => m[1]));
const commented = new Set([...code.matchAll(/\/\/ Migration (\d{3})\b/g)].map((m) => m[1]));
const namedNumbers = new Set([...named].map((n) => n.slice(0, 3)));
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.slice(0, -4));
const fileSet = new Set(files);

for (const name of [...named].sort()) {
  if (!fileSet.has(name)) {
    errors.push(`нет файла database/migrations/${name}.sql для миграции из _db-init.js`);
  }
}

for (const num of [...commented].sort()) {
  if (!namedNumbers.has(num)) {
    errors.push(
      `миграция ${num} в _db-init.js без catch с именем — допиши log.error('db-init', 'Migration ${num}_<имя> failed', e)`
    );
  }
}

for (const name of files.sort()) {
  if (!named.has(name) && !MANUAL.has(name)) {
    errors.push(
      `файл ${name}.sql не применяется: добавь миграцию в api/_db-init.js (catch с 'Migration ${name} failed')`
    );
  }
}

const byNumber = new Map();
for (const name of new Set([...files, ...named])) {
  const num = name.slice(0, 3);
  byNumber.set(num, [...(byNumber.get(num) ?? []), name]);
}
for (const [num, names] of byNumber) {
  if (names.length > 1 && !ALLOWED_DUPLICATES.has(num)) {
    errors.push(`номер ${num} занят несколько раз: ${names.join(', ')}`);
  }
}

const maxNumber = [...namedNumbers].sort().at(-1);
const version = code.match(/const SCHEMA_VERSION = '([^']+)'/)?.[1];
if (!version) {
  errors.push('не найден SCHEMA_VERSION в _db-init.js');
} else if (maxNumber && version !== `schema_${maxNumber}`) {
  errors.push(
    `SCHEMA_VERSION = '${version}', а последняя миграция ${maxNumber} — подними до 'schema_${maxNumber}', ` +
      'иначе на сервере с отметкой старой версии миграции не выполнятся'
  );
}

if (errors.length > 0) {
  console.error('✗ Миграции не сходятся:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `✓ Миграции сходятся: ${named.size} в _db-init.js, ${MANUAL.size} ручных, SCHEMA_VERSION = ${version}`
);
