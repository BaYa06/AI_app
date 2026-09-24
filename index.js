/**
 * Точка входа приложения
 */
import 'react-native-reanimated';
import 'text-encoding';
import 'react-native-get-random-values';
import './src/polyfills/crypto';

import { AppRegistry, Platform } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

// Push в фоне/закрытом приложении: баннер показывает iOS, но обработчик должен быть
// зарегистрирован до старта приложения, иначе RNFirebase пишет предупреждение.
// Только iOS — на Android Firebase ещё не настроен (нет google-services.json).
if (Platform.OS === 'ios') {
  const { getApp } = require('@react-native-firebase/app');
  const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
  setBackgroundMessageHandler(getMessaging(getApp()), async () => {});
}

AppRegistry.registerComponent(appName, () => App);
