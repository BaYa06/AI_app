# 🗄️ Работа с базой данных

## Быстрая загрузка данных

### 1. Убедитесь, что .env.local содержит NEON_DATABASE_URL

```bash
# Проверьте файл .env.local
cat .env.local | grep NEON_DATABASE_URL
```

Если пусто, скопируйте из Neon Console → Connection Details → Connection String

### 2. Загрузите таблицы и примеры данных

```bash
npm run db:init
```

Это выполнит:
- ✅ Создание всех таблиц (users, card_sets, cards, reviews, courses)
- ✅ Создание индексов
- ✅ Загрузку тестовых данных (3 набора с карточками)

### 3. Примените миграции (для обновления структуры БД)

```bash
# Применить все миграции автоматически
NEON_DATABASE_URL="your-connection-string" node database/apply-migration.js

# Или применить вручную через Neon Console (см. migrations/MIGRATION_GUIDE.md)
```

### Что будет загружено:

**Наборы:**
1. **Путешествия (A1)** - 10 карточек (Guten Tag, der Bahnhof, das Hotel...)
2. **Еда и напитки (A1)** - 10 карточек (das Wasser, der Kaffee, das Brot...)
3. **Приветствия (A1)** - 8 карточек (Hallo, Tschüss, Danke...)

**Всего:** 1 пользователь, 3 набора, 28 карточек

---

## Миграции базы данных

Миграции находятся в папке `database/migrations/`:

- `001_add_learning_step.sql` - Добавление поля learning_step
- `002_add_courses.sql` - **[НОВОЕ]** Добавление курсов (папок для организации наборов)

### Применение миграций:

**Способ 1: Автоматический скрипт (рекомендуется)**
```bash
NEON_DATABASE_URL="postgresql://user:pass@host/db" node database/apply-migration.js
```

**Способ 2: Вручную через Neon Console**
1. Откройте [Neon Console](https://console.neon.tech/)
2. SQL Editor → скопируйте содержимое миграции
3. Run

Подробнее: [migrations/MIGRATION_GUIDE.md](./migrations/MIGRATION_GUIDE.md)

---

## Альтернативный способ: Через psql

Если у вас установлен PostgreSQL клиент:

```bash
# Получите строку подключения из .env.local
export NEON_DATABASE_URL="ваша_строка_подключения"

# Выполните SQL файл
psql $NEON_DATABASE_URL < database/init.sql

# Примените миграции
psql $NEON_DATABASE_URL < database/migrations/001_add_learning_step.sql
psql $NEON_DATABASE_URL < database/migrations/002_add_courses.sql
```

---

## Проверка результата

### Через API (после деплоя на Vercel):

```bash
curl https://ваш-домен.vercel.app/api/db
```

Ответ:
```json
{
  "status": "ok",
  "initialized": true,
  "stats": {
    "users_count": 1,
    "sets_count": 3,
    "cards_count": 28,
    "reviews_count": 0
  }
}
```

### Через приложение:

```typescript
import { apiService } from './src/services/ApiService';

// Получить наборы
const sets = await apiService.getSets('00000000-0000-0000-0000-000000000001');
console.log(sets); // 3 набора

// Получить карточки первого набора
const cards = await apiService.getCards('10000000-0000-0000-0000-000000000001');
console.log(cards); // 10 карточек "Путешествия"
```

---

## Структура файлов

```
database/
├── init.sql          # SQL файл с таблицами и данными
└── load-data.js      # Node.js скрипт для загрузки
```

---

## Troubleshooting

### Ошибка: "POSTGRES_URL not found"

```bash
# Создайте .env.local с вашей строкой подключения
echo "POSTGRES_URL=postgres://user:pass@host.neon.tech/db" > .env.local
```

### Ошибка: "relation already exists"

Это нормально! Скрипт использует `CREATE TABLE IF NOT EXISTS`, поэтому существующие таблицы не будут пересозданы.

### Очистить все данные

```sql
-- Будьте осторожны! Это удалит ВСЕ данные
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS cards CASCADE;
DROP TABLE IF EXISTS card_sets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

Затем запустите `npm run db:init` снова.
