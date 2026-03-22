/**
 * Точка входа приложения
 */
import 'react-native-reanimated';
import 'text-encoding';
import 'react-native-get-random-values';
import './src/polyfills/crypto';

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
