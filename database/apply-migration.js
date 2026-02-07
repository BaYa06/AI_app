/**
 * Скрипт для применения миграций в Neon PostgreSQL
 * @usage NEON_DATABASE_URL="your-connection-string" node database/apply-migration.js
 */

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

/**
 * Применить одну миграцию
 */
async function applyMigration(sql, migrationFile) {
  const migrationPath = path.join(__dirname, 'migrations', migrationFile);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Файл миграции не найден: ${migrationFile}`);
    return false;
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  try {
    console.log(`\n📄 Применение миграции: ${migrationFile}`);
    console.log('─'.repeat(60));
    
    // Разбиваем на отдельные команды
    const commands = migrationSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      
      // Пропускаем комментарии
      if (command.startsWith('/*') || command.startsWith('--')) {
        continue;
      }

      try {
        await sql(command);
        
        // Показываем краткое описание выполненной команды
        const cmdPreview = command
          .split('\n')[0]
          .substring(0, 60)
          .trim();
        
        console.log(`✅ [${i + 1}/${commands.length}] ${cmdPreview}...`);
      } catch (error) {
        // Игнорируем ошибки "already exists" - миграция уже применена
        if (
          error.message.includes('already exists') ||
          error.message.includes('duplicate')
        ) {
          console.log(`⚠️  [${i + 1}/${commands.length}] Уже существует (пропуск)`);
        } else {
          throw error;
        }
      }
    }

    console.log(`✅ Миграция ${migrationFile} успешно применена!\n`);
    return true;
  } catch (error) {
    console.error(`❌ Ошибка при применении миграции ${migrationFile}:`);
    console.error(error.message);
    return false;
  }
}

/**
 * Основная функция
 */
async function main() {
  console.log('🚀 Neon Database Migration Tool');
  console.log('═'.repeat(60));

  // Проверяем наличие DATABASE_URL
  const DATABASE_URL = process.env.NEON_DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ Не установлена переменная окружения NEON_DATABASE_URL');
    console.error('\nИспользование:');
    console.error('  NEON_DATABASE_URL="postgresql://..." node database/apply-migration.js');
    console.error('\nИли создайте .env файл с:');
    console.error('  NEON_DATABASE_URL=postgresql://...');
    process.exit(1);
  }

  console.log('✅ Подключение к Neon PostgreSQL...');

  const sql = neon(DATABASE_URL);

  // Проверяем подключение
  try {
    await sql`SELECT 1 as test`;
    console.log('✅ Подключение успешно установлено\n');
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:');
    console.error(error.message);
    process.exit(1);
  }

  // Список миграций для применения (в порядке выполнения)
  const migrations = [
    '001_add_learning_step.sql',
    '002_add_courses.sql',
    '003_add_streak_system.sql',
  ];

  let successCount = 0;
  let failCount = 0;

  for (const migration of migrations) {
    const success = await applyMigration(sql, migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Итоговый отчет
  console.log('═'.repeat(60));
  console.log('📊 Итоги применения миграций:');
  console.log(`  ✅ Успешно: ${successCount}`);
  console.log(`  ❌ Ошибок: ${failCount}`);
  console.log('═'.repeat(60));

  if (failCount > 0) {
    console.log('\n⚠️  Некоторые миграции не были применены. Проверьте логи выше.');
    process.exit(1);
  } else {
    console.log('\n🎉 Все миграции успешно применены!');
    console.log('\n📝 Следующие шаги:');
    console.log('  1. Перезапустите приложение');
    console.log('  2. Проверьте синхронизацию данных');
    console.log('  3. Создайте тестовый курс для проверки');
  }
}

// Запуск
main().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
