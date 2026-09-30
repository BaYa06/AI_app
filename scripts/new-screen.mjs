#!/usr/bin/env node
/**
 * Новый экран из шаблона (шаг 8.2 плана брендбука).
 *   npm run new:screen -- Achievements   → src/screens/AchievementsScreen.tsx
 * Копирует src/screens/templates/ScreenTemplate.tsx и переименовывает компонент.
 * Дальше: добавить маршрут в src/types/navigation.ts и экран в AppNavigator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.argv[2];

if (!raw || !/^[A-Z][A-Za-z0-9]*$/.test(raw)) {
  console.error('Укажи имя экрана с заглавной буквы: npm run new:screen -- Achievements');
  process.exit(1);
}

const name = raw.endsWith('Screen') ? raw : `${raw}Screen`;
const target = path.join(ROOT, 'src', 'screens', `${name}.tsx`);
if (fs.existsSync(target)) {
  console.error(`Уже есть: ${path.relative(ROOT, target)}`);
  process.exit(1);
}

const template = fs.readFileSync(path.join(ROOT, 'src', 'screens', 'templates', 'ScreenTemplate.tsx'), 'utf8');
const source = template
  .replace(
    /^\/\*\*\n \* ScreenTemplate — [^\n]*\n(?: \*[^\n]*\n)*? \* Шаблон проверяют[^\n]*\n \*\n/m,
    `/**\n * ${name}\n *\n`,
  )
  .replace(/\bScreenTemplate\b/g, name);

fs.writeFileSync(target, source);
console.log(`Создан ${path.relative(ROOT, target)}`);
console.log('Дальше: маршрут в src/types/navigation.ts, экран в src/navigation/AppNavigator.tsx.');
