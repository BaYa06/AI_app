/**
 * Sound utility for playing audio files across platforms
 * Web: HTML5 Audio API with AudioContext fallback
 * Native (Android/iOS): react-native-sound from assets
 */

import { Platform } from 'react-native';
import Sound from 'react-native-sound';

const isNative = Platform.OS !== 'web';

// Enable playback in silence mode (iOS)
if (isNative) {
  Sound.setCategory('Playback');
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
    console.warn('[sound] Synthesized sound failed:', error);
  }
}

// ----------------- Native helpers -----------------

function playNativeSound(assetName: string, volume: number): Promise<void> {
  return new Promise((resolve) => {
    // Check cache
    const cached = nativeSoundCache.get(assetName);
    if (cached) {
      cached.setVolume(volume);
      cached.stop(() => {
        cached.play((success: boolean) => {
          if (!success) console.warn('[sound] Native playback failed:', assetName);
          resolve();
        });
      });
      return;
    }

    // Load from assets directory
    const sound = new Sound(assetName, Sound.MAIN_BUNDLE, (err: any) => {
      if (err) {
        console.warn('[sound] Failed to load native sound:', assetName, err);
        resolve();
        return;
      }
      sound.setVolume(volume);
      nativeSoundCache.set(assetName, sound);
      sound.play((success: boolean) => {
        if (!success) console.warn('[sound] Native playback failed:', assetName);
        resolve();
      });
    });
  });
}

// ----------------- Public API -----------------

export function preloadSound(url: string): void {
  if (isNative) {
    const assetName = urlToAssetName(url);
    if (nativeSoundCache.has(assetName)) return;
    const sound = new Sound(assetName, Sound.MAIN_BUNDLE, (err: any) => {
      if (err) {
        console.warn('[sound] Failed to preload native sound:', assetName, err);
        return;
      }
      nativeSoundCache.set(assetName, sound);
      console.log('[sound] Preloaded native:', assetName);
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
    console.warn('[sound] Failed to preload:', url, error);
  }
}

export async function playSound(url: string, volume = 0.7): Promise<void> {
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
