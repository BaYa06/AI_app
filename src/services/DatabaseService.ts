/**
 * Database Service
 * @description Сервис для работы с локальной базой данных (персистентность)
 */
import { StorageService, STORAGE_KEYS } from './StorageService';
import { NeonService } from './NeonService';
import { supabase } from './supabaseClient';
import type { Card, CardSet, Course, UserSettings } from '@/types';

// Lazy imports для store чтобы избежать циклических зависимостей
const getStores = () => ({
  useCardsStore: require('../store/cardsStore').useCardsStore,
  useSetsStore: require('../store/setsStore').useSetsStore,
  useCoursesStore: require('../store/coursesStore').useCoursesStore,
  useSettingsStore: require('../store/settingsStore').useSettingsStore,
});

/**
 * Интерфейс сохраненных данных
 */
interface PersistedData {
  cards: Record<string, Card>;
  cardsBySet: Record<string, string[]>;
  sets: Record<string, CardSet>;
  setsOrder: string[];
  settings: UserSettings;
  version: number;
}

const CURRENT_VERSION = 1;

/**
 * Database Service для сохранения и загрузки данных
 */
export const DatabaseService = {
  /**
   * Загрузить все данные из хранилища в store
   */
  async loadAll(): Promise<boolean> {
    try {
      // Определяем текущего авторизованного пользователя (если есть)
      let currentUserId: string | undefined;
      
      if (supabase?.auth?.getSession) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          currentUserId = sessionData.session?.user?.id;
        } catch (error) {
          console.warn('⚠️ Не удалось получить сессию Supabase:', error);
        }
      } else {
        console.warn('⚠️ Supabase не инициализирован, используем локальные данные');
      }

      console.log('🔄 Загрузка данных из Neon PostgreSQL...');
      
      // Пытаемся загрузить данные из Neon
      const [sets, allCards, courses] = await Promise.all([
        NeonService.loadSets(currentUserId),
        NeonService.loadAllCards(currentUserId),
        NeonService.loadCourses(currentUserId),
      ]);

      console.log(`📚 Загружено наборов: ${sets.length}`);
      console.log(`🃏 Загружено карточек: ${allCards.length}`);
      console.log(`📁 Загружено курсов: ${courses.length}`);

      // Преобразуем данные из Neon в объекты для store
      const setsMap: Record<string, CardSet> = {};
      const setsOrder: string[] = [];

      sets.forEach(set => {
        setsMap[set.id] = set;
        setsOrder.push(set.id);
      });

      // Загружаем также локальные данные и объединяем
      const localSetsData = StorageService.getObject<{
        sets: Record<string, CardSet>;
        setsOrder: string[];
      }>(STORAGE_KEYS.SETS);

      if (localSetsData) {
        // Добавляем локальные наборы, которых нет в Neon (только для текущего пользователя или локальные)
        Object.entries(localSetsData.sets || {}).forEach(([id, set]) => {
          if (!setsMap[id]) {
            // Фильтруем по userId: показываем только свои наборы или локальные (userId === 'local')
            if (!currentUserId || set.userId === currentUserId || set.userId === 'local') {
              setsMap[id] = set;
              setsOrder.push(id);
            }
          }
        });
      }

      // Курсы: берём только из базы для текущего пользователя.
      // Если пользователь не авторизован (нет currentUserId), используем локальные данные как fallback.
      const localCoursesData = StorageService.getObject<{
        courses: Course[];
        activeCourseId: string | null;
      }>(STORAGE_KEYS.COURSES);

      const allCourses: Course[] =
        currentUserId ? courses : localCoursesData?.courses || courses;

      const savedActiveCourseId = localCoursesData?.activeCourseId ?? null;
      const activeCourseId = allCourses.some((c) => c.id === savedActiveCourseId)
        ? savedActiveCourseId
        : null;

      // Сохраняем данные в store
      const stores = getStores();
      stores.useSetsStore.setState({
        sets: setsMap,
        setsOrder,
      });

      console.log('✅ Наборы загружены в store (Neon + локальные)');

      // Сохраняем курсы в store
      stores.useCoursesStore.setState({
        courses: allCourses,
        activeCourseId,
      });

      console.log('✅ Курсы загружены в store из Neon');

      // Преобразуем карточки в объекты
      const cardsMap: Record<string, Card> = {};
      const cardsBySet: Record<string, string[]> = {};

      allCards.forEach(card => {
        cardsMap[card.id] = card;
        
        if (!cardsBySet[card.setId]) {
          cardsBySet[card.setId] = [];
        }
        cardsBySet[card.setId].push(card.id);
      });

      // Загружаем также локальные карточки
      const localCardsData = StorageService.getObject<{
        cards: Record<string, Card>;
        cardsBySet: Record<string, string[]>;
      }>(STORAGE_KEYS.CARDS);

      if (localCardsData) {
        // Добавляем локальные карточки, которых нет в Neon (только для наборов текущего пользователя)
        Object.entries(localCardsData.cards || {}).forEach(([id, card]) => {
          if (!cardsMap[id]) {
            // Добавляем карточку только если её набор принадлежит текущему пользователю
            const cardSet = setsMap[card.setId];
            if (cardSet && (!currentUserId || cardSet.userId === currentUserId || cardSet.userId === 'local')) {
              cardsMap[id] = card;
              
              if (!cardsBySet[card.setId]) {
                cardsBySet[card.setId] = [];
              }
              cardsBySet[card.setId].push(card.id);
            }
          }
        });
      }

      stores.useCardsStore.setState({
        cards: cardsMap,
        cardsBySet,
      });

      console.log('✅ Карточки загружены в store (Neon + локальные)');

      // Загружаем настройки из локального хранилища
      const settings = StorageService.getObject<UserSettings>(STORAGE_KEYS.SETTINGS);
      if (settings) {
        stores.useSettingsStore.getState().updateSettings(settings);
      }

      // Загружаем статистику стрика из БД
      if (currentUserId) {
        try {
          const userStats = await NeonService.getUserStats(currentUserId);
          if (userStats) {
            stores.useSettingsStore.getState().syncStreakFromServer({
              currentStreak: userStats.current_streak,
              longestStreak: userStats.longest_streak,
              lastActiveDate: userStats.last_active_date,
            });
            console.log('🔥 Streak загружен:', userStats.current_streak, 'дней');
          }
        } catch (e) {
          console.warn('⚠️ Не удалось загрузить streak:', e);
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      return false;
    }
  },

  /**
   * Перегрузить удалённые данные для указанного пользователя:
   * очищает карточки/наборы в store и грузит только его данные.
   */
  async reloadRemoteDataForUser(userId: string | undefined): Promise<void> {
    const stores = getStores();
    stores.useCardsStore.getState().clearCards();
    stores.useSetsStore.getState().clearSets();

    await DatabaseService.loadAll();
  },

  /**
   * Сохранить все данные из store в хранилище
   */
  async saveAll(): Promise<boolean> {
    try {
      const stores = getStores();
      // Сохраняем карточки
      const cardsState = stores.useCardsStore.getState();
      StorageService.setObject(STORAGE_KEYS.CARDS, {
        cards: cardsState.cards,
        cardsBySet: cardsState.cardsBySet,
      });

      // Сохраняем наборы
      const setsState = stores.useSetsStore.getState();
      StorageService.setObject(STORAGE_KEYS.SETS, {
        sets: setsState.sets,
        setsOrder: setsState.setsOrder,
      });

      // Сохраняем настройки
      const settingsState = stores.useSettingsStore.getState();
      StorageService.setObject(STORAGE_KEYS.SETTINGS, settingsState.settings);

      return true;
    } catch (error) {
      console.error('Failed to save data:', error);
      return false;
    }
  },

  /**
   * Сохранить только карточки (для автосохранения)
   */
  saveCards(): void {
    const stores = getStores();
    const state = stores.useCardsStore.getState();
    StorageService.setObject(STORAGE_KEYS.CARDS, {
      cards: state.cards,
      cardsBySet: state.cardsBySet,
    });
  },

  /**
   * Сохранить только наборы
   */
  saveSets(): void {
    const stores = getStores();
    const state = stores.useSetsStore.getState();
    StorageService.setObject(STORAGE_KEYS.SETS, {
      sets: state.sets,
      setsOrder: state.setsOrder,
    });
  },

  /**
   * Сохранить курсы
   */
  saveCourses(): void {
    const stores = getStores();
    stores.useCoursesStore.getState().saveCourses();
  },

  /**
   * Сохранить настройки
   */
  saveSettings(): void {
    const stores = getStores();
    const state = stores.useSettingsStore.getState();
    StorageService.setObject(STORAGE_KEYS.SETTINGS, state.settings);
  },

  /**
   * Очистить все данные
   */
  clearAll(): void {
    StorageService.clearAll();
    
    const stores = getStores();
    // Сбрасываем store
    stores.useCardsStore.getState().clearCards();
    stores.useSetsStore.getState().clearSets();
    stores.useCoursesStore.getState().clearCourses();
    stores.useSettingsStore.getState().resetSettings();
  },

  /**
   * Экспорт данных в JSON
   */
  exportData(): string {
    const stores = getStores();
    const data: PersistedData = {
      cards: stores.useCardsStore.getState().cards,
      cardsBySet: stores.useCardsStore.getState().cardsBySet,
      sets: stores.useSetsStore.getState().sets,
      setsOrder: stores.useSetsStore.getState().setsOrder,
      settings: stores.useSettingsStore.getState().settings,
      version: CURRENT_VERSION,
    };

    return JSON.stringify(data, null, 2);
  },

  /**
   * Импорт данных из JSON
   */
  async importData(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString) as PersistedData;

      // Валидация версии
      if (!data.version || data.version > CURRENT_VERSION) {
        throw new Error('Unsupported data version');
      }

      const stores = getStores();
      // Загружаем данные в store
      if (data.cards && data.cardsBySet) {
        stores.useCardsStore.setState({
          cards: data.cards,
          cardsBySet: data.cardsBySet,
        });
      }

      if (data.sets && data.setsOrder) {
        stores.useSetsStore.setState({
          sets: data.sets,
          setsOrder: data.setsOrder,
        });
      }

      if (data.settings) {
        stores.useSettingsStore.getState().updateSettings(data.settings);
      }

      // Сохраняем в хранилище
      await this.saveAll();

      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  },
};

// ==================== АВТОСОХРАНЕНИЕ ====================

let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Запланировать сохранение с debounce
 */
export function scheduleSave(saveType: 'cards' | 'sets' | 'settings' | 'all' = 'all'): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    switch (saveType) {
      case 'cards':
        DatabaseService.saveCards();
        break;
      case 'sets':
        DatabaseService.saveSets();
        break;
      case 'settings':
        DatabaseService.saveSettings();
        break;
      case 'all':
        DatabaseService.saveAll();
        break;
    }
  }, 3000); // 3 секунды debounce
}

/**
 * Подписка на изменения store для автосохранения
 */
export function setupAutoSave(): () => void {
  const stores = getStores();
  const unsubCards = stores.useCardsStore.subscribe(() => scheduleSave('cards'));
  const unsubSets = stores.useSetsStore.subscribe(() => scheduleSave('sets'));
  const unsubSettings = stores.useSettingsStore.subscribe(() => scheduleSave('settings'));

  return () => {
    unsubCards();
    unsubSets();
    unsubSettings();
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
  };
}
