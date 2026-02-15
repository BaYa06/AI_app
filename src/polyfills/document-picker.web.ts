// Web stub for react-native-document-picker (native-only module)
export default {
  pick: () => Promise.reject(new Error('DocumentPicker is not available on web')),
  isCancel: () => false,
  types: {
    allFiles: '*/*',
  },
};
