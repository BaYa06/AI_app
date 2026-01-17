/**
 * App.tsx
 * @description Главный компонент приложения
 */
import React, { useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppNavigator } from '@/navigation';
import { Loading } from '@/components/common';
import { DatabaseService, setupAutoSave } from '@/services';
import { useThemeColors } from '@/store';

import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

function AppRoot({ isReady }: { isReady: boolean }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  // ✅ уменьшаем safe-area сверху (например на 10px)
  const top = insets.top > 0 ? Math.max(insets.top - 15, 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Safe-area зона сверху под цвет темы */}
      <View style={{ height: top, backgroundColor: colors.background }} />

      <GestureHandlerRootView style={{ flex: 1 }}>
        {isReady ? <AppNavigator /> : <Loading fullScreen message="Загрузка..." />}
      </GestureHandlerRootView>
    </View>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init(): Promise<void | (() => void)> {
      try {
        await DatabaseService.loadAll();
        const unsubscribe = setupAutoSave();
        setIsReady(true);

        return () => {
          unsubscribe();
          DatabaseService.saveAll();
        };
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsReady(true);
      }
    }

    init();
  }, []);

  return (
    <SafeAreaProvider>
      <AppRoot isReady={isReady} />
    </SafeAreaProvider>
  );
}
