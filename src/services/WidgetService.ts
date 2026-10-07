/**
 * Синхронизация виджета на экране блокировки (plan/widgets.md, шаг 1.2)
 * @description Главная отдаёт сюда функцию, которая собирает входные данные расписания
 * (карточки курса, день урока, серия). Сервис пересчитывает расписание (WidgetPlanner) не чаще
 * раза в 5 секунд, а при уходе приложения в фон — сразу, и кладёт его в App Group через мост.
 * При возврате в приложение — замечает поставленные и убранные виджеты и нажатия «Показать».
 * На Android и в вебе мост ничего не делает (widgetBridge.ts), сервис тоже.
 */
import { AppState } from 'react-native';
import { buildWidgetSnapshot, todayPoolSplit, type WidgetPlanInput } from './WidgetPlanner';
import { recordExposures, takeReview, type ExposureMap } from './widgetExperiment';
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
/** Локальная дата YYYY-MM-DD (как localDay в challengeStore — без зависимости от store) */
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALLED_CACHE = 'widget_installed';
const EXPOSURE_CACHE = 'widget_exposure';
/**
 * Замер (план, 4.1): половина подходящих слов не идёт в виджет. Выключить после решения
 * в шаге 4.2, если виджет учит, — тогда все подходящие слова снова идут в пул.
 */
const WIDGET_CONTROL_GROUP = true;

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
  const snapshot = buildWidgetSnapshot({ ...input, controlGroup: WIDGET_CONTROL_GROUP });
  if (WIDGET_CONTROL_GROUP) rememberExposures(input);
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

/** Какие слова сегодня в виджете, а какие — контрольные (только пока виджет стоит) */
function rememberExposures(input: WidgetPlanInput) {
  const installed = readCache<Record<string, number>>(INSTALLED_CACHE) ?? {};
  if (Object.keys(installed).length === 0) return;
  const map = readCache<ExposureMap>(EXPOSURE_CACHE) ?? {};
  const next = recordExposures(map, todayPoolSplit(input), localDay());
  if (next !== map) writeCache(EXPOSURE_CACHE, next);
}

/**
 * Ответ в тесте урока дня (MultipleChoiceScreen). Слово было в виджете или в контрольной половине
 * в прошлые дни — отправляем widget_word_reviewed; первое повторение после попадания в группу.
 */
export function reportWidgetReview(cardId: string, correct: boolean): void {
  if (!isWidgetSupported || !WIDGET_CONTROL_GROUP) return;
  const map = readCache<ExposureMap>(EXPOSURE_CACHE);
  if (!map) return;
  const taken = takeReview(map, cardId, localDay());
  if (!taken) return;
  writeCache(EXPOSURE_CACHE, taken.map);
  Analytics.widgetWordReviewed({ inWidget: taken.exposure.inWidget, correct });
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
