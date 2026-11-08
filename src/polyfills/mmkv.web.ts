// Web polyfill for react-native-mmkv
export const MMKV = class {
  storage: Record<string, string | number | boolean>;

  constructor() {
    this.storage = {};
  }

  set(key: string, value: string | number | boolean) {
    this.storage[key] = value;
    // setItem и так приводит значение к строке — String() только для типов
    localStorage.setItem(key, String(value));
  }

  getString(key: string) {
    return localStorage.getItem(key) || undefined;
  }

  getNumber(key: string) {
    const value = localStorage.getItem(key);
    return value ? parseFloat(value) : undefined;
  }

  getBoolean(key: string) {
    const value = localStorage.getItem(key);
    return value === 'true';
  }

  delete(key: string) {
    delete this.storage[key];
    localStorage.removeItem(key);
  }

  clearAll() {
    this.storage = {};
    localStorage.clear();
  }

  getAllKeys() {
    return Object.keys(localStorage);
  }
};
