#!/usr/bin/env node

/**
 * Скрипт для инициализации БД и загрузки тестовых данных
 * Использование: node database/load-data.js
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загрузить .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function loadData() {
  try {
    // Проверка наличия переменной окружения
    const connectionString = process.env.POSTGRES_URL;
    
    if (!connectionString) {
      console.error('❌ Ошибка: POSTGRES_URL не найден в переменных окружения');
      console.log('\n📝 Создайте файл .env.local с вашей строкой подключения:');
      console.log('   POSTGRES_URL=postgres://user:password@host.neon.tech/dbname');
      process.exit(1);
    }

    console.log('🔌 Подключение к Neon PostgreSQL...');
    const sql = neon(connectionString);

    // Читаем SQL файл
    const sqlFilePath = join(__dirname, 'init.sql');
    const sqlContent = readFileSync(sqlFilePath, 'utf-8');

    console.log('📄 Загрузка SQL файла...');
    
    // Удаляем комментарии и разбиваем на команды
    const cleanedSQL = sqlContent
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    
    // Разбиваем на команды более аккуратно
    const commands = cleanedSQL
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 10); // Игнорируем пустые или очень короткие

    console.log(`📊 Найдено ${commands.length} SQL команд`);
    console.log('⏳ Выполнение...\n');

    // Выполняем каждую команду
    let tablesCreated = 0;
    let indexesCreated = 0;
    let rowsInserted = 0;
    
    for (const cmd of commands) {
      try {
        await sql.unsafe(cmd);
        
        if (cmd.includes('CREATE TABLE')) {
          tablesCreated++;
          const match = cmd.match(/CREATE TABLE.*?(\w+)\s*\(/);
          if (match) console.log(`  ✅ Таблица: ${match[1]}`);
        } else if (cmd.includes('CREATE INDEX')) {
          indexesCreated++;
        } else if (cmd.includes('INSERT INTO')) {
          const match = cmd.match(/INSERT INTO\s+(\w+)/);
          const count = (cmd.match(/\),\s*\(/g) || []).length + 1;
          rowsInserted += count;
          if (match) console.log(`  ✅ ${match[1]}: +${count} записей`);
        }
      } catch (error) {
        if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
          console.error(`  ❌ Ошибка:`, error.message.slice(0, 100));
        }
      }
    }
    
    console.log(`\n📈 Создано: ${tablesCreated} таблиц, ${indexesCreated} индексов, ${rowsInserted} записей`);

    // Небольшая задержка для применения изменений
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Получаем статистику
    console.log('\n📊 Статистика базы данных:');
    
    try {
      const stats = await sql`
        SELECT 
          (SELECT COUNT(*) FROM users) as users_count,
          (SELECT COUNT(*) FROM card_sets) as sets_count,
          (SELECT COUNT(*) FROM cards) as cards_count
      `;
      
      console.log(`   👥 Пользователей: ${stats[0].users_count}`);
      console.log(`   📚 Наборов: ${stats[0].sets_count}`);
      console.log(`   🃏 Карточек: ${stats[0].cards_count}`);
    } catch (err) {
      // Если ошибка, попробуем просто список таблиц
      console.log('  ⚠️  Проверка через pg_tables...');
      const tables = await sql`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `;
      console.log('   📋 Созданные таблицы:');
      tables.forEach(t => console.log(`      - ${t.tablename}`));
    }

    console.log('\n✅ База данных успешно инициализирована!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

loadData();
