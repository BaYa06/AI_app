import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized, initDatabase } from './_db-init.js';

/**
 * Vercel Serverless Function для работы с Neon PostgreSQL
 * Endpoint: /api/db
 */

export default async function handler(req, res) {
  // CORS headers для React Native
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const sql = neon(process.env.POSTGRES_URL);

    // GET - проверить статус БД
    if (req.method === 'GET') {
      await ensureDatabaseInitialized(sql);
      
      // Подсчитать статистику
      const stats = await sql`
        SELECT 
          (SELECT COUNT(*) FROM users) as users_count,
          (SELECT COUNT(*) FROM card_sets) as sets_count,
          (SELECT COUNT(*) FROM cards) as cards_count,
          (SELECT COUNT(*) FROM reviews) as reviews_count
      `;
      
      return res.status(200).json({ 
        status: 'ok',
        initialized: true,
        stats: stats[0]
      });
    }

    // POST - форсированная инициализация таблиц
    if (req.method === 'POST' && req.body.action === 'init') {
      await initDatabase(sql);
      return res.status(200).json({ success: true, message: 'Database initialized' });
    }

    res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: error.message });
  }
}
