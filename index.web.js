import { AppRegistry } from 'react-native';
import App from './src/App';

AppRegistry.registerComponent('FlashcardsApp', () => App);
AppRegistry.runApplication('FlashcardsApp', {
  rootTag: document.getElementById('root'),
});
