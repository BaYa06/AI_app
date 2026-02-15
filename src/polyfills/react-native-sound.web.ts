// Web polyfill for react-native-sound (not needed on web, web uses HTML5 Audio)
export default class Sound {
  static setCategory() {}
  constructor(_filename: string, _basePath: string, callback?: (error: any) => void) {
    if (callback) callback(null);
  }
  play(callback?: (success: boolean) => void) { if (callback) callback(true); }
  stop() { return this; }
  release() {}
  setVolume() { return this; }
}
