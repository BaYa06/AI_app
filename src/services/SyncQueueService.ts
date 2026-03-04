/**
 * Sync Queue Service
 * @description Очередь синхронизации с retry и offline-поддержкой.
 * Все мутации (create/update/delete) добавляются в очередь и
 * отправляются на сервер с retry (1s, 3s, 10s). При отсутствии
 * сети очередь сохраняется в localStorage и обрабатывается при
 * восстановлении соединения.
 */
import { Platform } from 'react-native';
import { StorageService, STORAGE_KEYS } from './StorageService';

// ==================== TYPES ====================

interface SyncTask {
  id: string;
  type: string;          // 'createSet' | 'createCard' | 'updateCardSRS' | ...
  payload: unknown;
  createdAt: number;
  retries: number;
  maxRetries: number;
}

type TaskExecutor = (payload: unknown) => Promise<boolean>;

// ==================== RETRY DELAYS ====================

const RETRY_DELAYS = [1000, 3000, 10000]; // 1s, 3s, 10s

// ==================== SERVICE ====================

let queue: SyncTask[] = [];
let isProcessing = false;
let onlineListener: (() => void) | null = null;
const executors: Record<string, TaskExecutor> = {};

/**
 * Генерировать простой ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Сохранить очередь в localStorage
 */
function persistQueue(): void {
  try {
    StorageService.setObject(STORAGE_KEYS.SYNC_QUEUE, queue);
  } catch {
    // localStorage может быть полон — не критично
  }
}

/**
 * Загрузить очередь из localStorage
 */
function loadQueue(): void {
  const saved = StorageService.getObject<SyncTask[]>(STORAGE_KEYS.SYNC_QUEUE);
  if (saved && Array.isArray(saved)) {
    queue = saved;
  }
}

/**
 * Подождать указанное время
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Проверить доступность сети
 */
function isOnline(): boolean {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.onLine !== false;
  }
  return true; // На нативных платформах считаем что онлайн
}

/**
 * Обработать одну задачу с retry
 */
async function executeTask(task: SyncTask): Promise<boolean> {
  const executor = executors[task.type];
  if (!executor) {
    console.warn(`[SyncQueue] No executor for type: ${task.type}`);
    return true; // Удаляем задачу без исполнителя
  }

  for (let attempt = 0; attempt <= task.maxRetries; attempt++) {
    try {
      const ok = await executor(task.payload);
      if (ok) return true;
    } catch (error) {
      // Ошибка сети или сервера
    }

    // Если не последняя попытка — ждём
    if (attempt < task.maxRetries) {
      const delayMs = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
      await delay(delayMs);
    }
  }

  return false;
}

/**
 * Обработать всю очередь
 */
async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0 || !isOnline()) return;
  isProcessing = true;

  while (queue.length > 0 && isOnline()) {
    const task = queue[0];
    const success = await executeTask(task);

    if (success) {
      queue.shift();
      persistQueue();
    } else {
      // Не удалось выполнить — задача остаётся в очереди,
      // увеличиваем retries для отслеживания
      task.retries++;
      if (task.retries > task.maxRetries * 2) {
        // Слишком много попыток — удаляем безнадёжную задачу
        console.warn(`[SyncQueue] Dropping task after too many retries: ${task.type}`, task.id);
        queue.shift();
        persistQueue();
      } else {
        // Прерываем обработку, попробуем позже
        break;
      }
    }
  }

  isProcessing = false;
}

// ==================== PUBLIC API ====================

export const SyncQueueService = {
  /**
   * Инициализировать очередь: загрузить из localStorage,
   * подписаться на online-событие.
   */
  init(): void {
    loadQueue();

    // Подписка на восстановление сети (только web)
    if (Platform.OS === 'web' && typeof window !== 'undefined' && !onlineListener) {
      onlineListener = () => {
        console.log('[SyncQueue] Back online, processing queue...');
        processQueue();
      };
      window.addEventListener('online', onlineListener);
    }

    // Обработать накопленную очередь
    if (queue.length > 0) {
      processQueue();
    }
  },

  /**
   * Зарегистрировать исполнитель для типа задачи
   */
  registerExecutor(type: string, executor: TaskExecutor): void {
    executors[type] = executor;
  },

  /**
   * Добавить задачу в очередь
   */
  enqueue(type: string, payload: unknown, maxRetries = 3): void {
    const task: SyncTask = {
      id: generateId(),
      type,
      payload,
      createdAt: Date.now(),
      retries: 0,
      maxRetries,
    };

    queue.push(task);
    persistQueue();

    // Попробовать обработать сразу
    processQueue();
  },

  /**
   * Количество задач в очереди
   */
  get pendingCount(): number {
    return queue.length;
  },

  /**
   * Очистить ресурсы
   */
  destroy(): void {
    if (onlineListener && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.removeEventListener('online', onlineListener);
      onlineListener = null;
    }
  },
};
