/**
 * Мост к виджету на экране блокировки (plan/widgets.md, шаг 1.2) — Android и веб.
 *
 * Виджет есть только на экране блокировки iPhone (widgetBridge.ios.ts), здесь — ничего не делаем.
 */

export const isWidgetSupported = false;

export async function setWidgetSnapshot(_json: string): Promise<void> {}

export async function clearWidget(): Promise<void> {}

export async function readWidgetReveals(): Promise<number> {
  return 0;
}

export async function installedWidgets(): Promise<string[]> {
  return [];
}
