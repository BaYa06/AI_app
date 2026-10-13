import translateWords from './_ai/translate-words.js';
import generateExamples from './_ai/generate-examples.js';
import context from './_ai/context.js';
import extractPdf from './_ai/extract-pdf.js';
import extractImage from './_ai/extract-image.js';
import importFiles from './_ai/import-files.js';
import usage from './_ai/usage.js';

/**
 * Единая Vercel-функция для AI-эндпоинтов (лимит Hobby — 12 функций).
 * Старые адреса (/api/translate-words, /api/context?action=… и т.д.) сохранены через rewrites
 * в vercel.json → /api/ai?fn=<имя>; остальные query-параметры доходят до обработчика как есть.
 */
const HANDLERS = {
  'translate-words': translateWords,
  'generate-examples': generateExamples,
  context,
  'extract-pdf': extractPdf,
  'extract-image': extractImage,
  'import-files': importFiles,
  usage,
};

export default async function handler(req, res) {
  if (!Object.hasOwn(HANDLERS, req.query.fn || '')) {
    return res.status(404).json({ error: 'Unknown AI function' });
  }
  return HANDLERS[req.query.fn](req, res);
}
