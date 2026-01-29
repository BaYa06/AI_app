import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from './_db-init.js';

/**
 * API для работы с наборами карточек
 * Endpoint: /api/sets
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = neon(process.env.POSTGRES_URL);
  
  // Автоматическая инициализация БД при первом запросе
  await ensureDatabaseInitialized(sql);

  try {
    switch (req.method) {
      case 'GET':
        return await getSets(req, res, sql);
      case 'POST':
        return await createSet(req, res, sql);
      case 'PUT':
        return await updateSet(req, res, sql);
      case 'DELETE':
        return await deleteSet(req, res, sql);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Sets API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Получить все наборы пользователя
async function getSets(req, res, sql) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const sets = await sql`
    SELECT * FROM card_sets 
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;

  return res.status(200).json(sets);
}

// Создать новый набор
async function createSet(req, res, sql) {
  const { userId, title, description, category, languageFrom, languageTo, isPublic } = req.body;

  if (!userId || !title) {
    return res.status(400).json({ error: 'userId and title are required' });
  }

  const result = await sql`
    INSERT INTO card_sets (user_id, title, description, category, language_from, language_to, is_public)
    VALUES (${userId}, ${title}, ${description || ''}, ${category || 'Общие'}, ${languageFrom || 'de'}, ${languageTo || 'ru'}, ${isPublic || false})
    RETURNING *
  `;

  return res.status(201).json(result[0]);
}

// Обновить набор
async function updateSet(req, res, sql) {
  const { id, userId, title, description, category, isPublic } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Проверяем, что набор принадлежит пользователю
  const result = await sql`
    UPDATE card_sets 
    SET 
      title = COALESCE(${title}, title),
      description = COALESCE(${description}, description),
      category = COALESCE(${category}, category),
      is_public = COALESCE(${isPublic}, is_public),
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `;

  if (result.length === 0) {
    return res.status(404).json({ error: 'Set not found or access denied' });
  }

  return res.status(200).json(result[0]);
}

// Удалить набор
async function deleteSet(req, res, sql) {
  const { id, userId } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Удаляем только если набор принадлежит пользователю
  const result = await sql`DELETE FROM card_sets WHERE id = ${id} AND user_id = ${userId} RETURNING id`;

  if (result.length === 0) {
    return res.status(404).json({ error: 'Set not found or access denied' });
  }

  return res.status(200).json({ success: true });
}
