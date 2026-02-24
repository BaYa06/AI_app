import { neon } from '@neondatabase/serverless';
import { ensureDatabaseInitialized } from '../_db-init.js';

/**
 * Report a library set
 * Endpoint: /api/library/report
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.POSTGRES_URL);
  await ensureDatabaseInitialized(sql);

  try {
    const { userId, librarySetId, reason } = req.body;

    if (!userId || !librarySetId) {
      return res.status(400).json({ error: 'userId and librarySetId are required' });
    }

    await sql`
      INSERT INTO library_reports (user_id, library_set_id, reason)
      VALUES (${userId}, ${librarySetId}, ${reason || null})
    `;

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Library report API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
