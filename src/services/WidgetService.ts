/**
 * Синхронизация виджета на экране блокировки (plan/widgets.md, шаг 1.2)
 * @description Главная отдаёт сюда функцию, которая собирает входные данные расписания
 * (карточки курса, день урока, серия). Сервис пересчитывает расписание (WidgetPlanner) не чаще
 * раза в 5 секунд, а при уходе приложения в фон — сразу, и кладёт его в App Group через мост.
 * При возврате в приложение — замечает поставленные и убранные виджеты и нажатия «Показать».
 * На Android и в вебе мост ничего не делает (widgetBridge.ts), сервис тоже.
 */
import { AppState } from 'react-native';
import { buildWidgetSnapshot, type WidgetPlanInput } from './WidgetPlanner';
import {
  clearWidget,
  installedWidgets,
  isWidgetSupported,
  readWidgetReveals,
  setWidgetSnapshot,
} from './widgetBridge';
import { readCache, writeCache } from './localCache';
import { Analytics } from './analytics';

const SYNC_DELAY_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALLED_CACHE = 'widget_installed';

type InputGetter = () => WidgetPlanInput | null;

let getInput: InputGetter | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastKey: string | null = null;
let appStateSubscribed = false;

/** Записать расписание сейчас (если оно изменилось) */
async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const input = getInput?.();
  if (!input) return;
  const snapshot = buildWidgetSnapshot(input);
  // Последняя запись («давно не заходил») сдвигается с каждой секундой — без неё и generatedAt
  // расписание меняется только при новых ответах, карточках или переходе в следующий слот
  const key = JSON.stringify(snapshot.entries.slice(0, -1));
  if (key === lastKey) return;
  try {
    await setWidgetSnapshot(JSON.stringify(snapshot));
    lastKey = key;
  } catch (e) {
    console.warn('[widget] Не удалось записать расписание:', e);
  }
}

function subscribeAppState() {
  if (appStateSubscribed) return;
  appStateSubscribed = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      flush();
    } else if (state === 'active') {
      // Пока приложение было в фоне, наступил новый слот или новый день
      scheduleFlush();
      checkWidgetUsage();
    }
  });
}

function scheduleFlush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, SYNC_DELAY_MS);
}

/**
 * Обновить виджет. Вызывает главная при каждом изменении карточек, урока или серии;
 * getter читается в момент записи, поэтому должен собирать данные заново (план урока на «сейчас»).
 */
export function syncWidget(getter: InputGetter): void {
  if (!isWidgetSupported) return;
  getInput = getter;
  subscribeAppState();
  scheduleFlush();
}

/** Выход из аккаунта: стираем расписание, виджет показывает «Открой Flashly» */
export async function resetWidget(): Promise<void> {
  if (!isWidgetSupported) return;
  if (timer) clearTimeout(timer);
  timer = null;
  getInput = null;
  lastKey = null;
  try {
    await clearWidget();
  } catch (e) {
    console.warn('[widget] Не удалось очистить виджет:', e);
  }
}

/** Поставленные и убранные виджеты, нажатия «Показать» — в аналитику */
export async function checkWidgetUsage(): Promise<void> {
  if (!isWidgetSupported) return;
  try {
    const now = Date.now();
    const families = await installedWidgets();
    const known = readCache<Record<string, number>>(INSTALLED_CACHE) ?? {};
    const next: Record<string, number> = {};
    for (const family of families) {
      next[family] = known[family] ?? now;
      if (!known[family]) Analytics.widgetInstalled(family);
    }
    for (const [family, since] of Object.entries(known)) {
      if (!families.includes(family)) {
        Analytics.widgetRemoved({ family, daysKept: Math.floor((now - since) / DAY_MS) });
      }
    }
    writeCache(INSTALLED_CACHE, next);

    const reveals = await readWidgetReveals();
    if (reveals > 0) Analytics.widgetReveals(reveals);
  } catch (e) {
    console.warn('[widget] Не удалось проверить виджеты:', e);
  }
}
