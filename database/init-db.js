#!/usr/bin/env node

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function initDatabase() {
  try {
    const connectionString = process.env.POSTGRES_URL;
    
    if (!connectionString) {
      console.error('❌ POSTGRES_URL не найден в .env.local');
      process.exit(1);
    }

    console.log('🔌 Подключение к Neon PostgreSQL...');
    console.log(`📍 База: ${connectionString.split('@')[1]?.split('/')[1]?.split('?')[0]}\n`);
    
    const sql = neon(connectionString);

    // ==================== Создание таблиц ====================
    console.log('📋 Создание таблиц...\n');

    // Таблица users
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE,
        display_name VARCHAR(255),
        is_anonymous BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        settings JSONB DEFAULT '{"dailyGoal": 20, "notifications": false, "theme": "light"}'::jsonb
      )
    `;
    console.log('  ✅ Таблица users');

    // Таблица card_sets
    await sql`
      CREATE TABLE IF NOT EXISTS card_sets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        language_from VARCHAR(10) DEFAULT 'de',
        language_to VARCHAR(10) DEFAULT 'ru',
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        total_cards INTEGER DEFAULT 0,
        mastered_cards INTEGER DEFAULT 0,
        studying_cards INTEGER DEFAULT 0
      )
    `;
    console.log('  ✅ Таблица card_sets');

    // Таблица cards
    await sql`
      CREATE TABLE IF NOT EXISTS cards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        set_id UUID REFERENCES card_sets(id) ON DELETE CASCADE,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        example TEXT,
        image_url TEXT,
        audio_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        interval INTEGER DEFAULT 0,
        ease_factor DECIMAL(3,2) DEFAULT 2.5,
        repetitions INTEGER DEFAULT 0,
        next_review TIMESTAMP DEFAULT NOW(),
        last_reviewed TIMESTAMP,
        status VARCHAR(20) DEFAULT 'new'
      )
    `;
    console.log('  ✅ Таблица cards');

    // Таблица reviews
    await sql`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        quality INTEGER NOT NULL,
        reviewed_at TIMESTAMP DEFAULT NOW(),
        time_spent INTEGER
      )
    `;
    console.log('  ✅ Таблица reviews\n');

    // ==================== Создание индексов ====================
    console.log('🔍 Создание индексов...\n');

    await sql`CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_card_sets_user_id ON card_sets(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id)`;
    
    console.log('  ✅ 4 индекса созданы\n');

    // ==================== Добавление данных ====================
    console.log('📝 Добавление тестовых данных...\n');

    // Создаем тестового пользователя
    await sql`
      INSERT INTO users (id, email, display_name, is_anonymous)
      VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Тестовый пользователь', false)
      ON CONFLICT (id) DO NOTHING
    `;
    console.log('  ✅ Пользователь создан');

    // Создаем наборы карточек
    await sql`
      INSERT INTO card_sets (id, user_id, title, description, category, language_from, language_to, is_public, total_cards)
      VALUES 
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Путешествия (A1)', 'Основные фразы для путешествий', 'Путешествия', 'de', 'ru', true, 10),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Еда и напитки (A1)', 'Слова по теме еда', 'Еда', 'de', 'ru', true, 10),
        ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Приветствия (A1)', 'Базовые приветствия', 'Общие', 'de', 'ru', true, 8)
      ON CONFLICT (id) DO NOTHING
    `;
    console.log('  ✅ 3 набора карточек созданы');

    // Набор 1: Путешествия
    await sql`
      INSERT INTO cards (set_id, front, back, example, status)
      VALUES 
        ('10000000-0000-0000-0000-000000000001', 'Guten Tag', 'Добрый день', 'Guten Tag! Wie geht es Ihnen?', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'die Fahrkarte', 'билет', 'Ich brauche eine Fahrkarte nach Berlin.', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'der Bahnhof', 'вокзал', 'Wo ist der Bahnhof?', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'der Flughafen', 'аэропорт', 'Der Flughafen ist groß.', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'das Hotel', 'отель', 'Ich suche ein Hotel.', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'das Zimmer', 'номер (комната)', 'Ich möchte ein Zimmer reservieren.', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'der Koffer', 'чемодан', 'Mein Koffer ist schwer.', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'die Straße', 'улица', 'Welche Straße ist das?', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'die Karte', 'карта', 'Haben Sie eine Karte?', 'new'),
        ('10000000-0000-0000-0000-000000000001', 'der Pass', 'паспорт', 'Ich habe meinen Pass verloren.', 'new')
    `;
    console.log('  ✅ Набор "Путешествия": 10 карточек');

    // Набор 2: Еда и напитки
    await sql`
      INSERT INTO cards (set_id, front, back, example, status)
      VALUES 
        ('10000000-0000-0000-0000-000000000002', 'das Wasser', 'вода', 'Ich möchte ein Glas Wasser.', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'der Kaffee', 'кофе', 'Ein Kaffee, bitte.', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'das Brot', 'хлеб', 'Frisches Brot schmeckt gut.', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'die Milch', 'молоко', 'Milch im Kaffee?', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'der Apfel', 'яблоко', 'Der Apfel ist rot.', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'das Bier', 'пиво', 'Ein Bier, bitte!', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'der Wein', 'вино', 'Rotwein oder Weißwein?', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'die Butter', 'масло', 'Butter aufs Brot.', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'der Käse', 'сыр', 'Ich mag Käse.', 'new'),
        ('10000000-0000-0000-0000-000000000002', 'das Fleisch', 'мясо', 'Ich esse kein Fleisch.', 'new')
    `;
    console.log('  ✅ Набор "Еда и напитки": 10 карточек');

    // Набор 3: Приветствия
    await sql`
      INSERT INTO cards (set_id, front, back, example, status)
      VALUES 
        ('10000000-0000-0000-0000-000000000003', 'Hallo', 'Привет', 'Hallo! Wie geht es dir?', 'new'),
        ('10000000-0000-0000-0000-000000000003', 'Guten Morgen', 'Доброе утро', 'Guten Morgen!', 'new'),
        ('10000000-0000-0000-0000-000000000003', 'Guten Abend', 'Добрый вечер', 'Guten Abend!', 'new'),
        ('10000000-0000-0000-0000-000000000003', 'Auf Wiedersehen', 'До свидания', 'Auf Wiedersehen!', 'new'),
        ('10000000-0000-0000-0000-000000000003', 'Tschüss', 'Пока', 'Tschüss! Bis später!', 'new'),
        ('10000000-0000-0000-0000-000000000003', 'Danke', 'Спасибо', 'Danke schön!', 'new'),
        ('10000000-0000-0000-0000-000000000003', 'Bitte', 'Пожалуйста', 'Bitte sehr!', 'new'),
        ('10000000-0000-0000-0000-000000000003', 'Entschuldigung', 'Извините', 'Entschuldigung!', 'new')
    `;
    console.log('  ✅ Набор "Приветствия": 8 карточек\n');

    // ==================== Проверка ====================
    console.log('📊 Финальная проверка...\n');

    const stats = await sql`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM card_sets) as sets,
        (SELECT COUNT(*) FROM cards) as cards,
        (SELECT COUNT(*) FROM reviews) as reviews
    `;

    console.log(`  👥 Пользователей: ${stats[0].users}`);
    console.log(`  📚 Наборов карточек: ${stats[0].sets}`);
    console.log(`  🃏 Карточек: ${stats[0].cards}`);
    console.log(`  📝 Повторений: ${stats[0].reviews}`);

    console.log('\n✅ База данных успешно инициализирована!');
    console.log('🚀 Теперь можете запустить приложение: npm run web\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    console.error('\nПолная информация об ошибке:');
    console.error(error);
    process.exit(1);
  }
}

initDatabase();
