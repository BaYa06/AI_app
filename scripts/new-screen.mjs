#!/usr/bin/env node
/**
 * Новый экран из шаблона (шаг 8.2 плана брендбука).
 *   npm run new:screen -- Achievements   → src/screens/AchievementsScreen.tsx
 *                                         + src/screens/achievements/styles.ts
 * Копирует src/screens/templates/ScreenTemplate.tsx и переименовывает компонент. Стили — сразу
 * в папке экрана (plan/new/code_cleanup.md, Clean 8): туда же — куски экрана (components/,
 * хуки useXxx.ts), чтобы файл экрана оставался ≤ 400 строк.
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

const template = fs.readFileSync(
  path.join(ROOT, 'src', 'screens', 'templates', 'ScreenTemplate.tsx'),
  'utf8'
);
const source = template
  .replace(
    /^\/\*\*\n \* ScreenTemplate — [^\n]*\n(?: \*[^\n]*\n)*? \* Шаблон проверяют[^\n]*\n \*\n/m,
    `/**\n * ${name}\n *\n`
  )
  .replace(/\bScreenTemplate\b/g, name);

// Стили — в src/screens/<имя>/styles.ts (как у HomeScreen, SetDetailScreen и др.)
const folder = name.replace(/Screen$/, '');
const dir = path.join(ROOT, 'src', 'screens', folder.charAt(0).toLowerCase() + folder.slice(1));
const stylesMatch = source.match(/\nconst styles = StyleSheet\.create\(\{[\s\S]*\n\}\);\n?$/);
if (!stylesMatch) {
  console.error('В шаблоне не найден блок `const styles = StyleSheet.create({…});` в конце файла');
  process.exit(1);
}
const usedConstants = ['spacing', 'borderRadius'].filter((n) =>
  new RegExp(`\\b${n}\\b`).test(stylesMatch[0])
);
const stylesFile = [
  `/** Стили ${name}. */`,
  "import { StyleSheet } from 'react-native';",
  ...(usedConstants.length ? [`import { ${usedConstants.join(', ')} } from '@/constants';`] : []),
  '',
  stylesMatch[0].trim().replace(/^const styles/, 'export const styles'),
  '',
].join('\n');
const screenSource =
  source
    .slice(0, stylesMatch.index)
    .replace("import { StyleSheet } from 'react-native';\n", '')
    .replace(
      "import type { RootStackParamList } from '@/types/navigation';\n",
      "import type { RootStackParamList } from '@/types/navigation';\n" +
        `import { styles } from './${path.basename(dir)}/styles';\n`
    )
    .trimEnd() + '\n';

// Константы, нужные только стилям, из импорта экрана убираем (иначе noUnusedLocals)
const screenFinal = screenSource.replace(
  /^import \{ ([^}]+) \} from '@\/constants';\n/m,
  (line, names) => {
    // без комментариев: в шапке шаблона слово spacing есть в чек-листе
    const body = screenSource
      .replace(line, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const kept = names
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && new RegExp(`\\b${n}\\b`).test(body));
    return kept.length ? `import { ${kept.join(', ')} } from '@/constants';\n` : '';
  }
);

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'styles.ts'), stylesFile);
fs.writeFileSync(target, screenFinal);
console.log(`Создан ${path.relative(ROOT, target)}`);
console.log(`Создан ${path.relative(ROOT, path.join(dir, 'styles.ts'))}`);
console.log('Дальше: маршрут в src/types/navigation.ts, экран в src/navigation/AppNavigator.tsx.');
