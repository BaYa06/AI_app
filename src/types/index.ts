/**
 * Типы данных для флеш-карточек
 * @description Базовые интерфейсы для работы с карточками и наборами
 */

// ==================== CARD TYPES ====================

/**
 * Оценка ответа пользователя
 * 1 - Не помню совсем (Again)
 * 2 - Сложно вспомнил (Hard)
 * 3 - Хорошо помню (Good)
 * 4 - Легко помню (Easy)
 */
export type Rating = 1 | 2 | 3 | 4;

/**
 * Статус изучения карточки
 * new - новая карточка, еще не изучалась
 * learning - в процессе первичного запоминания (шаги обучения)
 * relearning - переучивание (забыл карточку, нажал Again на young/mature)
 * young - выучил, но недавно (интервал < 21 дня)
 * mature - хорошо выучил (интервал >= 21 дня)
 */
export type CardStatus = 'new' | 'learning' | 'relearning' | 'young' | 'mature';

/**
 * Основная карточка
 */
export interface Card {
  id: string;
 setId: string;
  
  // Контент
  frontText: string;
  backText: string;
  example?: string;
  mnemonic?: string;
  // Допустимы альтернативные поля для совместимости с API
  front?: string;
  back?: string;
  frontImage?: string;
  backImage?: string;
  frontAudio?: string;
  backAudio?: string;
  
  // Метаданные
  createdAt: number; // timestamp
  updatedAt: number;
  
  // SRS данные (упрощенная система)
  learningStep: number;   // Текущий шаг обучения (0, 1, 2, 3...)
  nextReviewDate: number; // Timestamp следующего повторения
  lastReviewDate: number; // Timestamp последнего повторения
  status: CardStatus;
}

/**
 * Данные для создания новой карточки
 */
export interface CreateCardInput {
  setId: string;
  frontText: string;
  backText: string;
  example?: string;
  mnemonic?: string;
  frontImage?: string;
  backImage?: string;
  frontAudio?: string;
  backAudio?: string;
}

/**
 * Данные для обновления карточки
 */
export interface UpdateCardInput {
  frontText?: string;
  backText?: string;
  example?: string;
  mnemonic?: string;
  frontImage?: string;
  backImage?: string;
  frontAudio?: string;
  backAudio?: string;
}

// ==================== CARD SET TYPES ====================

/**
 * Категория набора карточек
 */
export type SetCategory = 
  | 'general'
  | 'travel'
  | 'food'
  | 'study'
  | 'work'
  | 'grammar'
  | 'custom'
  | 'languages'
  | 'science'
  | 'history'
  | 'math'
  | 'programming'
  | 'medicine'
  | 'geography'
  | 'art'
  | 'music'
  | 'other';

// ==================== COURSE TYPES ====================

/**
 * Курс (папка/контейнер для наборов карточек)
 */
export interface Course {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number;
}

/**
 * Набор карточек
 */
export interface CardSet {
  id: string;
  userId: string;
  courseId?: string | null; // ID курса, к которому принадлежит набор (null = глобальный)
  
  // Основная информация
  title: string;
  description?: string;
  category: SetCategory;
  tags: string[];
  icon?: string; // Emoji или имя иконки
  color?: string; // Цвет набора
  languageFrom?: string; // Язык лицевой стороны
  languageTo?: string;   // Язык оборотной стороны
  
  // Метаданные
  createdAt: number;
  updatedAt: number;
  lastStudiedAt?: number;
  
  // Статистика (кешированные значения для быстрого отображения)
  cardCount: number;
  newCount: number;      // Новые карточки
  learningCount: number; // В процессе изучения
  reviewCount: number;   // На повторении сегодня
  masteredCount: number; // Выученные
  
  // Флаги
  isPublic: boolean;
  isFavorite: boolean;
  isArchived: boolean;
}

/**
 * Данные для создания нового набора
 */
export interface CreateSetInput {
  title: string;
  description?: string;
  category?: SetCategory;
  tags?: string[];
  icon?: string;
  color?: string;
  languageFrom?: string;
  languageTo?: string;
  isPublic?: boolean;
  courseId?: string | null; // ID курса, к которому принадлежит набор
}

/**
 * Данные для обновления набора
 */
export interface UpdateSetInput {
  title?: string;
  description?: string;
  category?: SetCategory;
  tags?: string[];
  icon?: string;
  color?: string;
  isPublic?: boolean;
  isFavorite?: boolean;
  isArchived?: boolean;
  languageFrom?: string;
  languageTo?: string;
  courseId?: string | null;
}

// ==================== REVIEW TYPES ====================

/**
 * Лог изучения карточки
 */
export interface ReviewLog {
  id: string;
  cardId: string;
  setId: string;
  userId: string;
  
  rating: Rating;
  reviewDate: number;
  timeTaken: number; // Время на ответ в миллисекундах
  
  // Состояние до и после
  previousLearningStep: number;
  newLearningStep: number;
}

/**
 * Результат оценки карточки
 */
export interface ReviewResult {
  cardId: string;
  rating: Rating;
  nextReviewDate: number;
  newStatus: CardStatus;
  newLearningStep: number;
}

// ==================== STUDY SESSION TYPES ====================

/**
 * Режим изучения
 */
export type StudyMode = 'classic' | 'quiz' | 'write' | 'audio';

/**
 * Настройки сессии изучения
 */
export interface StudySessionConfig {
  setId: string;
  mode: StudyMode;
  
  // Лимиты
  newCardsLimit: number;      // Макс новых карточек
  reviewCardsLimit: number;   // Макс карточек на повторение
  
  // Порядок
  shuffleCards: boolean;
  prioritizeOverdue: boolean;
  
  // Таймер
  showTimer: boolean;
  timeLimit?: number; // В секундах
}

/**
 * Статус текущей сессии изучения
 */
export interface StudySession {
  id: string;
  setId: string;
  mode: StudyMode;
  startedAt: number;
  
  // Очередь карточек
  queue: string[];        // ID карточек в очереди
  currentIndex: number;
  
  // Статистика сессии
  totalCards: number;
  completedCards: number;
  correctAnswers: number;
  incorrectAnswers: number;
  
  // Временные метрики
  totalTimeSpent: number;
  averageTimePerCard: number;
}

// ==================== USER TYPES ====================

/**
 * Профиль пользователя
 */
export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  
  createdAt: number;
  lastLoginAt: number;
  
  // Подписка
  isPremium: boolean;
  premiumExpiresAt?: number;
}

/**
 * Режим темы
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Настройки пользователя
 */
export interface UserSettings {
  // Изучение
  dailyNewCardsLimit: number;
  dailyReviewLimit: number;
  studyCardLimit: number | null; // null = все карты

  // Уведомления
  reminderEnabled: boolean;
  reminderTime?: string; // HH:mm
  
  // Внешний вид
  theme: ThemeMode;
  language: 'ru' | 'en';
  
  // Звук
  soundEnabled: boolean;
  hapticEnabled: boolean;

  // Режимы
  reverseCards: boolean;
}

// ==================== STATISTICS TYPES ====================

/**
 * Дневная статистика
 */
export interface DailyStats {
  date: string; // YYYY-MM-DD
  
  cardsStudied: number;
  cardsNew: number;
  cardsReviewed: number;
  
  correctAnswers: number;
  incorrectAnswers: number;
  accuracy: number; // 0-100
  
  timeSpent: number; // В секундах
  streak: number;    // Текущий streak на эту дату
}

/**
 * Общая статистика пользователя
 */
export interface UserStats {
  totalCards: number;
  totalSets: number;
  totalReviews: number;
  
  currentStreak: number;
  longestStreak: number;
  
  averageAccuracy: number;
  totalTimeSpent: number;
  
  // По дням (последние 30 дней)
  dailyStats: DailyStats[];
}
