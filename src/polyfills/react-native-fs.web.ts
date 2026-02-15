// Web polyfill for react-native-fs (not needed on web)
export default {
  CachesDirectoryPath: '/tmp',
  writeFile: () => Promise.resolve(),
  unlink: () => Promise.resolve(),
  exists: () => Promise.resolve(false),
};
