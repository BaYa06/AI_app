# Настройка Neon PostgreSQL

## Шаг 1: Получение переменных окружения из Vercel

1. Откройте ваш проект в [Vercel Dashboard](https://vercel.com/dashboard)
2. Перейдите в **Settings** → **Environment Variables**
3. Найдите переменные, начинающиеся с `POSTGRES_`
4. Скопируйте их значения

## Шаг 2: Настройка локальной разработки

1. Скопируйте `.env.example` в `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Вставьте значения из Vercel в `.env.local`:
   ```env
   POSTGRES_URL=postgres://user:password@host.neon.tech/dbname?sslmode=require
   POSTGRES_PRISMA_URL=...
   POSTGRES_URL_NO_SSL=...
   POSTGRES_URL_NON_POOLING=...
   POSTGRES_USER=...
   POSTGRES_HOST=...
   POSTGRES_PASSWORD=...
   POSTGRES_DATABASE=...
   ```

## Шаг 3: Инициализация базы данных

После деплоя на Vercel, выполните один раз:

```bash
curl -X POST https://ваш-домен.vercel.app/api/db \
  -H "Content-Type: application/json" \
  -d '{"action":"init"}'
```

Или из React Native приложения:

```typescript
import { apiService } from './src/services/ApiService';

// Вызвать один раз при первом запуске
await apiService.initDatabase();
```

## Шаг 4: Использование в приложении

### Пример: Создание набора

```typescript
import { apiService } from './src/services/ApiService';

// Создать набор
const newSet = await apiService.createSet({
  userId: 'user-uuid',
  title: 'Путешествия (A1)',
  description: 'Основные фразы для путешествий',
  category: 'Путешествия',
  languageFrom: 'de',
  languageTo: 'ru',
  isPublic: false,
});

// Получить все наборы
const sets = await apiService.getSets('user-uuid');

// Создать карточку
const card = await apiService.createCard({
  setId: newSet.id,
  front: 'Guten Tag',
  back: 'Добрый день',
  example: 'Guten Tag! Wie geht es Ihnen?',
});

// Получить карточки для повторения
const dueCards = await apiService.getCards(newSet.id, true);
```

## Структура базы данных

### Таблицы:

1. **users** - пользователи
2. **card_sets** - наборы карточек
3. **cards** - карточки с SRS данными
4. **reviews** - история повторений

### Связи:

- `card_sets.user_id` → `users.id`
- `cards.set_id` → `card_sets.id`
- `reviews.card_id` → `cards.id`
- `reviews.user_id` → `users.id`

## API Endpoints

### Database
- `POST /api/db` - Инициализация БД

### Sets
- `GET /api/sets?userId={uuid}` - Получить наборы
- `POST /api/sets` - Создать набор
- `PUT /api/sets` - Обновить набор
- `DELETE /api/sets?id={uuid}` - Удалить набор

### Cards
- `GET /api/cards?setId={uuid}` - Получить все карточки
- `GET /api/cards?setId={uuid}&dueOnly=true` - Только для повторения
- `POST /api/cards` - Создать карточку
- `PUT /api/cards` - Обновить карточку
- `DELETE /api/cards?id={uuid}&setId={uuid}` - Удалить карточку

## Обновление API_BASE_URL

В файле `/src/services/ApiService.ts` замените:

```typescript
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3000/api' 
  : 'https://ваш-домен.vercel.app/api'; // ← Замените на ваш домен
```
