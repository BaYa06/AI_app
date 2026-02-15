/**
 * Speech helper
 * Google Cloud TTS (API key or service account) with Web Speech fallback.
 * On native (Android/iOS) uses react-native-tts as fallback instead of Web Speech API.
 */

import { Platform } from 'react-native';
import Tts from 'react-native-tts';
import RNFS from 'react-native-fs';
import Sound from 'react-native-sound';

const isNative = Platform.OS !== 'web';

// Initialize native TTS
let nativeTtsReady = false;
if (isNative) {
  Tts.getInitStatus()
    .then(() => {
      nativeTtsReady = true;
      console.log('[speech] Native TTS initialized');
    })
    .catch((err: any) => {
      // On some Android devices, TTS engine needs to be installed
      if (err?.code === 'no_engine') {
        console.warn('[speech] No TTS engine installed on device');
        Tts.requestInstallEngine();
      } else {
        console.warn('[speech] Native TTS init error:', err);
        // Still mark as ready — speak() may work anyway
        nativeTtsReady = true;
      }
    });
}

type SpeechVoice = {
  name?: string;
  lang?: string;
};

interface SpeechUtterance {
  text: string;
  lang: string;
  voice: SpeechVoice | null;
  rate: number;
  pitch: number;
  volume: number;
}

type SpeechEngine = {
  getVoices(): SpeechVoice[];
  speak(utterance: SpeechUtterance): void;
  cancel(): void;
  onvoiceschanged: (() => void) | null;
};

type FetchLike = (input: any, init?: any) => Promise<any>;

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

const preferredWebVoices = {
  en: 'Karen',
  de: 'Anna',
  ru: 'Milena',
} as const;

const preferredGoogleVoices = {
  en: 'en-US-Neural2-F',
  de: 'de-DE-Neural2-A',
  ru: 'ru-RU-Wavenet-C',
} as const;

const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// ----------------- utils -----------------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const getGlobal = () => (typeof globalThis !== 'undefined' ? (globalThis as any) : {}) as any;

// Static env access — babel inlines process.env.VAR at build time (dynamic process.env[key] won't work)
const ENV_GCLOUD_TTS_KEY =
  process.env.EXPO_PUBLIC_GCLOUD_TTS_KEY ||
  process.env.REACT_APP_GCLOUD_TTS_KEY ||
  process.env.GCLOUD_TTS_KEY ||
  '';

const ENV_GCLOUD_TTS_SA =
  process.env.EXPO_PUBLIC_GCLOUD_TTS_SA ||
  process.env.REACT_APP_GCLOUD_TTS_SA ||
  process.env.GCLOUD_TTS_SA ||
  '';

const decodeMaybeBase64 = (value: string): string => {
  const trimmed = value.trim();
  const looksLikeB64 = /^[A-Za-z0-9+/]+=*$/.test(trimmed);
  if (!looksLikeB64) return trimmed;
  try {
    if (typeof atob !== 'undefined') return atob(trimmed);
    const buf = getGlobal().Buffer;
    if (buf) return buf.from(trimmed, 'base64').toString('utf-8');
  } catch {
    // ignore
  }
  return trimmed;
};

// ----------------- Web Speech helpers -----------------

let voicesCache: SpeechVoice[] | null = null;
let pendingVoices: Promise<SpeechVoice[]> | null = null;

const getEngine = (): SpeechEngine | null => {
  const synth = getGlobal().speechSynthesis as SpeechEngine | undefined;
  if (!synth || typeof synth.getVoices !== 'function') return null;
  return synth;
};

const loadVoices = async (): Promise<SpeechVoice[]> => {
  const synth = getEngine();
  if (!synth) return [];
  if (voicesCache?.length) return voicesCache;

  const existing = synth.getVoices();
  if (existing.length) {
    voicesCache = existing;
    return existing;
  }

  if (!pendingVoices) {
    pendingVoices = new Promise((resolve) => {
      const finish = () => {
        const loaded = synth.getVoices();
        voicesCache = loaded;
        synth.onvoiceschanged = null;
        resolve(loaded);
      };
      const timer = setTimeout(finish, 800);
      synth.onvoiceschanged = () => {
        clearTimeout(timer);
        finish();
      };
    });
  }

  return pendingVoices;
};

const pickWebVoice = (lang: string, voices: SpeechVoice[]) => {
  if (!voices.length) return null;
  const base = (lang || '').toLowerCase().split('-')[0];
  const preferred = (preferredWebVoices as Record<string, string | undefined>)[base];
  if (preferred) {
    const exact = voices.find((v) => v.name === preferred);
    if (exact) return exact;
  }
  const sameLang = voices.find((v) => v.lang?.toLowerCase().startsWith(base));
  return sameLang || voices[0] || null;
};

// ----------------- Language detection -----------------

export const detectLanguage = (text: string, counterpart?: string): string => {
  const value = text || '';
  const pair = counterpart || '';
  if (/[а-яё]/i.test(value)) return 'ru-RU';
  if (/[äöüß]/i.test(value)) return 'de-DE';
  if (/[а-яё]/i.test(pair)) return 'de-DE';
  return 'en-US';
};

// ----------------- Google auth helpers -----------------

const base64UrlEncode = (data: ArrayBuffer | string) => {
  const g = getGlobal();
  let b64: string;
  if (typeof data === 'string') {
    if (typeof btoa !== 'undefined') b64 = btoa(data);
    else b64 = g.Buffer.from(data, 'utf-8').toString('base64');
  } else {
    const str = String.fromCharCode(...new Uint8Array(data));
    if (typeof btoa !== 'undefined') b64 = btoa(str);
    else b64 = g.Buffer.from(str, 'binary').toString('base64');
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const importPrivateKey = async (pem: string) => {
  const cleaned = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '');
  const binaryStr = typeof atob !== 'undefined' ? atob(cleaned) : getGlobal().Buffer.from(cleaned, 'base64').toString('binary');
  const binary = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
  const subtle = getGlobal().crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto not available');
  return await subtle.importKey(
    'pkcs8',
    binary.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
};

const signJwt = async (payload: Record<string, unknown>, pem: string) => {
  const header = { alg: 'RS256', typ: 'JWT' };
  const subtle = getGlobal().crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto not available');

  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await importPrivateKey(pem);
  const signature = await subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(data));
  return `${data}.${base64UrlEncode(signature)}`;
};

let cachedToken: { token: string; exp: number } | null = null;

const getApiKey = () => {
  const key = ENV_GCLOUD_TTS_KEY || undefined;
  console.log('[speech] API Key available:', !!key, key ? `(${key.substring(0, 10)}...)` : '');
  return key;
};

const getServiceAccount = (): ServiceAccount | null => {
  const envJson = ENV_GCLOUD_TTS_SA || undefined;

  console.log('[speech] Service Account JSON available:', !!envJson, envJson ? `(length: ${envJson.length})` : '');

  if (envJson) {
    try {
      // Remove surrounding quotes if present
      let cleaned = envJson.trim();
      if ((cleaned.startsWith("'") && cleaned.endsWith("'")) ||
          (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
        cleaned = cleaned.slice(1, -1);
      }

      const decoded = decodeMaybeBase64(cleaned);
      const parsed = JSON.parse(decoded);
      console.log('[speech] Service Account parsed:', !!parsed?.client_email, !!parsed?.private_key);

      if (parsed?.client_email && parsed?.private_key) return parsed;
    } catch (e) {
      console.warn('[speech] Failed to parse GCLOUD_TTS_SA:', e);
    }
  }

  return null;
};

const getAccessToken = async (): Promise<string | null> => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = getServiceAccount();
  if (!sa?.client_email || !sa?.private_key) return null;

  const aud = sa.token_uri || GOOGLE_TOKEN_ENDPOINT;
  const iat = now;
  const exp = iat + 3600;

  const jwt = await signJwt(
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud,
      exp,
      iat,
    },
    sa.private_key
  );

  const fetchFn = getGlobal().fetch as FetchLike | undefined;
  if (!fetchFn) return null;

  const res = await fetchFn(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) throw new Error(`Google OAuth failed: ${res.status}`);
  const data = await res.json();
  const token = data?.access_token as string | undefined;
  const expiresIn = Number(data?.expires_in || 3600);
  if (!token) throw new Error('Google OAuth: missing access_token');

  cachedToken = { token, exp: iat + expiresIn };
  return token;
};

// ----------------- Google TTS -----------------

const pickGoogleVoice = (lang: string) => {
  const base = (lang || '').toLowerCase().split('-')[0];
  return (preferredGoogleVoices as Record<string, string | undefined>)[base] || undefined;
};

const toGoogleRate = (rate = 1) => Math.max(0.25, Math.min(4, rate));
const toGooglePitch = (pitch = 1) => {
  const clamped = Math.max(0, Math.min(2, pitch));
  return (clamped - 1) * 10; // ±10 semitones
};

const playAudioNative = (audioBase64: string, volume = 1): Promise<void> => {
  const filePath = `${RNFS.CachesDirectoryPath}/tts_${Date.now()}.mp3`;
  return RNFS.writeFile(filePath, audioBase64, 'base64').then(
    () =>
      new Promise<void>((resolve, reject) => {
        const sound = new Sound(filePath, '', (err: any) => {
          if (err) {
            console.error('[speech] Sound load error:', err);
            reject(err);
            return;
          }
          sound.setVolume(clamp01(volume));
          sound.play((success: boolean) => {
            sound.release();
            // Clean up temp file
            RNFS.unlink(filePath).catch(() => {});
            if (success) resolve();
            else reject(new Error('Sound playback failed'));
          });
        });
      })
  );
};

const playAudio = async (audioBase64: string, volume = 1) => {
  if (isNative) {
    return playAudioNative(audioBase64, volume);
  }
  const AudioCtor = getGlobal().Audio;
  if (!AudioCtor) return;
  const audio = new AudioCtor(`data:audio/mp3;base64,${audioBase64}`);
  audio.volume = clamp01(volume);
  await audio.play();
};

const speakWithGoogle = async (
  text: string,
  lang: string,
  options?: { rate?: number; pitch?: number; volume?: number }
) => {
  const fetchFn = getGlobal().fetch as FetchLike | undefined;
  if (!fetchFn) {
    console.log('[speech] fetch not available');
    return false;
  }

  // Prefer service account over API key for better Neural2/Wavenet support
  let token: string | null = null;
  const apiKey = getApiKey();
  
  console.log('[speech] Checking service account first...');
  try {
    token = await getAccessToken();
    console.log('[speech] Got access token:', !!token);
  } catch (e) {
    console.warn('[speech] getAccessToken failed:', e);
  }

  if (!token && !apiKey) {
    console.log('[speech] No service account token and no API key available');
    return false;
  }
  
  if (token) {
    console.log('[speech] Using service account token');
  } else {
    console.log('[speech] Falling back to API key');
  }

  const languageCode = (lang || 'en-US').split('-').slice(0, 2).join('-');
  const voiceName = pickGoogleVoice(lang);

  // Use token if available, otherwise fall back to API key
  const url = token ? GOOGLE_TTS_ENDPOINT : `${GOOGLE_TTS_ENDPOINT}?key=${apiKey}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log('[speech] Calling Google TTS API...', { languageCode, voiceName, hasToken: !!token, hasApiKey: !!apiKey });

  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: toGoogleRate(options?.rate),
        pitch: toGooglePitch(options?.pitch),
        volumeGainDb: 0,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown error');
    console.error('[speech] Google TTS API error:', res.status, errorText);
    throw new Error(`Google TTS failed: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  if (!data?.audioContent) throw new Error('Google TTS: empty audio');
  console.log('[speech] Got audio content, playing...');
  await playAudio(data.audioContent, options?.volume);
  return true;
};

// ----------------- Web Speech -----------------

const speakWithWebSpeech = async (
  text: string,
  lang: string,
  options?: { rate?: number; pitch?: number; volume?: number }
) => {
  const synth = getEngine();
  const UtteranceCtor = getGlobal().SpeechSynthesisUtterance as (new (text?: string) => SpeechUtterance) | undefined;
  if (!synth || !UtteranceCtor) return;

  const voices = await loadVoices();
  const voice = pickWebVoice(lang, voices);

  synth.cancel();
  const utterance = new UtteranceCtor(text);
  utterance.lang = lang;
  utterance.voice = voice;
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = options?.pitch ?? 1;
  utterance.volume = clamp01(options?.volume ?? 1);
  synth.speak(utterance);
};

// ----------------- Native TTS (Android/iOS) -----------------

const speakWithNativeTTS = async (
  text: string,
  lang: string,
  options?: { rate?: number; pitch?: number; volume?: number }
): Promise<boolean> => {
  if (!isNative || !nativeTtsReady) return false;

  try {
    await Tts.stop();
    await Tts.setDefaultLanguage(lang);
    await Tts.setDefaultRate(options?.rate ?? 0.5);
    await Tts.setDefaultPitch(options?.pitch ?? 1);
    Tts.speak(text);
    console.log('[speech] Native TTS speaking:', lang);
    return true;
  } catch (e) {
    console.warn('[speech] Native TTS failed:', e);
    return false;
  }
};

// ----------------- Public API -----------------

export async function speak(
  text: string,
  lang: string,
  options?: { rate?: number; pitch?: number; volume?: number }
) {
  if (!text) return;

  if (isNative) {
    // On native: try Google Cloud TTS first (high quality), fall back to device TTS
    try {
      console.log('[speech] [native] Attempting Google Cloud TTS...');
      const done = await speakWithGoogle(text, lang, options);
      if (done) {
        console.log('[speech] [native] Google Cloud TTS succeeded');
        return;
      }
    } catch (e) {
      console.warn('[speech] [native] Google TTS failed:', e);
    }
    console.log('[speech] [native] Falling back to native TTS');
    await speakWithNativeTTS(text, lang, options);
    return;
  }

  // On web: try Google Cloud TTS first, fall back to Web Speech API
  try {
    console.log('[speech] Attempting Google Cloud TTS...');
    const done = await speakWithGoogle(text, lang, options);
    if (done) {
      console.log('[speech] Google Cloud TTS succeeded');
      return;
    }
    console.log('[speech] Google TTS returned false, falling back to Web Speech');
  } catch (e) {
    console.warn('[speech] Google TTS failed, fallback to Web Speech:', e);
  }
  console.log('[speech] Using Web Speech fallback');
  await speakWithWebSpeech(text, lang, options);
}
