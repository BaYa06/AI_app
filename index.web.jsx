import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/App';

const container = document.getElementById('root');
const root = createRoot(container);

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
