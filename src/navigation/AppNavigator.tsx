/**
 * App Navigator
 * @description Главный навигатор приложения
 */
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { triggerHaptic } from '@/utils/haptic';
import { NavigationContainer, useNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useThemeColors, useSettingsStore } from '@/store';
import type { RootStackParamList, MainTabParamList } from '@/types/navigation';
import { isWidgetUrl } from '@/services/widgetLinks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typography, iconSize, spacing } from '@/constants';
// Панель вкладок — единственное место с Ionicons (брендбук, раздел 6)
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

function BounceIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const scale = useSharedValue(1);
  const prevFocused = React.useRef(false);

  useEffect(() => {
    if (focused && !prevFocused.current) {
      scale.value = withSequence(
        withTiming(1.15, { duration: 130 }),
        withTiming(0.95, { duration: 100 }),
        withTiming(1.0, { duration: 100 }),
      );
    }
    prevFocused.current = focused;
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <ReAnimated.View style={animStyle}>
      <Ionicons name={name} size={iconSize.m} color={color} />
    </ReAnimated.View>
  );
}

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
import { AchievementsScreen } from '@/screens/AchievementsScreen';
import { NotificationSettingsScreen } from '@/screens/NotificationSettingsScreen';
import { LearningSettingsScreen } from '@/screens/LearningSettingsScreen';
import { SoundSettingsScreen } from '@/screens/SoundSettingsScreen';
import { FeedbackScreen } from '@/screens/FeedbackScreen';
import { LibrarySetDetailScreen } from '@/screens/LibrarySetDetailScreen';
import { BookDetailScreen } from '@/screens/BookDetailScreen';
import { CourseBooksScreen } from '@/screens/CourseBooksScreen';
import { MyPublicationsScreen } from '@/screens/MyPublicationsScreen';
import { COMMUNITY_LIBRARY_ENABLED } from '@/config/features';
import { PersonalInfoScreen } from '@/screens/PersonalInfoScreen';
import { SecurityScreen } from '@/screens/SecurityScreen';
import { TeacherCourseStatsScreen } from '@/screens/TeacherCourseStatsScreen';
import { TeacherStudentsScreen } from '@/screens/TeacherStudentsScreen';
import { StudentDetailScreen } from '@/screens/StudentDetailScreen';
import { ExamLobbyScreen } from '@/screens/ExamLobbyScreen';
import { TestHistoryScreen } from '@/screens/TestHistoryScreen';
import { CourseLeaderboardScreen } from '@/screens/CourseLeaderboardScreen';
import { OralTestLobbyScreen } from '@/screens/OralTestLobbyScreen';
import { OralTestSessionScreen } from '@/screens/OralTestSessionScreen';
import { OralTestResultsScreen } from '@/screens/OralTestResultsScreen';
import { TestLobbyScreen } from '@/screens/TestLobbyScreen';
import { LiveTestScreen } from '@/screens/LiveTestScreen';
import { TestResultsTeacherScreen } from '@/screens/TestResultsTeacherScreen';
import { TestJoinScreen } from '@/screens/TestJoinScreen';
import { TestWaitingScreen } from '@/screens/TestWaitingScreen';
import { TestExamScreen } from '@/screens/TestExamScreen';
import { TestDoneScreen } from '@/screens/TestDoneScreen';
import { ContextFillScreen } from '@/screens/ContextFillScreen';
import { AudioLearningScreen } from '@/screens/AudioLearningScreen';
import { ImportFilesScreen } from '@/screens/ImportFilesScreen';
import { PreviewImportScreen } from '@/screens/PreviewImportScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ==================== TAB NAVIGATOR ====================

function MainTabs() {
  const colors = useThemeColors();
  const isTeacher = useSettingsStore((s) => s.isTeacher);
  const insets = useSafeAreaInsets();
  // Иконка 24 + подпись 16 + зазор 4; снизу — полный safe area (или 8 без «полоски Home»)
  const tabBarPaddingTop = spacing.xs;
  const tabBarPaddingBottom = insets.bottom > 0 ? insets.bottom : spacing.xs;
  const tabBarHeight = tabBarPaddingTop + iconSize.m + spacing.xxs + typography.caption.lineHeight! + tabBarPaddingBottom;

  // Синхронизируем CSS-переменную --app-bg с текущей темой (для ios-pwa-fix.css)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--app-bg', colors.background);
      document.body.style.backgroundColor = colors.background;
    }
  }, [colors.background]);

  return (
    <Tab.Navigator
      // Без этого фона экран-вкладка сидит на нативном (белом по умолчанию) фоне окна.
      sceneContainerStyle={{ backgroundColor: colors.background }}
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
          paddingTop: tabBarPaddingTop,
          paddingBottom: tabBarPaddingBottom,
          height: tabBarHeight,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: '600',
          marginTop: spacing.xxs,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        options={{ tabBarLabel: 'Главная', tabBarIcon: ({ color, focused }) => <BounceIcon name="home" color={color} focused={focused} /> }}
        listeners={{ tabPress: () => triggerHaptic('selection') }}
      >
        {(props) => <HomeScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen
        name="Library"
        options={{ tabBarLabel: 'Библиотека', tabBarIcon: ({ color, focused }) => <BounceIcon name="albums" color={color} focused={focused} /> }}
        listeners={{ tabPress: () => triggerHaptic('selection') }}
      >
        {(props) => <LibraryScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen
        name="TestTab"
        options={{
          tabBarLabel: 'Тест',
          tabBarIcon: ({ color, focused }) => <BounceIcon name="qr-code" color={color} focused={focused} />,
          // Подключение к тесту по коду — только для учеников
          ...(isTeacher ? { tabBarButton: () => null, tabBarItemStyle: { display: 'none' } } : null),
        }}
        listeners={{ tabPress: () => triggerHaptic('selection') }}
      >
        {(props) => <TestJoinScreen {...(props as any)} />}
      </Tab.Screen>
      <Tab.Screen
        name="Study"
        options={{
          tabBarIcon: ({ color, focused }) => <BounceIcon name="school" color={color} focused={focused} />,
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
        listeners={{ tabPress: () => triggerHaptic('selection') }}
      >
        {(props) => <StudyPlaceholderScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen
        name="Statistics"
        options={{
          tabBarIcon: ({ color, focused }) => <BounceIcon name="stats-chart" color={color} focused={focused} />,
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
        listeners={{ tabPress: () => triggerHaptic('selection') }}
      >
        {(props) => <StatisticsScreen {...props} />}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{ tabBarLabel: 'Профиль', tabBarIcon: ({ color, focused }) => <BounceIcon name="person" color={color} focused={focused} /> }}
        listeners={{ tabPress: () => triggerHaptic('selection') }}
      >
        {(props) => <ProfileScreen {...props} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ==================== ROOT STACK ====================

// Native-only linking: deep links для iOS/Android.
// На вебе НЕ используется — React Navigation работает как memory router
// (не пишет в window.history, не привязывается к URL).
// Это ключевое решение проблемы с кнопкой "назад": без linking нет URL-based
// сброса стека. Приглашения (/join/TOKEN) обрабатываются отдельно в App.tsx.
// Из flashly:// пропускаем только ссылки виджета (plan/widgets.md, 0.3): lesson и set/<setId>.
// Вход (flashly://auth-callback) и приглашения по-прежнему разбирает App.tsx.
const NATIVE_LINKING: LinkingOptions<RootStackParamList> = {
  prefixes: ['flashly://'],
  filter: isWidgetUrl,
  config: {
    screens: {
      Main: {
        path: '',
        screens: {
          // flashly://lesson?from=widget — главная сама запускает урок дня (экрана урока нет, его собирает главная)
          Home: 'lesson',
          Library: 'library',
          TestTab: 'test',
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
      LearningSettings: 'learning-settings',
      SoundSettings: 'sound-settings',
      Feedback: 'feedback',
      ...(COMMUNITY_LIBRARY_ENABLED ? { LibrarySetDetail: 'library-set/:setId' } : null),
      BookDetail: 'book/:bookId',
      CourseBooks: 'course-books/:courseId',
      ...(COMMUNITY_LIBRARY_ENABLED ? { MyPublications: 'my-publications' } : null),
      PersonalInfo: 'personal-info',
      Security: 'security',
      SetEditor: 'set-editor',
      TeacherCourseStats: 'teacher/:courseId',
      TeacherStudents: 'teacher/:courseId/students',
    },
  },
};

export function AppNavigator() {
  const colors = useThemeColors();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Sentinel: добавляем запись поверх текущей позиции в history.
    // Это нужно чтобы кнопка "назад" вызывала popstate (мы перехватываем),
    // а не уводила пользователя с приложения сразу.
    // URL не меняется — мы явно передаём window.location.href.
    window.history.pushState({ __sentinel: true }, '', window.location.href);

    const handlePopState = () => {
      const nav = navigationRef.current;
      if (nav?.canGoBack()) {
        // Восстанавливаем sentinel для следующего нажатия назад
        window.history.pushState({ __sentinel: true }, '', window.location.href);
        nav.goBack();
      }
      // canGoBack() === false: sentinel не восстанавливаем.
      // Следующий back button выйдет из PWA или уйдёт на предыдущий сайт — это правильно.
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigationRef]);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={Platform.OS !== 'web' ? NATIVE_LINKING : undefined}
    >
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
          animationDuration: 280,
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
          name="AudioLearning"
          component={AudioLearningScreen}
          options={{ headerShown: false, gestureEnabled: false }}
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
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Achievements"
          component={AchievementsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="NotificationSettings"
          component={NotificationSettingsScreen}
          options={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="LearningSettings"
          component={LearningSettingsScreen}
          options={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="SoundSettings"
          component={SoundSettingsScreen}
          options={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="Feedback"
          component={FeedbackScreen}
          options={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 300,
          }}
        />
        {COMMUNITY_LIBRARY_ENABLED && (
          <Stack.Screen
            name="LibrarySetDetail"
            component={LibrarySetDetailScreen}
            options={{ headerShown: false }}
          />
        )}
        <Stack.Screen
          name="BookDetail"
          component={BookDetailScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="CourseBooks"
          component={CourseBooksScreen}
          options={{ headerShown: false }}
        />
        {COMMUNITY_LIBRARY_ENABLED && (
          <Stack.Screen
            name="MyPublications"
            component={MyPublicationsScreen}
            options={{ headerShown: false }}
          />
        )}
        <Stack.Screen
          name="PersonalInfo"
          component={PersonalInfoScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Security"
          component={SecurityScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TeacherCourseStats"
          component={TeacherCourseStatsScreen}
          options={{ headerShown: false, animation: 'slide_from_left', animationDuration: 280 }}
        />
        <Stack.Screen
          name="TeacherStudents"
          component={TeacherStudentsScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="StudentDetail"
          component={StudentDetailScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="ExamLobby"
          component={ExamLobbyScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="TestHistory"
          component={TestHistoryScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="CourseLeaderboard"
          component={CourseLeaderboardScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="OralTestLobby"
          component={OralTestLobbyScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="OralTestSession"
          component={OralTestSessionScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="OralTestResults"
          component={OralTestResultsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TestLobby"
          component={TestLobbyScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="LiveTest"
          component={LiveTestScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="TestResultsTeacher"
          component={TestResultsTeacherScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="TestJoin"
          component={TestJoinScreen}
          options={{ headerShown: false, gestureEnabled: true }}
        />
        <Stack.Screen
          name="TestWaiting"
          component={TestWaitingScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="TestExam"
          component={TestExamScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="TestDone"
          component={TestDoneScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="ContextFill"
          component={ContextFillScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SetEditor"
          component={SetEditorScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ImportFiles"
          component={ImportFilesScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="PreviewImport"
          component={PreviewImportScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
