/**
 * Database Service
 * @description Сервис для работы с локальной базой данных (персистентность)
 */
import { StorageService, STORAGE_KEYS } from './StorageService';
import { useCardsStore } from '@/store/cardsStore';
import { useSetsStore } from '@/store/setsStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Card, CardSet, UserSettings } from '@/types';

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
      // Загружаем карточки
      const cardsData = StorageService.getObject<{
        cards: Record<string, Card>;
        cardsBySet: Record<string, string[]>;
      }>(STORAGE_KEYS.CARDS);

      if (cardsData) {
        // Используем setState напрямую для batch update
        useCardsStore.setState({
          cards: cardsData.cards || {},
          cardsBySet: cardsData.cardsBySet || {},
        });
      }

      // Загружаем наборы
      const setsData = StorageService.getObject<{
        sets: Record<string, CardSet>;
        setsOrder: string[];
      }>(STORAGE_KEYS.SETS);

      if (setsData) {
        useSetsStore.setState({
          sets: setsData.sets || {},
          setsOrder: setsData.setsOrder || [],
        });
      }

      // Загружаем настройки
      const settings = StorageService.getObject<UserSettings>(STORAGE_KEYS.SETTINGS);
      if (settings) {
        useSettingsStore.getState().updateSettings(settings);
      }

      return true;
    } catch (error) {
      console.error('Failed to load data:', error);
      return false;
    }
  },

  /**
   * Сохранить все данные из store в хранилище
   */
  async saveAll(): Promise<boolean> {
    try {
      // Сохраняем карточки
      const cardsState = useCardsStore.getState();
      StorageService.setObject(STORAGE_KEYS.CARDS, {
        cards: cardsState.cards,
        cardsBySet: cardsState.cardsBySet,
      });

      // Сохраняем наборы
      const setsState = useSetsStore.getState();
      StorageService.setObject(STORAGE_KEYS.SETS, {
        sets: setsState.sets,
        setsOrder: setsState.setsOrder,
      });

      // Сохраняем настройки
      const settingsState = useSettingsStore.getState();
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
    const state = useCardsStore.getState();
    StorageService.setObject(STORAGE_KEYS.CARDS, {
      cards: state.cards,
      cardsBySet: state.cardsBySet,
    });
  },

  /**
   * Сохранить только наборы
   */
  saveSets(): void {
    const state = useSetsStore.getState();
    StorageService.setObject(STORAGE_KEYS.SETS, {
      sets: state.sets,
      setsOrder: state.setsOrder,
    });
  },

  /**
   * Сохранить настройки
   */
  saveSettings(): void {
    const state = useSettingsStore.getState();
    StorageService.setObject(STORAGE_KEYS.SETTINGS, state.settings);
  },

  /**
   * Очистить все данные
   */
  clearAll(): void {
    StorageService.clearAll();
    
    // Сбрасываем store
    useCardsStore.getState().clearCards();
    useSetsStore.getState().clearSets();
    useSettingsStore.getState().resetSettings();
  },

  /**
   * Экспорт данных в JSON
   */
  exportData(): string {
    const data: PersistedData = {
      cards: useCardsStore.getState().cards,
      cardsBySet: useCardsStore.getState().cardsBySet,
      sets: useSetsStore.getState().sets,
      setsOrder: useSetsStore.getState().setsOrder,
      settings: useSettingsStore.getState().settings,
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

      // Загружаем данные в store
      if (data.cards && data.cardsBySet) {
        useCardsStore.setState({
          cards: data.cards,
          cardsBySet: data.cardsBySet,
        });
      }

      if (data.sets && data.setsOrder) {
        useSetsStore.setState({
          sets: data.sets,
          setsOrder: data.setsOrder,
        });
      }

      if (data.settings) {
        useSettingsStore.getState().updateSettings(data.settings);
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
  const unsubCards = useCardsStore.subscribe(() => scheduleSave('cards'));
  const unsubSets = useSetsStore.subscribe(() => scheduleSave('sets'));
  const unsubSettings = useSettingsStore.subscribe(() => scheduleSave('settings'));

  return () => {
    unsubCards();
    unsubSets();
    unsubSettings();
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
  };
}
