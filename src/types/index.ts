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
 */
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';

/**
 * Основная карточка
 */
export interface Card {
  id: string;
 setId: string;
  
  // Контент
  frontText: string;
  backText: string;
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
  
  // SRS данные
  easeFactor: number;     // Коэффициент легкости (начальное: 2.5)
  interval: number;       // Текущий интервал в днях
  repetitions: number;    // Количество правильных повторений
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

/**
 * Набор карточек
 */
export interface CardSet {
  id: string;
  userId: string;
  
  // Основная информация
  title: string;
  description?: string;
  category: SetCategory;
  tags: string[];
  icon?: string; // Emoji или имя иконки
  color?: string; // Цвет набора
  
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
  isPublic?: boolean;
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
  previousInterval: number;
  newInterval: number;
  previousEaseFactor: number;
  newEaseFactor: number;
}

/**
 * Результат оценки карточки
 */
export interface ReviewResult {
  cardId: string;
  rating: Rating;
  nextReviewDate: number;
  newInterval: number;
  newEaseFactor: number;
  newStatus: CardStatus;
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
  
  // Уведомления
  reminderEnabled: boolean;
  reminderTime?: string; // HH:mm
  
  // Внешний вид
  theme: ThemeMode;
  language: 'ru' | 'en';
  
  // Звук
  soundEnabled: boolean;
  hapticEnabled: boolean;
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
