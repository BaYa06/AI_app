/**
 * App.tsx
 * @description Главный компонент приложения
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, View, StyleSheet, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppNavigator } from '@/navigation';
import { LoadingSplash } from '@/components/common';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { DatabaseService, setupAutoSave, supabase, NeonService, setAnalyticsUserId, SyncQueueService } from '@/services';
import { refreshPushToken, subscribeForegroundMessages } from '@/services/pushNotifications';
import { useThemeColors, useSettingsStore } from '@/store';
import { CourseInviteModal } from '@/components/CourseInviteModal';
import { useCoursesStore } from '@/store';
import { WelcomeScreen } from '@/screens/WelcomeScreen';
import { NameOnboardingScreen } from '@/screens/NameOnboardingScreen';
import { RoleSelectionScreen } from '@/screens/RoleSelectionScreen';
import { LearningGoalScreen } from '@/screens/LearningGoalScreen';
import { DailyGoalScreen } from '@/screens/DailyGoalScreen';
import { TeacherSubjectScreen } from '@/screens/TeacherSubjectScreen';
import { TeacherGroupSizeScreen } from '@/screens/TeacherGroupSizeScreen';

import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Стили для веб-платформы (iOS PWA scroll fix)
const webStyles = Platform.OS === 'web' ? StyleSheet.create({
  scrollContainer: {
    position: 'absolute' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'auto' as any,
    // @ts-ignore - web-only properties
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'none',
    overscrollBehaviorY: 'none',
  },
}) : undefined;

type AuthStep = 'welcome' | 'name' | 'role' | 'goal' | 'daily' | 'teacher_subject' | 'teacher_size';

type AppRootProps = {
  isReady: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  pendingInviteToken: string | null;
  onInviteAccepted: (courseId: string, courseTitle: string) => void;
  onInviteDismiss: () => void;
  currentUserId: string | null;
  onBackToWelcome: () => void;
  onBackToName: () => void;
  onBackToRole: () => void;
  onBackToGoal: () => void;
  onBackToTeacherSubject: () => void;
  onSubmitName: (name?: string) => void;
  onSubmitRole: (role: string) => void;
  onSubmitGoal: (goalId: string) => void;
  onSubmitDaily: (dailyId: string) => void;
  onSubmitTeacherSubject: (subjectId: string) => void;
  onSubmitTeacherSize: (sizeId: string) => void;
  authStep: AuthStep;
  authLoading: boolean;
};

function AppRoot({
  isReady,
  isAuthenticated,
  needsOnboarding,
  pendingInviteToken,
  onInviteAccepted,
  onInviteDismiss,
  currentUserId,
  onBackToWelcome,
  onBackToName,
  onBackToRole,
  onBackToGoal,
  onBackToTeacherSubject,
  onSubmitName,
  onSubmitRole,
  onSubmitGoal,
  onSubmitDaily,
  onSubmitTeacherSubject,
  onSubmitTeacherSize,
  authStep,
  authLoading,
}: AppRootProps) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const insets = useSafeAreaInsets();

  // ✅ уменьшаем safe-area сверху на 15px
  const top = insets.top > 0 ? Math.max(insets.top - 15, 0) : 0;
  // ✅ для PWA полностью убираем bottom safe-area, для нативных урезаем на 15px
  const bottom = Platform.OS === 'web' 
    ? 0 
    : (insets.bottom > 0 ? Math.max(insets.bottom - 15, 0) : 0);


  // Синхронизируем meta theme-color с текущей темой (только веб)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const meta = document.querySelector('meta[name=\"theme-color\"]');
    const themeColor = resolvedTheme === 'dark' ? '#101122' : '#FFFFFF';

    if (meta) {
      meta.setAttribute('content', themeColor);
    } else {
      const newMeta = document.createElement('meta');
      newMeta.name = 'theme-color';
      newMeta.content = themeColor;
      document.head.appendChild(newMeta);
    }
  }, [resolvedTheme]);

  // Контент приложения
  const appContent = (
    <>
      {!isReady ? (
        <LoadingSplash />
      ) : isAuthenticated && !needsOnboarding ? (
        <AppNavigator />
      ) : (
        authStep === 'welcome' ? (
          <WelcomeScreen isLoading={authLoading} />
        ) : authStep === 'name' ? (
          <NameOnboardingScreen
            onBack={onBackToWelcome}
            onContinue={onSubmitName}
            onSkip={onSubmitName}
          />
        ) : authStep === 'role' ? (
          <RoleSelectionScreen
            onBack={onBackToName}
            onContinue={onSubmitRole}
          />
        ) : authStep === 'goal' ? (
          <LearningGoalScreen
            onBack={onBackToRole}
            onContinue={onSubmitGoal}
          />
        ) : authStep === 'daily' ? (
          <DailyGoalScreen
            onBack={onBackToGoal}
            onContinue={onSubmitDaily}
          />
        ) : authStep === 'teacher_subject' ? (
          <TeacherSubjectScreen
            onBack={onBackToRole}
            onContinue={onSubmitTeacherSubject}
          />
        ) : authStep === 'teacher_size' ? (
          <TeacherGroupSizeScreen
            onBack={onBackToTeacherSubject}
            onContinue={onSubmitTeacherSize}
          />
        ) : (
          <WelcomeScreen isLoading={authLoading} />
        )
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: isReady ? colors.background : '#ffffff' }}>
      {/* Safe-area зона сверху под цвет темы (белая на загрузке) */}
      <View style={{ height: top, backgroundColor: isReady ? colors.background : '#ffffff' }} />

      <GestureHandlerRootView style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          // На веб оборачиваем в scroll-контейнер для фиксации iOS overscroll
          <View style={webStyles?.scrollContainer}>
            {appContent}
          </View>
        ) : (
          // На нативных платформах используем как есть
          appContent
        )}
      </GestureHandlerRootView>

      {/* Модалка принятия приглашения в курс */}
      {isAuthenticated && pendingInviteToken && (
        <CourseInviteModal
          token={pendingInviteToken}
          userId={currentUserId}
          onAccepted={onInviteAccepted}
          onDismiss={onInviteDismiss}
        />
      )}
    </View>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('welcome');
  const [onboardingData, setOnboardingData] = useState<{
    displayName?: string;
    role?: 'student' | 'teacher';
    learningGoal?: string;
    dailyGoal?: string;
    teacherSubject?: string;
    teacherGroupSize?: string;
  }>({});
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const ensuredUserIdRef = useRef<string | null>(null);
  const processedOAuthCodeRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        const loaded = await DatabaseService.loadAll();
        if (!isMounted) return;
        if (loaded) {
          unsubscribe = setupAutoSave();
          SyncQueueService.init();
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
          setAuthChecked(true);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
      DatabaseService.saveAll();
    };
  }, []);

  // Общая логика обработки сессии: определить новый/возвращающийся пользователь
  const handleSession = useCallback(async (user: { id: string; email?: string; user_metadata?: any }) => {
    setCurrentUserId(user.id);
    if (ensuredUserIdRef.current !== user.id) {
      ensuredUserIdRef.current = user.id;
      await NeonService.ensureUserExists({
        id: user.id,
        email: user.email,
        displayName: (user.user_metadata as any)?.full_name,
      });
    }

    setAuthLoading(true);
    const completed = await NeonService.checkOnboardingCompleted(user.id);
    setAuthLoading(false);

    if (completed) {
      setIsAuthenticated(true);
      setNeedsOnboarding(false);
      DatabaseService.reloadRemoteDataForUser(user.id);
      setAnalyticsUserId(user.id);
      refreshPushToken(user.id).catch(() => {});
    } else {
      // Новый пользователь — начинаем онбординг
      setIsAuthenticated(true);
      setNeedsOnboarding(true);
      setAuthStep('name');
    }
  }, []);

  // Синхронизация isAuthenticated с сессией Supabase
  useEffect(() => {
    let isMounted = true;

    if (!supabase?.auth) {
      console.warn('⚠️ Supabase не инициализирован');
      return;
    }

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Supabase session error:', error.message);
        }
        const user = data.session?.user;
        if (user) {
          await handleSession(user);
        } else {
          setIsAuthenticated(false);
        }
      })
      .catch((error) => {
        console.error('⚠️ Ошибка получения сессии:', error);
      });

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        await handleSession(session.user);
      } else {
        setCurrentUserId(null);
        setIsAuthenticated(false);
        setNeedsOnboarding(false);
        setAnalyticsUserId(null);
        ensuredUserIdRef.current = null;
        setAuthStep('welcome');
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [handleSession]);

  // Подписка на foreground push-сообщения (показываем alert, пока приложение открыто)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    subscribeForegroundMessages((msg) => {
      if (msg.title || msg.body) {
        // Показываем нативное браузерное уведомление, даже когда вкладка в фокусе
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(msg.title || 'Flashly', { body: msg.body, icon: '/icons/icon-192.png' });
        }
      }
    });
  }, []);

  // Обработка /join/TOKEN или ?join=TOKEN на вебе (PWA)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    // Вариант 1: /join/TOKEN (прямая ссылка, если SPA catch-all)
    const path = window.location.pathname;
    const joinMatch = path.match(/\/join\/([a-f0-9]{64})/);
    if (joinMatch) {
      console.log('[invite] Web URL detected, token:', joinMatch[1].slice(0, 8) + '...');
      setPendingInviteToken(joinMatch[1]);
      return;
    }

    // Вариант 2: ?join=TOKEN (переход с landing page)
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get('join');
    if (joinParam && /^[a-f0-9]{64}$/.test(joinParam)) {
      console.log('[invite] Query param detected, token:', joinParam.slice(0, 8) + '...');
      setPendingInviteToken(joinParam);
      // Очистить query из URL
      window.history.replaceState({}, '', '/');
    }
  }, []);

  /**
   * Handle OAuth deep links from Supabase (PKCE flow).
   * When the app is opened via flashly://auth-callback?code=..., exchange code for a session.
   */
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const getParamFromUrl = (rawUrl: string, name: string): string | null => {
      if (!rawUrl || !name) return null;
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const queryOrHashPattern = new RegExp(`[?#&]${escapedName}=([^&#]*)`);
      const match = rawUrl.match(queryOrHashPattern);
      if (!match?.[1]) return null;
      try {
        return decodeURIComponent(match[1].replace(/\+/g, ' '));
      } catch {
        return match[1];
      }
    };

    const handleUrl = async (url: string) => {
      try {
        // Обработка приглашения: /join/TOKEN
        const joinMatch = url.match(/\/join\/([a-f0-9]{64})/);
        if (joinMatch) {
          console.log('[invite] Deep link detected, token:', joinMatch[1].slice(0, 8) + '...');
          setPendingInviteToken(joinMatch[1]);
          return;
        }

        const existingSession = await supabase.auth.getSession();
        if (existingSession.data.session) {
          console.log('[auth] Session already established, skipping deep-link exchange');
          return;
        }

        // Parse the authorization code from query or hash.
        const code = getParamFromUrl(url, 'code');

        if (!code) {
          console.warn('[auth] No code found in deep link URL:', url);
          return;
        }

        if (processedOAuthCodeRef.current === code) {
          console.log('[auth] Skipping duplicate OAuth code exchange');
          return;
        }
        processedOAuthCodeRef.current = code;

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Supabase code exchange failed:', error.message);
          processedOAuthCodeRef.current = null;
        }
      } catch (e) {
        console.error('[auth] Failed to handle deep link:', e);
        processedOAuthCodeRef.current = null;
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    // Also handle the cold-start case when the app was opened from a deep link.
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleBackToWelcome = useCallback(async () => {
    setAuthStep('welcome');
    setNeedsOnboarding(false);
    setOnboardingData({});
    // Выход из OAuth, т.к. пользователь уже авторизован
    await supabase.auth.signOut();
  }, []);

  const handleBackToName = useCallback(() => {
    setAuthStep('name');
  }, []);

  const handleBackToRole = useCallback(() => {
    setAuthStep('role');
  }, []);

  const handleBackToGoal = useCallback(() => {
    setAuthStep('goal');
  }, []);

  const handleBackToTeacherSubject = useCallback(() => {
    setAuthStep('teacher_subject');
  }, []);

  const handleSubmitName = useCallback((name?: string) => {
    setOnboardingData((prev) => ({ ...prev, displayName: name }));
    setAuthStep('role');
  }, []);

  const handleSubmitRole = useCallback((role: string) => {
    const r = role as 'student' | 'teacher';
    setOnboardingData((prev) => ({ ...prev, role: r }));
    if (r === 'teacher') {
      setAuthStep('teacher_subject');
    } else {
      setAuthStep('goal');
    }
  }, []);

  const handleSubmitGoal = useCallback((goalId: string) => {
    setOnboardingData((prev) => ({ ...prev, learningGoal: goalId }));
    setAuthStep('daily');
  }, []);

  const finishOnboarding = useCallback(async (finalData: typeof onboardingData) => {
    if (!currentUserId) return;
    await NeonService.saveOnboardingData(currentUserId, {
      displayName: finalData.displayName,
      teacher: finalData.role === 'teacher',
      learningGoal: finalData.learningGoal,
      dailyGoal: finalData.dailyGoal,
      teacherSubject: finalData.teacherSubject,
      teacherGroupSize: finalData.teacherGroupSize,
    });
    setNeedsOnboarding(false);
    DatabaseService.reloadRemoteDataForUser(currentUserId);
    setAnalyticsUserId(currentUserId);
    refreshPushToken(currentUserId).catch(() => {});
  }, [currentUserId]);

  const handleSubmitDaily = useCallback((dailyId: string) => {
    const finalData = { ...onboardingData, dailyGoal: dailyId };
    setOnboardingData(finalData);
    finishOnboarding(finalData);
  }, [onboardingData, finishOnboarding]);

  const handleSubmitTeacherSubject = useCallback((subjectId: string) => {
    setOnboardingData((prev) => ({ ...prev, teacherSubject: subjectId }));
    setAuthStep('teacher_size');
  }, []);

  const handleSubmitTeacherSize = useCallback((sizeId: string) => {
    const finalData = { ...onboardingData, teacherGroupSize: sizeId };
    setOnboardingData(finalData);
    finishOnboarding(finalData);
  }, [onboardingData, finishOnboarding]);

  const handleInviteAccepted = useCallback((courseId: string, courseTitle: string) => {
    setPendingInviteToken(null);
    // Добавить курс в стор и перезагрузить данные
    const addCourse = useCoursesStore.getState();
    addCourse.courses.push({
      id: courseId,
      title: courseTitle,
      createdAt: Date.now(),
      isStudentCourse: true,
    });
    // Перезагрузить данные с сервера
    if (currentUserId) {
      DatabaseService.reloadRemoteDataForUser(currentUserId);
    }
    Alert.alert('Готово', `Вы присоединились к курсу "${courseTitle}"`);
  }, [currentUserId]);

  const handleInviteDismiss = useCallback(() => {
    setPendingInviteToken(null);
  }, []);

  const appReady = isReady && authChecked;

  // На вебе (PWA) урезаем safe-area, чтобы на iPhone не было лишнего отступа.
  // Вместо полного обнуления используем урезание в AppRoot компоненте.
  const webSafeAreaOverride = Platform.OS === 'web' ? {
    frame: { x: 0, y: 0, width: 0, height: 0 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } : undefined;

  return (
    <ErrorBoundary>
    <SafeAreaProvider initialMetrics={webSafeAreaOverride}>
      <AppRoot
        isReady={appReady}
        isAuthenticated={isAuthenticated}
        needsOnboarding={needsOnboarding}
        pendingInviteToken={pendingInviteToken}
        onInviteAccepted={handleInviteAccepted}
        onInviteDismiss={handleInviteDismiss}
        currentUserId={currentUserId}
        onBackToWelcome={handleBackToWelcome}
        onBackToName={handleBackToName}
        onBackToRole={handleBackToRole}
        onBackToGoal={handleBackToGoal}
        onBackToTeacherSubject={handleBackToTeacherSubject}
        onSubmitName={handleSubmitName}
        onSubmitRole={handleSubmitRole}
        onSubmitGoal={handleSubmitGoal}
        onSubmitDaily={handleSubmitDaily}
        onSubmitTeacherSubject={handleSubmitTeacherSubject}
        onSubmitTeacherSize={handleSubmitTeacherSize}
        authStep={authStep}
        authLoading={authLoading}
      />
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}
