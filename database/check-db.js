#!/usr/bin/env node

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function checkDatabase() {
  try {
    const connectionString = process.env.POSTGRES_URL;
    
    if (!connectionString) {
      console.error('❌ POSTGRES_URL не найден');
      process.exit(1);
    }

    console.log('🔌 Подключение к базе данных...\n');
    const sql = neon(connectionString);

    // Проверяем существование таблиц
    console.log('📋 Проверка таблиц:\n');
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    if (tables.length === 0) {
      console.log('❌ Таблицы не найдены! База данных пуста.\n');
      return;
    }
    
    console.log(`✅ Найдено таблиц: ${tables.length}`);
    tables.forEach(t => console.log(`   - ${t.table_name}`));
    console.log('');

    // Проверяем количество записей в каждой таблице
    console.log('📊 Количество записей:\n');
    
    for (const table of tables) {
      try {
        const count = await sql(`SELECT COUNT(*) as count FROM ${table.table_name}`);
        console.log(`   ${table.table_name}: ${count[0].count} записей`);
      } catch (err) {
        console.log(`   ${table.table_name}: ошибка - ${err.message}`);
      }
    }
    
    console.log('');

    // Проверяем содержимое таблицы users
    if (tables.some(t => t.table_name === 'users')) {
      console.log('👤 Пользователи:\n');
      const users = await sql`SELECT id, email, display_name, is_anonymous FROM users LIMIT 5`;
      if (users.length === 0) {
        console.log('   Пользователей нет');
      } else {
        users.forEach(u => {
          console.log(`   - ${u.display_name || 'Безымянный'} (${u.email || 'нет email'})`);
        });
      }
      console.log('');
    }

    // Проверяем содержимое таблицы card_sets
    if (tables.some(t => t.table_name === 'card_sets')) {
      console.log('📚 Наборы карточек:\n');
      const sets = await sql`SELECT id, title, total_cards FROM card_sets LIMIT 10`;
      if (sets.length === 0) {
        console.log('   Наборов нет');
      } else {
        sets.forEach(s => {
          console.log(`   - ${s.title} (${s.total_cards} карточек)`);
        });
      }
      console.log('');
    }

    // Проверяем содержимое таблицы cards
    if (tables.some(t => t.table_name === 'cards')) {
      console.log('🃏 Карточки (первые 5):\n');
      const cards = await sql`SELECT front, back FROM cards LIMIT 5`;
      if (cards.length === 0) {
        console.log('   Карточек нет');
      } else {
        cards.forEach(c => {
          console.log(`   - ${c.front} → ${c.back}`);
        });
      }
      console.log('');
    }

    console.log('✅ Проверка завершена!');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('Детали:', error);
    process.exit(1);
  }
}

checkDatabase();
