// .cjs, а не .js: в package.json "type": "module", и ESLint 8 не читает
// конфиг через module.exports из .js-файла ESM-пакета.
// Серверные пакеты (api/, scripts/) — в коде приложения запрещены: Metro/webpack утащили бы их
// в сборку (Clean 12).
const SERVER_ONLY_IMPORTS = [
  'firebase-admin',
  '@google/genai',
  '@neondatabase/serverless',
  'dotenv',
].map((name) => ({ name, message: 'Серверный пакет — только в api/ и scripts/ (Clean 12).' }));

module.exports = {
  root: true,
  extends: '@react-native',
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // Форматирование — Clean 4b (отдельный коммит, prettier --check). К тому же
    // eslint-plugin-prettier из @react-native/eslint-config 0.73 несовместим с prettier 3
    // (падает на prettier.resolveConfig.sync).
    'prettier/prettier': 'off',
    // Висячие запятые расставляет prettier (trailingComma: es5); правило из @react-native
    // требует запятые и там, где es5 их не ставит, — два инструмента спорили бы.
    'comma-dangle': 'off',
    // Стиль проекта: однострочное `if (x) return;` допустимо, а когда тело на другой
    // строке — скобки обязательны (иначе легко дописать вторую строку «мимо» if).
    curly: ['warn', 'multi-line'],
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        '@typescript-eslint/no-shadow': ['error'],
        // Как в @react-native, плюс ignoreRestSiblings: `const { userId: _, ...rest } = x` —
        // штатный способ выкинуть поле из объекта, переменная слева не нужна по смыслу.
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
        // any виден в линте, но не блокирует: оставшиеся — ответы API и web-полифилы (Clean 6)
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-shadow': 'off',
        'no-undef': 'off',
        'react-hooks/exhaustive-deps': 'warn',
        'react-native/no-inline-styles': 'off',
      },
    },
    // Сервер (Vercel functions), CLI-скрипты и конфиги — Node, ESM.
    {
      files: [
        'api/**/*.js',
        'scripts/**/*.{js,mjs,ts}',
        'database/**/*.js',
        'server/**/*.js',
        '*.cjs',
        '*.mjs',
      ],
      env: { node: true, es2022: true },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    // Конфиги *.cjs — CommonJS.
    {
      files: ['*.cjs'],
      parserOptions: { sourceType: 'script' },
    },
    // Приложение и сервер пишут логи только через логгер (Clean 3).
    {
      files: ['src/**/*.{js,jsx,ts,tsx}', 'api/**/*.js'],
      rules: { 'no-console': 'error' },
    },
    {
      files: ['src/utils/logger.ts', 'api/_log.js'],
      rules: { 'no-console': 'off' },
    },
    {
      files: ['src/**/*.{js,jsx,ts,tsx}'],
      rules: { 'no-restricted-imports': ['error', { paths: SERVER_ONLY_IMPORTS }] },
    },
    // Экраны, компоненты и хуки не ходят в сеть и в сессию сами (Clean 5): сессия —
    // services/auth/session.ts, запросы — сервисы или services/api/client.ts, Realtime —
    // services/realtime.ts.
    {
      files: [
        'src/screens/**/*.{ts,tsx}',
        'src/components/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              ...SERVER_ONLY_IMPORTS,
              {
                name: '@/services/supabaseClient',
                message:
                  'Сессия — @/services/auth/session, Realtime — @/services/realtime (Clean 5).',
              },
              {
                name: '@/services',
                importNames: ['supabase'],
                message:
                  'Сессия — @/services/auth/session, Realtime — @/services/realtime (Clean 5).',
              },
            ],
            patterns: [
              {
                group: ['**/supabaseClient'],
                message:
                  'Сессия — @/services/auth/session, Realtime — @/services/realtime (Clean 5).',
              },
            ],
          },
        ],
        'no-restricted-globals': [
          'error',
          {
            name: 'fetch',
            message: 'Запросы к API — через сервисы или @/services/api/client (Clean 5).',
          },
        ],
      },
    },
    // Вход и выход — единственные экраны, которым нужен supabase.auth напрямую
    // (signIn*, exchangeCodeForSession, signOut, onAuthStateChange).
    {
      files: [
        'src/screens/SignInScreen.tsx',
        'src/screens/WelcomeScreen.tsx',
        'src/screens/EmailAuthScreen.tsx',
        'src/screens/ProfileScreen.tsx',
      ],
      rules: { 'no-restricted-imports': ['error', { paths: SERVER_ONLY_IMPORTS }] },
    },
  ],
};
