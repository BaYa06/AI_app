// Web polyfill for react-native-mmkv
export const MMKV = class {
  constructor() {
    this.storage = {};
  }

  set(key, value) {
    this.storage[key] = value;
    localStorage.setItem(key, value);
  }

  getString(key) {
    return localStorage.getItem(key) || undefined;
  }

  getNumber(key) {
    const value = localStorage.getItem(key);
    return value ? parseFloat(value) : undefined;
  }

  getBoolean(key) {
    const value = localStorage.getItem(key);
    return value === 'true';
  }

  delete(key) {
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
