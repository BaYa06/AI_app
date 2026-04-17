# Claude Code — Admin Dashboard Prompt

Вставь этот промпт целиком в начало сессии Claude Code.

---

## Контекст проекта

Ты работаешь над проектом **Flashly** — мобильное приложение для изучения языков через флэшкарточки с системой интервальных повторений (SRS).

Сейчас твоя задача: создать закрытый admin-дашборд на `/admin` роуте (только для основателя), который показывает ключевую статистику по пользователям, монетизации и активности.

---

## Стек

- React Native + TypeScript (Expo)
- Supabase (PostgreSQL, Auth, Storage)
- Vercel (веб-часть и API роуты — здесь и живёт `/admin`)
- Zustand (state management)
- MMKV (локальное хранилище)
- React Navigation
- Reanimated 3 (анимации)
- Google Analytics / Firebase Analytics (аналитика)

---

## Структура проекта

```
src/
├── components/       # UI компоненты (common/, cards/)
├── screens/          # Экраны (HomeScreen, StudyScreen, StatisticsScreen, ...)
├── navigation/       # AppNavigator.tsx
├── store/            # Zustand stores (cardsStore, setsStore, studyStore, settingsStore)
├── services/         # Бизнес-логика (SRSService, StorageService, DatabaseService)
├── api/              # API вызовы к Supabase
├── types/            # TypeScript типы
├── constants/        # Цвета, отступы, конфиг
├── hooks/            # Кастомные хуки
└── utils/            # Утилиты

database/
├── init.sql          # Основная схема БД
├── migrations/       # Миграции (001_..., 002_..., и т.д.)
└── init-db.js        # Скрипт инициализации

api/                  # Vercel API роуты (serverless functions)
plan/                 # Документация и планы фич
```

---

## База данных (Supabase / PostgreSQL)

### Основные таблицы

| Таблица | Ключевые поля |
|---|---|
| `users` | id, email, display_name, is_anonymous, created_at |
| `card_sets` | id, user_id, title, description, category, language_from, language_to, is_public, total_cards |
| `cards` | id, set_id, front, back, example, status, interval, ease_factor, repetitions, next_review, last_reviewed |
| `reviews` | id, card_id, user_id, quality, reviewed_at, time_spent |

### Корпоративный тариф

| Таблица | Ключевые поля |
|---|---|
| `courses` | id, teacher_id, title, description, language, created_at |
| `course_enrollments` | id, course_id, student_id, joined_at, status |
| `course_sets` | id, course_id, set_id, published_at |
| `student_progress` | id, student_id, set_id, course_id, cards_studied, accuracy, last_studied_at, streak |
| `card_stats` | id, card_id, course_id, correct_count, incorrect_count |
| `course_invites` | id, course_id, token, type, expires_at, used_by |

---

## Тарифы

| Тариф | Цена | Описание |
|---|---|---|
| Free | бесплатно | Базовый функционал, лимиты на AI-генерацию |
| Premium | 299₽/мес или 2490₽/год | Без рекламы, AI без лимитов, продвинутая статистика |
| Корпоративный | 990₽/мес или 8990₽/год | Курсы для учителей, статистика по ученикам |

---

## Аналитика (src/services/analytics.ts)

Уже реализованные события:

- `signUp`, `login`
- `studySessionStart`, `studySessionComplete`, `studySessionAbandoned`
- `streakMilestone`, `streakLost`, `streakRestored`
- `aiGenerationStart`, `aiGenerationSuccess`, `aiGenerationError`, `aiLimitReached`
- `paywallShown`, `premiumUpgradeClick`, `premiumPurchase`, `premiumCancelled`
- `courseCreated`, `courseInviteAccepted`, `statsExported`

---

## Задача: Admin Dashboard на `/admin`

### Защита доступа

Доступ только для основателя. Реализовать через env-переменную:

```
ADMIN_USER_ID=<твой UUID из Supabase>
```

В middleware или в начале страницы проверять: текущий залогиненный пользователь === `ADMIN_USER_ID`. Если нет — редирект на главную или 404.

### Что должен показывать дашборд

#### Блок 1 — Главные метрики (4 карточки вверху)

- Всего пользователей (+ сколько за последние 7 дней)
- Платных подписок всего (Premium + Корпоративный)
- Конверсия free → paid в процентах
- Активных пользователей сегодня (открывали приложение)

#### Блок 2 — График регистраций

- Столбчатый график: регистрации по дням за последние 30 дней
- Рядом: разбивка тарифов (Free / Premium / Корпоративный) в виде горизонтальных баров с процентами

#### Блок 3 — Retention

- День 1 / День 7 / День 30 — процент пользователей вернувшихся
- Тепловая карта активности по дням недели (пн–вс)

#### Блок 4 — Монетизация

- MRR (Monthly Recurring Revenue) в рублях
- Сколько раз показывался paywall за последние 7 дней
- Конверсия paywall → покупка в процентах
- Топ-3 источника конверсии (откуда приходят платящие)

#### Блок 5 — Корпоративный тариф

- Количество активных учителей (создали курс и заходили за последние 7 дней)
- Среднее количество учеников на курс
- Количество принятых инвайтов за последнюю неделю

#### Блок 6 — Лента последних событий (реалтайм)

Последние 20 событий в хронологическом порядке:
- Новая регистрация
- Покупка Premium (с суммой)
- Покупка корпоративного тарифа (с суммой)
- AI лимит достигнут (потенциальный покупатель)
- Отмена подписки

### Технические требования

- Страница: `app/admin/page.tsx` (Next.js App Router) или `pages/admin.tsx`
- API роут: `app/api/admin/stats/route.ts` — возвращает все данные одним запросом
- Данные берутся из Supabase напрямую через service role key (не через клиентский SDK)
- Автообновление данных каждые 60 секунд (SWR или простой setInterval + fetch)
- Адаптивная вёрстка: нормально читается и на ноутбуке и на телефоне
- Тёмная тема по умолчанию (или следует системной)

### Запросы к БД для каждого блока

```sql
-- Всего пользователей
SELECT COUNT(*) FROM users;

-- Регистрации за последние 30 дней по дням
SELECT DATE(created_at) as day, COUNT(*) as count
FROM users
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY day ORDER BY day;

-- Активные сегодня (были сессии изучения)
SELECT COUNT(DISTINCT user_id) FROM reviews
WHERE reviewed_at >= CURRENT_DATE;

-- Retention день 7 (когорта пользователей зарегавшихся 7-14 дней назад)
SELECT
  COUNT(DISTINCT r.user_id)::float / COUNT(DISTINCT u.id) as retention_d7
FROM users u
LEFT JOIN reviews r ON r.user_id = u.id
  AND r.reviewed_at >= u.created_at + INTERVAL '6 days'
  AND r.reviewed_at < u.created_at + INTERVAL '8 days'
WHERE u.created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days';

-- Корпоративные учителя активные
SELECT COUNT(DISTINCT teacher_id) FROM courses
WHERE teacher_id IN (
  SELECT DISTINCT user_id FROM reviews
  WHERE reviewed_at >= NOW() - INTERVAL '7 days'
);
```

### Стиль и UI

- Минималистичный дашборд, без лишних украшений
- Цветовая схема: тёмный фон, акцент — фиолетовый (#534AB7 — цвет бренда Flashly)
- Шрифт: системный (Inter или SF Pro)
- Графики: через Recharts или Chart.js (уже может быть в проекте)
- Никакого логина — просто проверка UUID через Supabase сессию

### Что НЕ нужно делать

- Не добавлять новые таблицы в БД — только читаем существующие
- Не трогать мобильное приложение — это только веб-роут
- Не делать экспорт CSV/PDF пока — это следующий этап
- Не добавлять управление пользователями — только просмотр

---

## Порядок выполнения

1. Создай `app/api/admin/stats/route.ts` — один эндпоинт, все данные
2. Создай `app/admin/page.tsx` — страница с проверкой доступа
3. Создай компоненты: `MetricCard`, `RegistrationsChart`, `RetentionGrid`, `EventFeed`
4. Подключи автообновление каждые 60 секунд
5. Проверь что на `/admin` без нужного UUID приходит редирект

Начни с шага 1 — покажи структуру API роута и какие запросы будут выполняться.
