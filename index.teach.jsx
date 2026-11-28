import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeachApp } from './src/web/TeachApp';

// Веб-кабинет учителя (plan/new/web_cabinet.md). Service worker не регистрируем:
// кабинет без офлайна, обновление версии — обычная перезагрузка страницы.
const root = createRoot(document.getElementById('root'));
root.render(<TeachApp />);
