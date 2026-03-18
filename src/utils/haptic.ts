import { Platform } from 'react-native';

export function triggerHaptic(type: string = 'selection') {
  if (Platform.OS === 'ios') {
    try {
      const haptic = require('react-native-haptic-feedback');
      (haptic.default || haptic).trigger(type);
    } catch {}
  }
}
