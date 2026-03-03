// Web stub for react-native-image-picker (native-only module, on web we use <input type="file">)
export function launchImageLibrary() {
  return Promise.resolve({ didCancel: true, assets: [] });
}

export function launchCamera() {
  return Promise.resolve({ didCancel: true, assets: [] });
}
