/**
 * App Navigator
 * @description Главный навигатор приложения
 */
import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/store';
import type { RootStackParamList, MainTabParamList } from '@/types/navigation';
import { Home, Library, BarChart3, User } from 'lucide-react-native';

// Экраны
import { HomeScreen } from '@/screens/HomeScreen.new';
import { LibraryScreen } from '@/screens/LibraryScreen';
import { StatisticsScreen } from '@/screens/StatisticsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { SetDetailScreen } from '@/screens/SetDetailScreen';
import { StudyScreen } from '@/screens/StudyScreen';
import { StudyResultsScreen } from '@/screens/StudyResultsScreen';
import { CardEditorScreen } from '@/screens/CardEditorScreen';
import { SetEditorScreen } from '@/screens/SetEditorScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ==================== TAB NAVIGATOR ====================

function MainTabs() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: Platform.select({
            ios: Math.max(insets.bottom, 8),
            android: 8,
            web: Math.max(insets.bottom, 8),
          }),
          paddingTop: 8,
          height: Platform.select({
            ios: 60 + Math.max(insets.bottom, 8),
            android: 68,
            web: 68 + Math.max(insets.bottom - 8, 0),
          }),
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Главная',
          tabBarIcon: ({ focused, color }) => (
            <Home size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: 'Библиотека',
          tabBarIcon: ({ focused, color }) => (
            <Library size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{
          tabBarLabel: 'Статистика',
          tabBarIcon: ({ focused, color }) => (
            <BarChart3 size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Профиль',
          tabBarIcon: ({ focused, color }) => (
            <User size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ==================== ROOT STACK ====================

export function AppNavigator() {
  const colors = useThemeColors();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SetDetail"
          component={SetDetailScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Study"
          component={StudyScreen}
          options={{
            title: 'Изучение',
            headerShown: false,
            gestureEnabled: false, // Нельзя свайпнуть назад во время изучения
          }}
        />
        <Stack.Screen
          name="StudyResults"
          component={StudyResultsScreen}
          options={{
            title: 'Результаты',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="CardEditor"
          component={CardEditorScreen}
          options={{ title: 'Карточка' }}
        />
        <Stack.Screen
          name="SetEditor"
          component={SetEditorScreen}
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
