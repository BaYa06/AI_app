// Web polyfill for react-native-tts (no-op on web, web uses Web Speech API)
export default {
  speak: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  setDefaultLanguage: () => Promise.resolve(),
  setDefaultRate: () => Promise.resolve(),
  setDefaultPitch: () => Promise.resolve(),
  getInitStatus: () => Promise.resolve('success'),
  voices: () => Promise.resolve([]),
  addEventListener: () => ({ remove: () => {} }),
};
