/**
 * Sound utility for playing audio files across platforms
 * Works on web (localhost and production) with fallback to synthesized sound
 */

// Кеш для предзагруженных аудио файлов
const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Получить правильный Audio конструктор в зависимости от окружения
 */
function getAudioConstructor(): typeof Audio | null {
  if (typeof window !== 'undefined' && window.Audio) {
    return window.Audio;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).Audio) {
    return (globalThis as any).Audio;
  }
  if (typeof global !== 'undefined' && (global as any).Audio) {
    return (global as any).Audio;
  }
  return null;
}

/**
 * Получить AudioContext конструктор для fallback синтезированного звука
 */
function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window !== 'undefined') {
    return (window as any).AudioContext || (window as any).webkitAudioContext || null;
  }
  if (typeof globalThis !== 'undefined') {
    return (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext || null;
  }
  return null;
}

/**
 * Предзагрузить аудио файл для быстрого воспроизведения
 */
export function preloadSound(url: string): void {
  const AudioCtor = getAudioConstructor();
  if (!AudioCtor) {
    console.warn('[sound] Audio not available, cannot preload');
    return;
  }

  try {
    const audio = new AudioCtor(url);
    audio.preload = 'auto';
    audio.load();
    audioCache.set(url, audio);
    console.log('[sound] Preloaded:', url);
  } catch (error) {
    console.warn('[sound] Failed to preload:', url, error);
  }
}

/**
 * Воспроизвести синтезированный звук как fallback
 */
function playSynthesizedSound(): void {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    console.warn('[sound] AudioContext not available');
    return;
  }

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

/**
 * Воспроизвести звук из файла
 * @param url - путь к аудио файлу (например, '/correct.wav')
 * @param volume - громкость от 0 до 1 (по умолчанию 0.7)
 */
export async function playSound(url: string, volume = 0.7): Promise<void> {
  // Проверяем кеш
  const cached = audioCache.get(url);
  if (cached) {
    try {
      cached.currentTime = 0;
      cached.volume = Math.max(0, Math.min(1, volume));
      await cached.play();
      console.log('[sound] Played from cache:', url);
      return;
    } catch (error) {
      console.warn('[sound] Failed to play from cache:', error);
      // Продолжаем к созданию нового экземпляра
    }
  }

  // Создаем новый экземпляр Audio
  const AudioCtor = getAudioConstructor();
  if (AudioCtor) {
    try {
      const audio = new AudioCtor(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      await audio.play();
      audioCache.set(url, audio);
      console.log('[sound] Played new instance:', url);
      return;
    } catch (error) {
      console.warn('[sound] Failed to play audio file:', error);
      // Продолжаем к fallback
    }
  }

  // Fallback на синтезированный звук
  console.log('[sound] Using synthesized fallback');
  playSynthesizedSound();
}

/**
 * Воспроизвести звук правильного ответа
 */
export function playCorrectSound(): void {
  playSound('/correct.wav', 0.7).catch((error) => {
    console.warn('[sound] playCorrectSound failed:', error);
  });
}

/**
 * Воспроизвести звук правильного ответа (альтернативный)
 */
export function playCorrectSound2(): void {
  playSound('/correct2.wav', 0.7).catch((error) => {
    console.warn('[sound] playCorrectSound2 failed:', error);
  });
}
