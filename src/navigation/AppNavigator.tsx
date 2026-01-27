/**
 * App Navigator
 * @description Главный навигатор приложения
 */
import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useThemeColors } from '@/store';
import type { RootStackParamList, MainTabParamList } from '@/types/navigation';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Экраны
import { HomeScreen } from '@/screens/HomeScreen.new';
import { LibraryScreen } from '@/screens/LibraryScreen';
import { StatisticsScreen } from '@/screens/StatisticsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { SetDetailScreen } from '@/screens/SetDetailScreen';
import { StudyResultsScreen } from '@/screens/StudyResultsScreen';
import { CardEditorScreen } from '@/screens/CardEditorScreen';
import { SetEditorScreen } from '@/screens/SetEditorScreen';
import { MatchScreen } from '@/screens/MatchScreen';
import { MultipleChoiceScreen } from '@/screens/MultipleChoiceScreen';
import { WordBuilderScreen } from '@/screens/WordBuilderScreen';
import { StudyScreen } from '@/screens/StudyScreen';
import { StudyPlaceholderScreen } from '@/screens/StudyPlaceholderScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ==================== TAB NAVIGATOR ====================

function MainTabs() {
  const colors = useThemeColors();

  // Фиксированная высота tab bar для всех платформ
  const tabBarHeight = 66;
  const tabBarPaddingBottom = 20;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: tabBarPaddingBottom,
          paddingTop: 6,
          height: tabBarHeight,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="home" size={31} color={color} />,
        }}
      />
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="albums" size={31} color={color} />,
        }}
      />
      <Tab.Screen
        name="Study"
        component={StudyPlaceholderScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="school" size={31} color={color} />,
        }}
      />
      <Tab.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart" size={31} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="person" size={31} color={color} />,
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
          gestureEnabled: Platform.OS === 'ios',
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
          name="Match"
          component={MatchScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MultipleChoice"
          component={MultipleChoiceScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="WordBuilder"
          component={WordBuilderScreen}
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
