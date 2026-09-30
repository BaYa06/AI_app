# Flashcards App

Приложение для изучения с помощью флеш-карточек с системой интервальных повторений (SRS).

## 🚀 Быстрый старт

### Установка зависимостей

```bash
npm install
```

### Запуск на iOS

```bash
cd ios && pod install && cd ..
npm run ios
```

### Запуск на Android

```bash
npm run android
```

## 📁 Структура проекта

```
src/
├── components/          # UI компоненты
│   ├── common/         # Переиспользуемые компоненты (Button, Input, Text)
│   └── cards/          # Компоненты карточек (FlashCard, SetCard)
│
├── screens/            # Экраны приложения
│   ├── HomeScreen      # Главный экран со списком наборов
│   ├── StudyScreen     # Экран изучения карточек
│   ├── SetDetailScreen # Детали набора
│   └── ...
│
├── navigation/         # Навигация (React Navigation)
│
├── store/              # Состояние приложения (Zustand)
│   ├── cardsStore     # Управление карточками
│   ├── setsStore      # Управление наборами
│   ├── studyStore     # Сессия изучения
│   └── settingsStore  # Настройки и тема
│
├── services/           # Бизнес-логика
│   ├── SRSService     # Алгоритм интервальных повторений
│   ├── StorageService # Локальное хранилище (MMKV)
│   └── DatabaseService # Персистентность данных
│
├── types/              # TypeScript типы
├── constants/          # Константы (цвета, отступы, конфиг)
├── hooks/              # Кастомные хуки
└── utils/              # Утилиты
```

## ⚡ Оптимизации производительности

1. **Zustand + Immer** - минимальные ре-рендеры, иммутабельность
2. **MMKV Storage** - самое быстрое локальное хранилище для RN
3. **React.memo** - мемоизация компонентов
4. **FlatList** с оптимизациями:
   - `removeClippedSubviews`
   - `maxToRenderPerBatch`
   - `windowSize`
5. **Reanimated 2** - анимации на UI потоке (60 FPS)
6. **O(1) доступ** - данные хранятся в объектах, не массивах

## 🧩 Расширение

### Как делать экран

Весь интерфейс следует брендбуку: [plan/brandbook.md](plan/brandbook.md) — цвета, шрифты, отступы, иконки, компоненты, тексты.

**Создание:**

```bash
npm run new:screen -- Achievements   # → src/screens/AchievementsScreen.tsx из шаблона
```

Шаблон — [src/screens/templates/ScreenTemplate.tsx](src/screens/templates/ScreenTemplate.tsx): каркас, состояния загрузки, ошибки и пустого экрана, закреплённая кнопка. Дальше:

1. Добавьте маршрут и параметры в `src/types/navigation.ts`
2. Добавьте экран в `src/navigation/AppNavigator.tsx`
3. При необходимости — экспорт в `src/screens/index.ts`

**Чек-лист перед коммитом:**

- [ ] Каркас — `Screen` + `ScreenHeader`; кнопки, поля, списки, окна — только из `@/components/ui`
- [ ] Цвета — только токены `useThemeColors()`: никаких `'#…'`, `rgba`, `isDark ? …`; кнопки с текстом — `primaryFill` + `onPrimary`
- [ ] Текст — `<Text variant="…">`: размеры шкалы (12–40), не меньше 12, веса 400 / 600 / 700
- [ ] Отступы и скругления — `spacing` и `borderRadius` (только `s` / `m` / `l` / `xl` / `full`)
- [ ] Иконки — `lucide-react-native`, без эмодзи (исключения — флаги языков и панель вкладок на Ionicons)
- [ ] Загрузка — `Skeleton`; ошибка — `ErrorState`; пусто — `EmptyState` с подсказкой, что сделать дальше
- [ ] Успех — `toast`; опасное подтверждение — `confirmDialog`; системный `Alert` — только для вопросов с выбором
- [ ] Доступность: у иконки-кнопки есть `accessibilityLabel`, у выбора — `accessibilityState`, зона нажатия ≥ 44 (`hitSlop`)
- [ ] Тексты — на русском и на «ты», числа склоняются через `pluralize` из `@/utils`
- [ ] Экран проверен в светлой и тёмной теме

**Автопроверка:** `npm run brand:check` — таблица нарушений (`-- --details <путь>` — по строкам). Перед коммитом и в CI (Codemagic, GitHub Actions) запускается `--fail-on-new`: коммит и сборка не проходят, если нарушений стало больше, чем в снимке `scripts/brand-baseline.json`. Хук ставится сам на `npm install` (или `npm run hooks:install`). Когда нарушений стало меньше — обновите снимок: `npm run brand:check -- --update-baseline`.

### Добавление нового компонента

1. Создайте файл в `src/components/[category]/`
2. Экспортируйте из `index.ts`

### Добавление нового store

1. Создайте файл в `src/store/`
2. Экспортируйте из `src/store/index.ts`

## 📱 Основные функции

- ✅ Создание и редактирование карточек
- ✅ Организация в наборы
- ✅ Режим изучения с переворачиванием
- ✅ Алгоритм SRS (SM-2)
- ✅ Светлая и темная тема
- ✅ Локальное сохранение данных
- ✅ Статистика прогресса

## 📦 Ключевые зависимости

- **React Native** 0.73
- **TypeScript** 5.3
- **React Navigation** 6
- **Zustand** - state management
- **MMKV** - локальное хранилище
- **Reanimated** 3 - анимации

## 📚 Каталог книг: импорт из Excel

Готовые наборы по учебникам: **Книга → Юнит → Набор**. Книги загружаются локальными скриптами из `scripts/` напрямую в Neon. Скрипты не входят в приложение. План: `plan/book_catalog_plan.md`.

### Настройка (один раз)

В `.env.local` должны быть:
- `DATABASE_URL_UNPOOLED` — строка подключения к Neon.
- `ADMIN_USER_ID` — UUID пользователя с `users.is_admin = true`. Он будет владельцем официальных наборов.

### 1. Шаблон

```bash
npx tsx scripts/create-book-template.ts   # → templates/book_template.xlsx
```

Один файл = одна книга. В шаблоне есть лист «Инструкция».

**Лист «Книга»** — одна строка:

| title | edition | level | subject | language_from | language_to | publisher |
|---|---|---|---|---|---|---|
| Solutions Pre-Intermediate | 3rd | A2 | English | en | ru | Oxford |

Обязательные поля: `title`, `language_from` (язык изучения) и `language_to` (язык перевода: `ru`, `ky`).

**Лист «Карточки»** — одна строка на одно слово:

| unit | unit_title | pages | term | translation | example |
|---|---|---|---|---|---|
| 1 | Feelings | 8–17 | happy | счастливый | I'm happy to see you. |

- `unit`, `unit_title` и `pages` повторяйте в каждой строке юнита одинаково.
- `term` и `translation` обязательны.
- Порядок строк = порядок карточек в приложении.
- Несколько значений перевода пишите через запятую в одной ячейке.
- `translation` и `example` можно менять когда угодно, прогресс учеников сохранится. Если исправить `term`, получится **новая** карточка.

### 2. Проверка и импорт

```bash
npx tsx scripts/import-book.ts book.xlsx --dry-run   # проверка + отчёт, база не меняется
npx tsx scripts/import-book.ts book.xlsx             # импорт (новая книга — черновик)
```

- При ошибках в файле скрипт выводит их список с номерами строк и ничего не записывает.
- Импорт выполняется одной транзакцией, повторный запуск не создаёт дублей.
- Карточки, которых больше нет в Excel, по умолчанию не удаляются, скрипт только выводит их список. `--prune` удаляет их после подтверждения `y`. Вместе с карточками удаляется прогресс учеников по ним.

### 3. Публикация

```bash
npx tsx scripts/publish-book.ts "Solutions Pre-Intermediate" "3rd"              # видна всем
npx tsx scripts/publish-book.ts "Solutions Pre-Intermediate" "3rd" --unpublish  # снова черновик
```

Опубликовать можно и сразу при импорте, флагом `--publish`.

## 🤖 Сборка APK в Codemagic

1. Добавьте в Codemagic group `keystore_credentials` переменные: `CM_KEYSTORE_BASE64` (base64 от release keystore), `CM_KEYSTORE_PASSWORD`, `CM_KEY_ALIAS`, `CM_KEY_PASSWORD`.
2. Пример кодирования keystore локально: `base64 my-release-key.keystore > keystore.b64` и вставьте содержимое в `CM_KEYSTORE_BASE64`.
3. В репозитории уже есть `codemagic.yaml`, workflow `android-apk` использует Node 18 / Java 17, декодирует keystore и запускает `./gradlew clean assembleRelease`.
4. Артефакт после сборки: `android/app/build/outputs/apk/release/app-release.apk`.
