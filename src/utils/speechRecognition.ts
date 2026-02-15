/**
 * Speech Recognition utility
 * Wraps @react-native-voice/voice on native, Web Speech API on web.
 * Provides a Promise-based API with automatic timeout.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import Voice from '@react-native-voice/voice';
import type { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';

// ---- Language normalization ----

export function normalizeLangForSTT(lang?: string): string {
  if (!lang) return 'en-US';
  const lower = lang.toLowerCase();
  if (lower.startsWith('ru')) return 'ru-RU';
  if (lower.startsWith('de')) return 'de-DE';
  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('fr')) return 'fr-FR';
  if (lower.startsWith('es')) return 'es-ES';
  if (lower.includes('-')) return lang;
  return `${lower}-${lower.toUpperCase()}`;
}

// ---- Text comparison ----

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()\-\u2014\u2013]/g, '')
    .replace(/\s+/g, ' ');
}

export function isAnswerCorrect(
  recognizedAlternatives: string[],
  expectedAnswer: string,
): boolean {
  const expected = normalizeText(expectedAnswer);
  if (!expected) return false;

  for (const alt of recognizedAlternatives) {
    const normalized = normalizeText(alt);
    if (normalized === expected) return true;
    if (normalized.includes(expected)) return true;
    if (expected.includes(normalized) && normalized.length >= expected.length * 0.6) return true;
  }
  return false;
}

// ---- Permission handling (Android) ----

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  if (Platform.OS === 'ios') return true;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Доступ к микрофону',
        message: 'Для распознавания речи нужен доступ к микрофону.',
        buttonPositive: 'OK',
        buttonNegative: 'Отмена',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('[speechRecognition] Permission error:', err);
    return false;
  }
}

// ---- Recognition session ----

export interface RecognitionResult {
  recognized: boolean;
  alternatives: string[];
  isCorrect: boolean;
  timedOut: boolean;
}

interface ListenOptions {
  lang: string;
  expectedAnswer: string;
  timeoutMs?: number;
  onPartialResult?: (partial: string) => void;
}

/** Small delay helper */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fully tear down the previous Voice session so Android releases the SpeechRecognizer. */
async function ensureVoiceStopped(): Promise<void> {
  try { Voice.removeAllListeners(); } catch {}
  try { await Voice.stop(); } catch {}
  try { await Voice.destroy(); } catch {}
  // Android needs a moment after destroy before a new session can start
  if (Platform.OS === 'android') await delay(300);
}

const MAX_RETRIES = 2;

export async function listenForAnswer(options: ListenOptions): Promise<RecognitionResult> {
  const {
    lang,
    expectedAnswer,
    timeoutMs = 5000,
    onPartialResult,
  } = options;

  // Make sure any previous session is fully released
  await ensureVoiceStopped();

  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _listenOnce(lang, expectedAnswer, timeoutMs, onPartialResult);
    } catch (err: any) {
      lastError = err;
      const code = typeof err === 'object' ? err?.code ?? err?.message : String(err);
      // Error code 5 = "Client side error" — retry after a pause
      if (String(code) === '5' && attempt < MAX_RETRIES) {
        console.warn(`[speechRecognition] Error 5, retry ${attempt + 1}/${MAX_RETRIES}`);
        await ensureVoiceStopped();
        continue;
      }
      break;
    }
  }

  console.warn('[speechRecognition] All retries exhausted:', lastError);
  return { recognized: false, alternatives: [], isCorrect: false, timedOut: false };
}

/** Single recognition attempt (throws on error‑5 so caller can retry). */
function _listenOnce(
  lang: string,
  expectedAnswer: string,
  timeoutMs: number,
  onPartialResult?: (partial: string) => void,
): Promise<RecognitionResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let allAlternatives: string[] = [];

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      Voice.removeAllListeners();
      Voice.stop().catch(() => {});
    };

    const settle = (result: RecognitionResult) => {
      if (settled) return;
      cleanup();
      resolve(result);
    };

    // Timeout
    timeoutId = setTimeout(() => {
      settle({
        recognized: allAlternatives.length > 0,
        alternatives: allAlternatives,
        isCorrect: isAnswerCorrect(allAlternatives, expectedAnswer),
        timedOut: true,
      });
    }, timeoutMs);

    // Events
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const results = e.value || [];
      allAlternatives = results;

      if (isAnswerCorrect(results, expectedAnswer)) {
        settle({
          recognized: true,
          alternatives: results,
          isCorrect: true,
          timedOut: false,
        });
      }
    };

    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const partial = (e.value || [])[0] || '';
      if (onPartialResult && partial) {
        onPartialResult(partial);
      }
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      const code = String(e.error?.code ?? e.error?.message ?? '');
      if (code === '5') {
        // Reject so the outer loop can retry
        if (!settled) { settled = true; clearTimeout(timeoutId); Voice.removeAllListeners(); }
        reject(e.error);
        return;
      }
      console.warn('[speechRecognition] Error:', e.error);
      settle({
        recognized: false,
        alternatives: allAlternatives,
        isCorrect: false,
        timedOut: false,
      });
    };

    Voice.onSpeechEnd = () => {
      setTimeout(() => {
        if (!settled) {
          settle({
            recognized: allAlternatives.length > 0,
            alternatives: allAlternatives,
            isCorrect: isAnswerCorrect(allAlternatives, expectedAnswer),
            timedOut: false,
          });
        }
      }, 300);
    };

    // Start
    Voice.start(lang).catch((err) => {
      console.error('[speechRecognition] Voice.start failed:', err);
      if (!settled) { settled = true; clearTimeout(timeoutId); Voice.removeAllListeners(); }
      reject(err);
    });
  });
}

export async function cancelListening(): Promise<void> {
  try { await Voice.cancel(); } catch {}
  try { Voice.removeAllListeners(); } catch {}
  try { await Voice.destroy(); } catch {}
}

// ---- Continuous listening mode ----
// Keeps the microphone always on, auto-restarts when Android fires onSpeechEnd.

let _continuousLang = '';
let _continuousActive = false;
let _resultCallback: ((results: string[]) => void) | null = null;
let _partialCallback: ((partial: string) => void) | null = null;

export async function startContinuousListening(lang: string): Promise<void> {
  _continuousLang = lang;
  _continuousActive = true;
  await ensureVoiceStopped();
  _attachContinuousListeners();
  await Voice.start(lang);
}

export async function stopContinuousListening(): Promise<void> {
  _continuousActive = false;
  _resultCallback = null;
  _partialCallback = null;
  try { Voice.removeAllListeners(); } catch {}
  try { await Voice.stop(); } catch {}
  try { await Voice.destroy(); } catch {}
}

export function setContinuousHandlers(
  onResult: ((results: string[]) => void) | null,
  onPartial: ((partial: string) => void) | null,
): void {
  _resultCallback = onResult;
  _partialCallback = onPartial;
}

function _restartContinuous(): void {
  if (!_continuousActive) return;
  setTimeout(() => {
    if (!_continuousActive) return;
    _attachContinuousListeners();
    Voice.start(_continuousLang).catch((err) => {
      console.warn('[speechRecognition] Continuous restart failed:', err);
      if (_continuousActive) {
        setTimeout(() => {
          if (!_continuousActive) return;
          _attachContinuousListeners();
          Voice.start(_continuousLang).catch(() => {});
        }, 500);
      }
    });
  }, 150);
}

function _attachContinuousListeners(): void {
  Voice.removeAllListeners();

  Voice.onSpeechResults = (e: SpeechResultsEvent) => {
    const results = e.value || [];
    if (_resultCallback) _resultCallback(results);
  };

  Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
    const partial = (e.value || [])[0] || '';
    if (_partialCallback && partial) _partialCallback(partial);
  };

  Voice.onSpeechEnd = () => {
    _restartContinuous();
  };

  Voice.onSpeechError = (e: SpeechErrorEvent) => {
    console.warn('[speechRecognition] Continuous error:', e.error);
    _restartContinuous();
  };
}
