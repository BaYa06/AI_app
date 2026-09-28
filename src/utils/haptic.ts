import { Platform } from 'react-native';
import { useSettingsStore } from '@/store/settingsStore';

export function triggerHaptic(type: string = 'selection') {
  if (!useSettingsStore.getState().settings.hapticEnabled) return;
  if (Platform.OS === 'ios') {
    try {
      const haptic = require('react-native-haptic-feedback');
      (haptic.default || haptic).trigger(type);
    } catch {}
  }
}
