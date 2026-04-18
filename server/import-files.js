import { VertexAI } from '@google-cloud/vertexai';

// POST /import-files
// Called directly from the mobile app (not proxied through Vercel — body can exceed Vercel's 4.5MB limit)
//
// Body:
//   files: Array<
//     | { type: 'binary', name: string, mimeType: 'image/jpeg'|'image/png'|'application/pdf', base64: string }
//     | { type: 'text',   name: string, mimeType: 'text/csv'|'text/tab-separated-values', content: string }
//   >
//   prompt: string   — user instruction ("make question-answer cards", etc.)
//   userId: string
//
// Response: { cards: Array<{ front: string, back: string }>, suggestedTitle: string, count: number }

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'text/csv',
  'text/tab-separated-values',
]);

const TEXT_MIME_TYPES = new Set([
  'text/csv',
  'text/tab-separated-values',
]);

// ~20 MB in base64 ≈ 28 000 000 chars
const MAX_TOTAL_BASE64 = 28_000_000;

function getVertexClient() {
  const saKey = process.env.VERTEX_SA_KEY;
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || 'flashly-485417';
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  if (!saKey) throw new Error('VERTEX_SA_KEY is not set');

  const credentials = JSON.parse(saKey);
  return new VertexAI({ project, location, googleAuthOptions: { credentials } });
}

export async function importFilesHandler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { files, prompt, userId } = req.body || {};

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'files array is required' });
  }
  if (files.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 files allowed' });
  }

  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      return res.status(400).json({ error: `Unsupported file type: ${file.mimeType}` });
    }
    if (file.type === 'binary' && typeof file.base64 !== 'string') {
      return res.status(400).json({ error: `Missing base64 for: ${file.name}` });
    }
    if (file.type === 'text' && typeof file.content !== 'string') {
      return res.status(400).json({ error: `Missing content for: ${file.name}` });
    }
  }

  const totalBase64 = files
    .filter(f => f.type === 'binary')
    .reduce((sum, f) => sum + f.base64.length, 0);

  if (totalBase64 > MAX_TOTAL_BASE64) {
    return res.status(400).json({ error: 'Total file size exceeds 20 MB limit' });
  }

  try {
    const vertexAI = getVertexClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash-001';

    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const systemPrompt = `You are a flashcard generator. The user uploads files (photos, PDFs, CSV/TSV tables) and tells you what to extract.

Return a JSON object with exactly this shape:
{ "title": "short title in the user's language", "cards": [{"front": "...", "back": "..."}] }

Rules:
- Return ONLY the JSON object, no markdown, no extra text
- "front": the word, term, question, or concept
- "back": the definition, answer, or translation
- "title": 2–5 words summarising the content, in the same language as the cards
- Extract as many relevant cards as possible from all files
- For CSV/TSV: treat column headers as context for deciding which column is front and which is back
- If no clear word pairs exist, create question-answer cards from the content`;

    const userInstruction = (typeof prompt === 'string' && prompt.trim())
      ? prompt.trim()
      : 'Extract all terms and create flashcards from these files.';

    // Binary files (images, PDF) → inlineData; text files (CSV, TSV) → plain text block
    const fileParts = files.map(f => {
      if (f.type === 'binary') {
        return { inlineData: { mimeType: f.mimeType, data: f.base64 } };
      }
      const label = TEXT_MIME_TYPES.has(f.mimeType) ? f.mimeType : 'text';
      return { text: `[File: ${f.name} (${label})]\n${f.content}` };
    });

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [...fileParts, { text: userInstruction }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const rawText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const cards = Array.isArray(parsed.cards)
      ? parsed.cards.filter(
          c =>
            c &&
            typeof c.front === 'string' &&
            typeof c.back === 'string' &&
            c.front.trim()
        ).map(c => ({ front: c.front.trim(), back: c.back.trim() }))
      : [];

    const suggestedTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';

    console.log(`[import-files] userId=${userId} files=${files.length} cards=${cards.length}`);

    return res.status(200).json({ cards, suggestedTitle, count: cards.length });
  } catch (error) {
    console.error('[import-files] error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to generate cards: ' + (error?.message || 'Unknown error') });
  }
}
