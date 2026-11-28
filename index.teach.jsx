import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeachApp } from './src/web/TeachApp';
import { initPostHog } from './src/services/posthog';

// Веб-кабинет учителя (plan/new/web_cabinet.md). Service worker не регистрируем:
// кабинет без офлайна, обновление версии — обычная перезагрузка страницы.
// Аналитика: в записях сессий кабинета скрыт весь текст — там данные учеников
initPostHog({ maskAllText: true });

const root = createRoot(document.getElementById('root'));
root.render(<TeachApp />);
