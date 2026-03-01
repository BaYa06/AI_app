/**
 * App Navigator
 * @description Главный навигатор приложения
 */
import React, { Suspense, useEffect, useMemo } from 'react';
import { Platform, ActivityIndicator, View } from 'react-native';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useThemeColors } from '@/store';
import type { RootStackParamList, MainTabParamList } from '@/types/navigation';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Eager — основные табы (нужны сразу)
import { HomeScreen } from '@/screens/HomeScreen.new';
import { LibraryScreen } from '@/screens/LibraryScreen';
import { StudyPlaceholderScreen } from '@/screens/StudyPlaceholderScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { SetDetailScreen } from '@/screens/SetDetailScreen';

// Lazy — вторичные экраны (загружаются по необходимости)
const StatisticsScreen = React.lazy(() => import('@/screens/StatisticsScreen').then(m => ({ default: m.StatisticsScreen })));
const StudyResultsScreen = React.lazy(() => import('@/screens/StudyResultsScreen').then(m => ({ default: m.StudyResultsScreen })));
const CardEditorScreen = React.lazy(() => import('@/screens/CardEditorScreen').then(m => ({ default: m.CardEditorScreen })));
const SetEditorScreen = React.lazy(() => import('@/screens/SetEditorScreen').then(m => ({ default: m.SetEditorScreen })));
const MatchScreen = React.lazy(() => import('@/screens/MatchScreen').then(m => ({ default: m.MatchScreen })));
const MultipleChoiceScreen = React.lazy(() => import('@/screens/MultipleChoiceScreen').then(m => ({ default: m.MultipleChoiceScreen })));
const WordBuilderScreen = React.lazy(() => import('@/screens/WordBuilderScreen').then(m => ({ default: m.WordBuilderScreen })));
const AudioLearningScreen = React.lazy(() => import('@/screens/AudioLearningScreen').then(m => ({ default: m.AudioLearningScreen })));
const StudyScreen = React.lazy(() => import('@/screens/StudyScreen').then(m => ({ default: m.StudyScreen })));
const AchievementsScreen = React.lazy(() => import('@/screens/AchievementsScreen').then(m => ({ default: m.AchievementsScreen })));
const NotificationSettingsScreen = React.lazy(() => import('@/screens/NotificationSettingsScreen').then(m => ({ default: m.NotificationSettingsScreen })));
const LibrarySetDetailScreen = React.lazy(() => import('@/screens/LibrarySetDetailScreen').then(m => ({ default: m.LibrarySetDetailScreen })));
const MyPublicationsScreen = React.lazy(() => import('@/screens/MyPublicationsScreen').then(m => ({ default: m.MyPublicationsScreen })));
const PersonalInfoScreen = React.lazy(() => import('@/screens/PersonalInfoScreen').then(m => ({ default: m.PersonalInfoScreen })));
const SecurityScreen = React.lazy(() => import('@/screens/SecurityScreen').then(m => ({ default: m.SecurityScreen })));
const SubscriptionScreen = React.lazy(() => import('@/screens/SubscriptionScreen').then(m => ({ default: m.SubscriptionScreen })));

function LazyFallback() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" />
    </View>
  );
}

function withSuspense<P extends object>(LazyComponent: React.LazyExoticComponent<React.ComponentType<P>>) {
  return function SuspenseWrapper(props: P) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

const LazyStatisticsScreen = withSuspense(StatisticsScreen);
const LazyStudyResultsScreen = withSuspense(StudyResultsScreen);
const LazyCardEditorScreen = withSuspense(CardEditorScreen);
const LazySetEditorScreen = withSuspense(SetEditorScreen);
const LazyMatchScreen = withSuspense(MatchScreen);
const LazyMultipleChoiceScreen = withSuspense(MultipleChoiceScreen);
const LazyWordBuilderScreen = withSuspense(WordBuilderScreen);
const LazyAudioLearningScreen = withSuspense(AudioLearningScreen);
const LazyStudyScreen = withSuspense(StudyScreen);
const LazyAchievementsScreen = withSuspense(AchievementsScreen);
const LazyNotificationSettingsScreen = withSuspense(NotificationSettingsScreen);
const LazyLibrarySetDetailScreen = withSuspense(LibrarySetDetailScreen);
const LazyMyPublicationsScreen = withSuspense(MyPublicationsScreen);
const LazyPersonalInfoScreen = withSuspense(PersonalInfoScreen);
const LazySecurityScreen = withSuspense(SecurityScreen);
const LazySubscriptionScreen = withSuspense(SubscriptionScreen);

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ==================== TAB NAVIGATOR ====================

function MainTabs() {
  const colors = useThemeColors();
  const tabBarPaddingBottom = Platform.OS === 'android' ? 15 : 0;
  const tabBarHeight = 46 + tabBarPaddingBottom;

  // Синхронизируем CSS-переменную --app-bg с текущей темой (для ios-pwa-fix.css)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--app-bg', colors.background);
      document.body.style.backgroundColor = colors.background;
    }
  }, [colors.background]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: false,
        safeAreaInsets: { bottom: 0 },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
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
        component={LazyStatisticsScreen}
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

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      Main: {
        path: '',
        screens: {
          Home: '',
          Library: 'library',
          Study: 'study-tab',
          Statistics: 'statistics',
          Profile: 'profile',
        },
      },
      SetDetail: 'set/:setId',
      Match: 'match',
      MultipleChoice: 'multiple-choice',
      WordBuilder: 'word-builder',
      AudioLearning: 'audio-learning',
      Study: 'study',
      StudyResults: 'study-results',
      CardEditor: 'card-editor',
      Achievements: 'achievements',
      NotificationSettings: 'notification-settings',
      LibrarySetDetail: 'library-set/:setId',
      MyPublications: 'my-publications',
      PersonalInfo: 'personal-info',
      Security: 'security',
      Subscription: 'subscription',
      SetEditor: 'set-editor',
    },
  },
};

export function AppNavigator() {
  const colors = useThemeColors();

  return (
    <NavigationContainer linking={linking}>
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
          animation: Platform.OS === 'android' ? 'fade' : 'slide_from_right',
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
          component={LazyMatchScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MultipleChoice"
          component={LazyMultipleChoiceScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="WordBuilder"
          component={LazyWordBuilderScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AudioLearning"
          component={LazyAudioLearningScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Study"
          component={LazyStudyScreen}
          options={{
            title: 'Изучение',
            headerShown: false,
            gestureEnabled: false, // Нельзя свайпнуть назад во время изучения
          }}
        />
        <Stack.Screen
          name="StudyResults"
          component={LazyStudyResultsScreen}
          options={{
            title: 'Результаты',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="CardEditor"
          component={LazyCardEditorScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Achievements"
          component={LazyAchievementsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="NotificationSettings"
          component={LazyNotificationSettingsScreen}
          options={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="LibrarySetDetail"
          component={LazyLibrarySetDetailScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MyPublications"
          component={LazyMyPublicationsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PersonalInfo"
          component={LazyPersonalInfoScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Security"
          component={LazySecurityScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Subscription"
          component={LazySubscriptionScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SetEditor"
          component={LazySetEditorScreen}
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
            ...(Platform.OS === 'android' && {
              animation: 'fade',
            }),
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
