import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/App';
import IoniconsFont from 'react-native-vector-icons/Fonts/Ionicons.ttf';

const container = document.getElementById('root');
const root = createRoot(container);

// Подключаем шрифт Ionicons для веба
const ioniconsStyle = `
@font-face {
  font-family: Ionicons;
  src: url(${IoniconsFont}) format('truetype');
  font-weight: normal;
  font-style: normal;
}
`;
const styleTag = document.createElement('style');
styleTag.type = 'text/css';
styleTag.appendChild(document.createTextNode(ioniconsStyle));
document.head.appendChild(styleTag);

const render = (Component) => {
  root.render(<Component />);
};

render(App);

if (module.hot) {
  module.hot.accept('./src/App', () => {
    const NextApp = require('./src/App').default;
    render(NextApp);
  });
}
