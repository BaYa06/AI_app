/**
 * Sound utility for playing audio files across platforms
 * Web: HTML5 Audio API with AudioContext fallback
 * Native (Android/iOS): react-native-sound from assets
 */

import { Platform } from 'react-native';
import { useSettingsStore } from '@/store/settingsStore';
import { log } from '@/utils/logger';

let Sound: any | null = null;
if (Platform.OS !== 'web') {
  try {
    const soundModule = require('react-native-sound');
    Sound = soundModule?.default ?? soundModule;
  } catch (error) {
    log.warn('Sound', 'Failed to load react-native-sound', error);
  }
}

const isNative = Platform.OS !== 'web';
const canUseNativeSound = Boolean(Sound && typeof Sound.setCategory === 'function');

// Enable playback in silence mode (iOS). Без mixWithOthers: react-native-sound добавляет к нему
// AllowBluetooth, а с Playback iOS такую опцию не принимает — категория молча не ставится, и беззвучный
// режим глушит все звуки (plan/new/session_results.md, решение 19)
if (isNative && canUseNativeSound) {
  try {
    Sound.setCategory('Playback');
  } catch (error) {
    log.warn('Sound', 'Failed to set audio category', error);
  }
}

// Native sound cache
const nativeSoundCache = new Map<string, any>();

// Web audio cache
const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Convert URL like '/correct.wav' to native asset path.
 * Android: needs 'asset:/' prefix to load from assets/ directory.
 */
function urlToAssetName(url: string): string {
  const name = url.replace(/^\//, '');
  return Platform.OS === 'android' ? `asset:/${name}` : name;
}

// ----------------- Web helpers -----------------

function getAudioConstructor(): typeof Audio | null {
  if (typeof window !== 'undefined' && window.Audio) {
    return window.Audio;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).Audio) {
    return (globalThis as any).Audio;
  }
  return null;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window !== 'undefined') {
    return (window as any).AudioContext || (window as any).webkitAudioContext || null;
  }
  return null;
}

function playSynthesizedSound(): void {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) return;

  try {
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const duration = 0.18;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => ctx.close();
  } catch (error) {
    log.warn('Sound', 'Synthesized sound failed', error);
  }
}

// ----------------- Native helpers -----------------

function playNativeSound(assetName: string, volume: number): Promise<void> {
  return new Promise((resolve) => {
    if (!canUseNativeSound) {
      log.warn('Sound', 'react-native-sound is unavailable, skipping playback', assetName);
      resolve();
      return;
    }

    // Check cache
    const cached = nativeSoundCache.get(assetName);
    if (cached) {
      cached.setVolume(volume);
      cached.stop(() => {
        cached.play((success: boolean) => {
          if (!success) log.warn('Sound', 'Native playback failed', assetName);
          resolve();
        });
      });
      return;
    }

    // Load from assets directory
    const sound = new Sound(assetName, Sound.MAIN_BUNDLE, (err: any) => {
      if (err) {
        log.warn('Sound', 'Failed to load native sound', assetName, err);
        resolve();
        return;
      }
      sound.setVolume(volume);
      nativeSoundCache.set(assetName, sound);
      sound.play((success: boolean) => {
        if (!success) log.warn('Sound', 'Native playback failed', assetName);
        resolve();
      });
    });
  });
}

// ----------------- Public API -----------------

export function preloadSound(url: string): void {
  if (isNative) {
    if (!canUseNativeSound) {
      log.warn('Sound', 'react-native-sound is unavailable, skip preload', url);
      return;
    }
    const assetName = urlToAssetName(url);
    if (nativeSoundCache.has(assetName)) return;
    const sound = new Sound(assetName, Sound.MAIN_BUNDLE, (err: any) => {
      if (err) {
        log.warn('Sound', 'Failed to preload native sound', assetName, err);
        return;
      }
      nativeSoundCache.set(assetName, sound);
      log.debug('Sound', 'Preloaded native', assetName);
    });
    return;
  }

  const AudioCtor = getAudioConstructor();
  if (!AudioCtor) return;

  try {
    const audio = new AudioCtor(url);
    audio.preload = 'auto';
    audio.load();
    audioCache.set(url, audio);
  } catch (error) {
    log.warn('Sound', 'Failed to preload', url, error);
  }
}

export async function playSound(url: string, volume = 0.7): Promise<void> {
  if (!useSettingsStore.getState().settings.soundEnabled) return;

  if (isNative) {
    const assetName = urlToAssetName(url);
    return playNativeSound(assetName, volume);
  }

  // Web: try cache
  const cached = audioCache.get(url);
  if (cached) {
    try {
      cached.currentTime = 0;
      cached.volume = Math.max(0, Math.min(1, volume));
      await cached.play();
      return;
    } catch {
      // fall through
    }
  }

  // Web: new instance
  const AudioCtor = getAudioConstructor();
  if (AudioCtor) {
    try {
      const audio = new AudioCtor(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      await audio.play();
      audioCache.set(url, audio);
      return;
    } catch {
      // fall through
    }
  }

  playSynthesizedSound();
}

export function playCorrectSound(): void {
  playSound('/correct.wav', 0.7).catch(() => {});
}

export function playCorrectSound2(): void {
  playSound('/correct2.wav', 0.7).catch(() => {});
}

// ----------------- Звуки сессии «Изучить» (plan/new/session_results.md) -----------------
// Только на этапах сессии и её итогах; свободная практика — на playCorrectSound / playCorrectSound2.

export type SessionSfx = 'correct' | 'error' | 'pop' | 'reveal' | 'count' | 'ding' | 'finish';

const sessionSfxUrl = (name: SessionSfx) => `/session_${name}.wav`;

/** Главный удар звука, мс от начала файла — вибрацию даём в этот момент (замеры Results 1) */
export const SESSION_SFX_HIT_MS: Partial<Record<SessionSfx, number>> = {
  reveal: 10,
  finish: 300,
};

export function preloadSessionSfx(names: SessionSfx[]): void {
  names.forEach((name) => preloadSound(sessionSfxUrl(name)));
}

export function playSessionSfx(name: SessionSfx, volume = 0.7): void {
  playSound(sessionSfxUrl(name), volume).catch(() => {});
}

/** Оборвать звуки сессии — например, «Продолжить» нажали посреди анимации итогов */
export function stopSessionSfx(names: SessionSfx[]): void {
  for (const name of names) {
    const url = sessionSfxUrl(name);
    if (isNative) {
      nativeSoundCache.get(urlToAssetName(url))?.stop();
    } else {
      audioCache.get(url)?.pause();
    }
  }
}
