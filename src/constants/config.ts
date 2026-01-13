/**
 * Конфигурация приложения
 */

export const config = {
  // SRS параметры по умолчанию
  srs: {
    initialEaseFactor: 2.5,
    minimumEaseFactor: 1.3,
    maxInterval: 365, // Максимальный интервал в днях
    
    // Интервалы для первого повторения (в днях)
    firstIntervals: {
      again: 0.00694, // ~10 минут (в днях)
      hard: 0.0104,   // ~15 минут
      good: 1,        // 1 день
      easy: 4,        // 4 дня
    },
    
    // Множители для следующих интервалов
    intervalMultipliers: {
      again: 0,       // Сброс
      hard: 1.2,
      good: 2.5,
      easy: 3.0,
    },
    
    // Изменение ease factor
    easeFactorChanges: {
      again: -0.2,
      hard: -0.15,
      good: 0,
      easy: 0.15,
    },
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
