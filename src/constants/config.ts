/**
 * Конфигурация приложения
 */

export const config = {
  // SRS параметры (упрощенная система)
  srs: {
    // Интервалы повторения в днях по шагам обучения
    // step 0: сегодня, step 1: 1 день, step 2: 3 дня, и т.д.
    intervals: [0, 1, 3, 7, 14, 30, 60],
    
    // Пороги для статусов
    learningThreshold: 2,   // step <= 2 → learning
    youngThreshold: 4,      // step <= 4 → young
    // step > 4 → mature
  },
  
  // Лимиты по умолчанию
  limits: {
    dailyNewCards: 20,
    dailyReviews: 100,
    maxCardsPerSet: 10000,
    maxSets: 100,
    maxTitleLength: 100,
    maxDescriptionLength: 500,
    maxCardTextLength: 5000,
    maxImageSize: 5 * 1024 * 1024,  // 5 MB
    maxAudioSize: 10 * 1024 * 1024, // 10 MB
  },
  
  // Автосохранение
  autoSave: {
    debounceMs: 3000, // 3 секунды
  },
  
  // Кеширование
  cache: {
    imagesCount: 100,
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 дней
  },
  
  // Локализация
  i18n: {
    defaultLanguage: 'ru' as const,
    supportedLanguages: ['ru', 'en'] as const,
  },
} as const;

export type SupportedLanguage = typeof config.i18n.supportedLanguages[number];
