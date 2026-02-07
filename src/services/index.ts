/**
 * Экспорт всех сервисов
 */

export {StorageService, STORAGE_KEYS } from './StorageService';
export { DatabaseService, scheduleSave, setupAutoSave } from './DatabaseService';
export { NeonService } from './NeonService';
export { AuthService } from './AuthService';
export { supabase } from './supabaseClient';
export { StreakService, getLocalDateKey, recordActivity, fetchWeekActivity, fetchUserStats, buildWeekStatus } from './StreakService';
export type { DailyActivity, UserStats, WeekDayStatus, RecordActivityParams } from './StreakService';
export { app as firebaseApp, analytics as firebaseAnalytics } from './firebase';
