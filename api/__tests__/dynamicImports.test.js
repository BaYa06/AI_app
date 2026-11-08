/**
 * Динамические импорты сервера ведут к существующим файлам.
 *
 * После разбиения api/data.js по api/_handlers/ (Clean 9a) два `await import('./push.js')` остались
 * со старым путём: push о серии и об ответе поддержки молча не уходили (ошибка ловится и только пишется
 * в лог). Сборка и остальные тесты такое не видят — файл грузится лишь в момент отправки.
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const API_DIR = path.resolve(process.cwd(), 'api');

function serverFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : serverFiles(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

describe('динамические импорты в api/', () => {
  const imports = serverFiles(API_DIR).flatMap((file) =>
    [...fs.readFileSync(file, 'utf8').matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)].map(
      (m) => ({ file: path.relative(API_DIR, file), spec: m[1] })
    )
  );

  it('находятся', () => {
    expect(imports.length).toBeGreaterThan(0);
  });

  it.each(imports.map((i) => [i.file, i.spec]))('%s → %s существует', (file, spec) => {
    expect(fs.existsSync(path.resolve(API_DIR, path.dirname(file), spec))).toBe(true);
  });
});
