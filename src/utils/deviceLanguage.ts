/**
 * Язык телефона — двухбуквенный код (ru, en, de…). Нужен, чтобы заранее выбрать родной язык
 * на онбординге (plan/new/new_user_activation.md, Start 2.2). Intl есть в Hermes и в браузере;
 * без него — запасные источники iOS / Android.
 */
import { NativeModules, Platform } from 'react-native';

function fromLocale(locale: unknown): string | undefined {
  if (typeof locale !== 'string' || !locale) return undefined;
  return locale.replace('_', '-').split('-')[0]?.toLowerCase();
}

export function getDeviceLanguage(): string | undefined {
  try {
    const intl = fromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
    if (intl) return intl;
  } catch {
    // нет Intl — пробуем ниже
  }
  if (Platform.OS === 'ios') {
    const settings = NativeModules.SettingsManager?.settings;
    return fromLocale(settings?.AppleLanguages?.[0] ?? settings?.AppleLocale);
  }
  if (Platform.OS === 'android') return fromLocale(NativeModules.I18nManager?.localeIdentifier);
  if (typeof navigator !== 'undefined') return fromLocale(navigator.language);
  return undefined;
}
