/**
 * Мост к виджету на экране блокировки (plan/widgets.md, шаг 1.2) — iOS.
 *
 * Тот же API, что у widgetBridge.ts: Metro на iOS подхватывает этот файл, на Android и в вебе —
 * widgetBridge.ts, который ничего не делает. Нативная часть — ios/FlashcardsApp/FlashlyWidgetBridge.swift.
 */
import { NativeModules } from 'react-native';

interface FlashlyWidgetBridgeModule {
  setSnapshot(json: string): Promise<void>;
  clear(): Promise<void>;
  readReveals(): Promise<number>;
  installedWidgets(): Promise<string[]>;
}

const native: FlashlyWidgetBridgeModule | undefined = NativeModules.FlashlyWidgetBridge;

/** Виджет есть только на iOS и только в сборке с нативным модулем */
export const isWidgetSupported = !!native;

export async function setWidgetSnapshot(json: string): Promise<void> {
  await native?.setSnapshot(json);
}

export async function clearWidget(): Promise<void> {
  await native?.clear();
}

/** Нажатия «Показать» на виджете с прошлого раза (счётчик сбрасывается) */
export async function readWidgetReveals(): Promise<number> {
  return (await native?.readReveals()) ?? 0;
}

/** Размеры поставленных виджетов: accessoryRectangular / accessoryInline / accessoryCircular */
export async function installedWidgets(): Promise<string[]> {
  return (await native?.installedWidgets()) ?? [];
}
