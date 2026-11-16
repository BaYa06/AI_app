/**
 * Единая Vercel-функция для AI-эндпоинтов (лимит Hobby — 12 функций).
 * Старые адреса (/api/translate-words, /api/context?action=… и т.д.) сохранены через rewrites
 * в vercel.json → /api/ai?fn=<имя>; остальные query-параметры доходят до обработчика как есть.
 *
 * Обработчики грузятся лениво (plan/new/vercel_cpu.md, CPU 2): озвучка (tts) и счётчик (usage)
 * вызываются часто, а @google/genai (~240 мс CPU на холодный старт) им не нужен.
 */
const HANDLERS = {
  'translate-words': () => import('./_ai/translate-words.js'),
  'generate-examples': () => import('./_ai/generate-examples.js'),
  context: () => import('./_ai/context.js'),
  'extract-pdf': () => import('./_ai/extract-pdf.js'),
  'extract-image': () => import('./_ai/extract-image.js'),
  'import-files': () => import('./_ai/import-files.js'),
  usage: () => import('./_ai/usage.js'),
  tts: () => import('./_ai/tts.js'),
};

export default async function handler(req, res) {
  if (!Object.hasOwn(HANDLERS, req.query.fn || '')) {
    return res.status(404).json({ error: 'Unknown AI function' });
  }
  const { default: run } = await HANDLERS[req.query.fn]();
  return run(req, res);
}
