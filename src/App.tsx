/**
 * App.tsx
 * @description Главный компонент приложения
 */
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '@/navigation';
import { Loading } from '@/components/common';
import { DatabaseService, setupAutoSave } from '@/services';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Инициализация приложения
    async function init(): Promise<void | (() => void)> {
      try {
        // Загружаем данные из хранилища
        await DatabaseService.loadAll();
        
        // Настраиваем автосохранение
        const unsubscribe = setupAutoSave();
        
        setIsReady(true);
        
        // Очистка при размонтировании
        return () => {
          unsubscribe();
          // Сохраняем данные перед закрытием
          DatabaseService.saveAll();
        };
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsReady(true); // Все равно показываем приложение
      }
    }

    init();
  }, []);

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <Loading fullScreen message="Загрузка..." />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
