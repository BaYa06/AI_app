import { getAuthedUserId } from '../_auth.js';
import { log } from '../_log.js';

/**
 * Озвучка слова облачным голосом Azure Speech (нейросетевые голоса `…Neural`).
 * Ключ только на сервере: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (swedencentral).
 * Тариф F0 — ~0,5 млн символов в месяц бесплатно; при превышении Azure отвечает 429,
 * клиент тогда говорит голосом телефона/браузера.
 *
 * POST /api/ai?fn=tts  { text, lang: 'en-US', rate?: 1 } → { audioContent: <mp3 base64> }
 * Только для вошедших пользователей — чтобы чужие не тратили лимит.
 */

const MAX_TEXT = 300;
const TIMEOUT_MS = 8_000;

/** Голос на язык. Только обычные `…Neural` — HD-голоса на F0 отключены. */
const VOICES = {
  en: 'en-US-AvaNeural',
  de: 'de-DE-KatjaNeural',
  ru: 'ru-RU-SvetlanaNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  it: 'it-IT-ElsaNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  tr: 'tr-TR-EmelNeural',
};

const escapeXml = (s) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]
  );

export function pickVoice(lang) {
  const base = String(lang || '')
    .toLowerCase()
    .split('-')[0];
  return VOICES[base] || null;
}

export function buildSsml(text, voice, rate = 1) {
  const locale = voice.split('-').slice(0, 2).join('-');
  const percent = Math.round((Math.max(0.5, Math.min(2, Number(rate) || 1)) - 1) * 100);
  return (
    `<speak version='1.0' xml:lang='${locale}'><voice name='${voice}'>` +
    `<prosody rate='${percent >= 0 ? '+' : ''}${percent}%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

export default async function tts(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return res.status(503).json({ error: 'tts_not_configured' });

  const userId = await getAuthedUserId(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'empty_text' });
  if (text.length > MAX_TEXT) return res.status(413).json({ error: 'text_too_long' });

  const voice = pickVoice(req.body?.lang);
  if (!voice) return res.status(400).json({ error: 'unsupported_lang' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const azure = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'flashly-tts',
      },
      body: buildSsml(text, voice, req.body?.rate),
      signal: controller.signal,
    });
    if (!azure.ok) {
      const detail = await azure.text().catch(() => '');
      log.warn('tts', `azure ${azure.status}`, detail.slice(0, 200));
      // 429 — исчерпан месячный лимит F0 или слишком часто; клиент уйдёт на голос устройства
      return res.status(azure.status === 429 ? 429 : 502).json({ error: 'tts_failed' });
    }
    const audio = Buffer.from(await azure.arrayBuffer());
    log.debug('tts', `ok voice=${voice} chars=${text.length} bytes=${audio.length}`);
    return res.status(200).json({ audioContent: audio.toString('base64'), voice });
  } catch (e) {
    log.warn('tts', 'request failed', e);
    return res.status(504).json({ error: 'tts_timeout' });
  } finally {
    clearTimeout(timer);
  }
}
