import { neon } from '@neondatabase/serverless';

/**
 * Проверка и автоматическая инициализация БД
 */
async function ensureDatabaseInitialized(sql) {
  try {
    // Проверяем, существует ли таблица users
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `;
    
    const exists = result[0]?.exists;
    
    if (!exists) {
      console.log('Database not initialized. Creating tables...');
      await initDatabase(sql);
      console.log('Database initialized successfully!');
    }
  } catch (error) {
    console.error('Error checking database:', error);
    // Если произошла ошибка, пытаемся инициализировать
    await initDatabase(sql);
  }
}

/**
 * Инициализация структуры БД
 */
async function initDatabase(sql) {
  // Создание таблицы пользователей
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE,
      display_name VARCHAR(255),
      is_anonymous BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      settings JSONB DEFAULT '{
        "dailyGoal": 20,
        "notifications": false,
        "theme": "light"
      }'::jsonb
    )
  `;

  // Создание таблицы наборов карточек
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

  // Создание таблицы карточек
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
      
      -- Spaced Repetition System данные
      interval INTEGER DEFAULT 0,
      ease_factor DECIMAL(3,2) DEFAULT 2.5,
      repetitions INTEGER DEFAULT 0,
      next_review TIMESTAMP DEFAULT NOW(),
      last_reviewed TIMESTAMP,
      status VARCHAR(20) DEFAULT 'new'
    )
  `;

  // Создание таблицы истории повторений
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

  // Создание индексов для оптимизации
  await sql`CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_card_sets_user_id ON card_sets(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_card_id ON reviews(card_id)`;
}

export { ensureDatabaseInitialized, initDatabase };
