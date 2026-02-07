# Руководство по применению миграций

## Применение миграции 002_add_courses.sql

Эта миграция добавляет поддержку курсов (папок для организации наборов карточек) в базу данных Neon PostgreSQL.

### Что добавляет миграция:

1. **Таблица `courses`** - хранит информацию о курсах
   - `id` (UUID) - уникальный идентификатор курса
   - `user_id` (UUID) - владелец курса
   - `title` (VARCHAR) - название курса
   - `created_at`, `updated_at` - временные метки

2. **Столбец `course_id`** в таблице `card_sets`
   - Связывает наборы карточек с курсами
   - Nullable - существующие наборы могут быть без курса
   - Foreign key с `ON DELETE SET NULL` - при удалении курса наборы остаются, но переходят в "All"

3. **Индексы** для оптимизации запросов
   - `idx_courses_user_id` - быстрый поиск курсов пользователя
   - `idx_card_sets_course_id` - быстрый поиск наборов в курсе

### Способы применения миграции:

#### Способ 1: Через Neon Console (рекомендуется)

1. Откройте [Neon Console](https://console.neon.tech/)
2. Выберите ваш проект
3. Перейдите в раздел **SQL Editor**
4. Скопируйте содержимое файла `002_add_courses.sql`
5. Вставьте в SQL редактор
6. Нажмите **Run** для выполнения

#### Способ 2: Через psql (PostgreSQL CLI)

```bash
# Получите connection string из Neon Console
# Формат: postgresql://user:password@host/database

# Примените миграцию
psql "postgresql://your-connection-string" < database/migrations/002_add_courses.sql
```

#### Способ 3: Через Node.js скрипт

Создайте файл `database/apply-migration.js`:

```javascript
const { neon } = require('@neondatabase/serverless');

async function applyMigration() {
  const DATABASE_URL = process.env.NEON_DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ Не установлена переменная NEON_DATABASE_URL');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  const fs = require('fs');
  const path = require('path');

  const migrationFile = path.join(__dirname, 'migrations', '002_add_courses.sql');
  const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

  try {
    console.log('🔄 Применение миграции 002_add_courses.sql...');
    
    // Разбиваем на отдельные команды по точке с запятой
    const commands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0);

    for (const command of commands) {
      await sql(command);
      console.log('✅ Выполнено:', command.substring(0, 50) + '...');
    }

    console.log('✅ Миграция успешно применена!');
  } catch (error) {
    console.error('❌ Ошибка при применении миграции:', error);
    process.exit(1);
  }
}

applyMigration();
```

Запустите:
```bash
NEON_DATABASE_URL="your-connection-string" node database/apply-migration.js
```

### Проверка успешного применения:

После применения миграции выполните SQL запрос:

```sql
-- Проверка таблицы courses
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'courses';

-- Проверка столбца course_id в card_sets
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'card_sets' AND column_name = 'course_id';

-- Проверка индексов
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename IN ('courses', 'card_sets');
```

Ожидаемый результат:
- Таблица `courses` с 5 столбцами (id, user_id, title, created_at, updated_at)
- Столбец `course_id` в таблице `card_sets`
- Два новых индекса: `idx_courses_user_id` и `idx_card_sets_course_id`

### Откат миграции (если нужно):

Если нужно откатить изменения:

```sql
-- Удаляем столбец course_id из card_sets
ALTER TABLE card_sets DROP COLUMN IF EXISTS course_id;

-- Удаляем таблицу courses
DROP TABLE IF EXISTS courses;
```

**⚠️ ВНИМАНИЕ:** Откат удалит все данные о курсах!

### После применения миграции:

1. Перезапустите приложение
2. Данные из локального хранилища (MMKV) будут автоматически синхронизированы с Neon
3. Все новые курсы будут сохраняться как локально, так и в БД
4. При удалении курса наборы автоматически переместятся в "All" (course_id = NULL)

### Автоматическая синхронизация:

После применения миграции приложение будет:
- ✅ Загружать курсы из Neon при запуске (`DatabaseService.loadAll`)
- ✅ Создавать курсы в Neon (`NeonService.createCourse`)
- ✅ Переименовывать курсы в Neon (`NeonService.renameCourse`)
- ✅ Удалять курсы из Neon (`NeonService.deleteCourse`)
- ✅ Сохранять `course_id` при создании наборов (`NeonService.createSet`)
- ✅ Объединять локальные и удаленные данные при загрузке

### Troubleshooting:

**Ошибка: "relation courses already exists"**
- Миграция уже была применена
- Проверьте наличие таблицы: `SELECT * FROM courses LIMIT 1;`

**Ошибка: "column course_id already exists"**
- Столбец уже был добавлен
- Можно безопасно пропустить эту часть миграции

**Нет подключения к Neon**
- Проверьте переменную окружения `NEON_DATABASE_URL`
- Убедитесь что в `.env` указан правильный connection string
- Проверьте доступность базы: `psql "your-connection-string" -c "SELECT 1;"`
