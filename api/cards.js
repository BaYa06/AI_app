import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from './_db-init.js';

/**
 * API для работы с карточками
 * Endpoint: /api/cards
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
        return await getCards(req, res, sql);
      case 'POST':
        return await createCard(req, res, sql);
      case 'PUT':
        return await updateCard(req, res, sql);
      case 'DELETE':
        return await deleteCard(req, res, sql);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Cards API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Получить карточки набора
async function getCards(req, res, sql) {
  const { setId, userId, dueOnly } = req.query;

  if (!setId) {
    return res.status(400).json({ error: 'setId is required' });
  }

  // Проверяем, что набор принадлежит пользователю (если userId передан)
  if (userId) {
    const setCheck = await sql`SELECT id FROM card_sets WHERE id = ${setId} AND user_id = ${userId}`;
    if (setCheck.length === 0) {
      return res.status(404).json({ error: 'Set not found or access denied' });
    }
  }

  let cards;
  if (dueOnly === 'true') {
    // Получить только карточки, готовые к повторению
    cards = await sql`
      SELECT * FROM cards 
      WHERE set_id = ${setId} AND next_review <= NOW()
      ORDER BY next_review ASC
    `;
  } else {
    // Получить все карточки набора
    cards = await sql`
      SELECT * FROM cards 
      WHERE set_id = ${setId}
      ORDER BY created_at DESC
    `;
  }

  return res.status(200).json(cards);
}

// Создать новую карточку
async function createCard(req, res, sql) {
  const { setId, userId, front, back, example, imageUrl, audioUrl } = req.body;

  if (!setId || !front || !back) {
    return res.status(400).json({ error: 'setId, front, and back are required' });
  }

  // Проверяем, что набор принадлежит пользователю (если userId передан)
  if (userId) {
    const setCheck = await sql`SELECT id FROM card_sets WHERE id = ${setId} AND user_id = ${userId}`;
    if (setCheck.length === 0) {
      return res.status(404).json({ error: 'Set not found or access denied' });
    }
  }

  const result = await sql`
    INSERT INTO cards (set_id, front, back, example, image_url, audio_url)
    VALUES (${setId}, ${front}, ${back}, ${example || null}, ${imageUrl || null}, ${audioUrl || null})
    RETURNING *
  `;

  // Обновить счетчик карточек в наборе
  await sql`
    UPDATE card_sets 
    SET total_cards = total_cards + 1
    WHERE id = ${setId}
  `;

  return res.status(201).json(result[0]);
}

// Обновить карточку (включая SRS данные)
async function updateCard(req, res, sql) {
  const { 
    id,
    userId,
    front, 
    back, 
    example,
    learningStep,
    nextReview, 
    lastReviewed, 
    status 
  } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  // Проверяем, что карточка принадлежит набору пользователя (если userId передан)
  if (userId) {
    const cardCheck = await sql`
      SELECT c.id FROM cards c
      INNER JOIN card_sets s ON c.set_id = s.id
      WHERE c.id = ${id} AND s.user_id = ${userId}
    `;
    if (cardCheck.length === 0) {
      return res.status(404).json({ error: 'Card not found or access denied' });
    }
  }

  const result = await sql`
    UPDATE cards 
    SET 
      front = COALESCE(${front}, front),
      back = COALESCE(${back}, back),
      example = COALESCE(${example}, example),
      learning_step = COALESCE(${learningStep}, learning_step),
      next_review = COALESCE(${nextReview}, next_review),
      last_reviewed = COALESCE(${lastReviewed}, last_reviewed),
      status = COALESCE(${status}, status)
    WHERE id = ${id}
    RETURNING *
  `;

  return res.status(200).json(result[0]);
}

// Удалить карточку
async function deleteCard(req, res, sql) {
  const { id, setId, userId } = req.query;

  if (!id || !setId) {
    return res.status(400).json({ error: 'id and setId are required' });
  }

  // Проверяем, что набор принадлежит пользователю (если userId передан)
  if (userId) {
    const setCheck = await sql`SELECT id FROM card_sets WHERE id = ${setId} AND user_id = ${userId}`;
    if (setCheck.length === 0) {
      return res.status(404).json({ error: 'Set not found or access denied' });
    }
  }

  await sql`DELETE FROM cards WHERE id = ${id}`;

  // Обновить счетчик карточек в наборе
  await sql`
    UPDATE card_sets 
    SET total_cards = total_cards - 1
    WHERE id = ${setId}
  `;

  return res.status(200).json({ success: true });
}
