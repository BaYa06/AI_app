/**
 * Speech helper
 * Google Cloud TTS (API key or service account) with Web Speech fallback.
 */

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

const getEnv = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  const g = getGlobal();
  if (typeof window !== 'undefined' && (window as any)[key]) return (window as any)[key];
  if (g[key]) return g[key];
  return undefined;
};

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

const getApiKey = () =>
  getEnv('EXPO_PUBLIC_GCLOUD_TTS_KEY') ||
  getEnv('REACT_APP_GCLOUD_TTS_KEY') ||
  getEnv('GCLOUD_TTS_KEY');

const getServiceAccount = (): ServiceAccount | null => {
  const envJson =
    getEnv('EXPO_PUBLIC_GCLOUD_TTS_SA') ||
    getEnv('REACT_APP_GCLOUD_TTS_SA') ||
    getEnv('GCLOUD_TTS_SA');

  if (envJson) {
    try {
      const parsed = JSON.parse(decodeMaybeBase64(envJson));
      if (parsed?.client_email && parsed?.private_key) return parsed;
    } catch (e) {
      console.warn('[speech] Failed to parse GCLOUD_TTS_SA:', e);
    }
  }

  const globalSA = (getEnv('FLASHLY_SA') || getGlobal().FLASHLY_SA) as ServiceAccount | undefined;
  if (globalSA?.client_email && globalSA?.private_key) return globalSA;

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

const playAudio = async (audioBase64: string, volume = 1) => {
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
  if (!fetchFn) return false;

  const apiKey = getApiKey();
  let token: string | null = null;

  if (!apiKey) {
    try {
      token = await getAccessToken();
    } catch (e) {
      console.warn('[speech] getAccessToken failed:', e);
    }
  }

  if (!apiKey && !token) return false;

  const languageCode = (lang || 'en-US').split('-').slice(0, 2).join('-');
  const voiceName = pickGoogleVoice(lang);

  const res = await fetchFn(apiKey ? `${GOOGLE_TTS_ENDPOINT}?key=${apiKey}` : GOOGLE_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

  if (!res.ok) throw new Error(`Google TTS failed: ${res.status}`);
  const data = await res.json();
  if (!data?.audioContent) throw new Error('Google TTS: empty audio');
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

// ----------------- Public API -----------------

export async function speak(
  text: string,
  lang: string,
  options?: { rate?: number; pitch?: number; volume?: number }
) {
  if (!text) return;
  try {
    const done = await speakWithGoogle(text, lang, options);
    if (done) return;
  } catch (e) {
    console.warn('[speech] Google TTS failed, fallback to Web Speech:', e);
  }
  await speakWithWebSpeech(text, lang, options);
}
