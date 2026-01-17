import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/App';

// Подключаем React DevTools (standalone) в дев-сборке
if (__DEV__) {
  const script = document.createElement('script');
  script.src = 'http://172.20.10.5:8097';
  document.head.appendChild(script);
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
