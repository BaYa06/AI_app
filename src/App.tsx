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
import { EmailAuthScreen } from '@/screens/EmailAuthScreen';
import { OTPVerifyScreen } from '@/screens/OTPVerifyScreen';
import { NameOnboardingScreen } from '@/screens/NameOnboardingScreen';
import { LearningGoalScreen } from '@/screens/LearningGoalScreen';
import { DailyGoalScreen } from '@/screens/DailyGoalScreen';
import { SignInScreen } from '@/screens/SignInScreen';

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

type AppRootProps = {
  isReady: boolean;
  isAuthenticated: boolean;
  pendingInviteToken: string | null;
  onInviteAccepted: (courseId: string, courseTitle: string) => void;
  onInviteDismiss: () => void;
  currentUserId: string | null;
  onRequestCode: (email?: string, password?: string) => void;
  onStartEmail: () => void;
  onStartSignIn: () => void;
  onBackToWelcome: () => void;
  onBackToEmail: () => void;
  onBackToGoal: () => void;
  onSubmitOTP: (code: string) => void;
  onSubmitName: (name?: string) => void;
  onSubmitGoal: (goalId: string) => void;
  onSubmitDaily: (dailyId: string) => void;
  authStep: 'welcome' | 'email' | 'otp' | 'name' | 'goal' | 'daily' | 'signin';
};

function AppRoot({
  isReady,
  isAuthenticated,
  pendingInviteToken,
  onInviteAccepted,
  onInviteDismiss,
  currentUserId,
  onRequestCode,
  onStartEmail,
  onStartSignIn,
  onBackToWelcome,
  onBackToEmail,
  onBackToGoal,
  onSubmitOTP,
  onSubmitName,
  onSubmitGoal,
  onSubmitDaily,
  authStep,
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
      ) : isAuthenticated ? (
        <AppNavigator />
      ) : (
        authStep === 'welcome' ? (
          <WelcomeScreen onCreateAccount={onStartEmail} onSignIn={onStartSignIn} />
        ) : authStep === 'email' ? (
          <EmailAuthScreen
            onBack={onBackToWelcome}
            onRequestCode={onRequestCode}
          />
        ) : authStep === 'otp' ? (
          <OTPVerifyScreen
            onBack={onBackToEmail}
            onSubmit={onSubmitOTP}
          />
        ) : authStep === 'name' ? (
          <NameOnboardingScreen
            onBack={onBackToEmail}
            onContinue={onSubmitName}
            onSkip={onSubmitName}
          />
        ) : authStep === 'goal' ? (
          <LearningGoalScreen
            onBack={onBackToEmail}
            onContinue={onSubmitGoal}
          />
        ) : authStep === 'signin' ? (
          <SignInScreen
            onBack={onBackToWelcome}
            onSendCode={(email) => onRequestCode(email)}
            onCreateAccount={onStartEmail}
          />
        ) : (
          <DailyGoalScreen
            onBack={onBackToGoal}
            onContinue={onSubmitDaily}
          />
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
  const [authStep, setAuthStep] = useState<'welcome' | 'email' | 'otp' | 'name' | 'goal' | 'daily' | 'signin'>('welcome');
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

  // Синхронизация isAuthenticated с сессией Supabase
  useEffect(() => {
    let isMounted = true;

    if (!supabase?.auth) {
      console.warn('⚠️ Supabase не инициализирован');
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Supabase session error:', error.message);
        }
        setIsAuthenticated(Boolean(data.session));
        const user = data.session?.user;
        if (user) {
          setCurrentUserId(user.id);
          if (ensuredUserIdRef.current !== user.id) {
            ensuredUserIdRef.current = user.id;
            NeonService.ensureUserExists({
              id: user.id,
              email: user.email,
              displayName: (user.user_metadata as any)?.full_name,
            });
            DatabaseService.reloadRemoteDataForUser(user.id);
            setAnalyticsUserId(user.id);
            refreshPushToken(user.id).catch(() => {});
          }
        }
      })
      .catch((error) => {
        console.error('⚠️ Ошибка получения сессии:', error);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(session));
      if (session?.user) {
        setCurrentUserId(session.user.id);
        if (ensuredUserIdRef.current !== session.user.id) {
          ensuredUserIdRef.current = session.user.id;
          NeonService.ensureUserExists({
            id: session.user.id,
            email: session.user.email,
            displayName: (session.user.user_metadata as any)?.full_name,
          });
          DatabaseService.reloadRemoteDataForUser(session.user.id);
          setAnalyticsUserId(session.user.id);
          refreshPushToken(session.user.id).catch(() => {});
        }
      } else {
        setCurrentUserId(null);
        setAnalyticsUserId(null);
        ensuredUserIdRef.current = null;
        setAuthStep('welcome');
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

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

  // Временная заглушка: не сохраняем токен и не авторизуем
  const handleRequestCode = useCallback((email?: string, password?: string) => {
    // Здесь позже будет вызов Supabase OTP
    // Пока просто выводим в консоль для отладки
    console.log('Request code clicked with:', { email, password });
    setAuthStep('otp');
  }, []);

  const handleStartEmail = useCallback(() => {
    setAuthStep('email');
  }, []);

  const handleStartSignIn = useCallback(() => {
    setAuthStep('signin');
  }, []);

  const handleBackToEmail = useCallback(() => {
    setAuthStep('email');
  }, []);

  const handleBackToGoal = useCallback(() => {
    setAuthStep('goal');
  }, []);

  const handleBackToWelcome = useCallback(() => {
    setAuthStep('welcome');
  }, []);

  const handleSubmitOTP = useCallback((code: string) => {
    console.log('Submit OTP with code:', code);
    // Здесь позже будет verify -> /api/me -> вход. Сейчас ведем на шаг имени.
    setAuthStep('name');
  }, []);

  const handleSubmitName = useCallback((name?: string) => {
    console.log('Submit name:', name);
    setAuthStep('goal');
  }, []);

  const handleSubmitGoal = useCallback((goalId: string) => {
    console.log('Submit goal:', goalId);
    setAuthStep('daily');
  }, []);

  const handleSubmitDaily = useCallback((dailyId: string) => {
    console.log('Submit daily goal:', dailyId);
    // Здесь позже будет реальный вход / сохранение
  }, []);

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
        pendingInviteToken={pendingInviteToken}
        onInviteAccepted={handleInviteAccepted}
        onInviteDismiss={handleInviteDismiss}
        currentUserId={currentUserId}
        onRequestCode={handleRequestCode}
        onStartEmail={handleStartEmail}
        onStartSignIn={handleStartSignIn}
        onBackToWelcome={handleBackToWelcome}
        onBackToEmail={handleBackToEmail}
        onBackToGoal={handleBackToGoal}
        onSubmitOTP={handleSubmitOTP}
        onSubmitName={handleSubmitName}
        onSubmitGoal={handleSubmitGoal}
        onSubmitDaily={handleSubmitDaily}
        authStep={authStep}
      />
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}
