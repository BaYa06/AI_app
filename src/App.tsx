/**
 * App.tsx
 * @description Главный компонент приложения
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppNavigator } from '@/navigation';
import { Loading } from '@/components/common';
import { DatabaseService, setupAutoSave, supabase, NeonService, firebaseApp } from '@/services';
import { useThemeColors } from '@/store';
import { WelcomeScreen } from '@/screens/WelcomeScreen';
import { EmailAuthScreen } from '@/screens/EmailAuthScreen';
import { OTPVerifyScreen } from '@/screens/OTPVerifyScreen';
import { NameOnboardingScreen } from '@/screens/NameOnboardingScreen';
import { LearningGoalScreen } from '@/screens/LearningGoalScreen';
import { DailyGoalScreen } from '@/screens/DailyGoalScreen';
import { SignInScreen } from '@/screens/SignInScreen';

import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

type AppRootProps = {
  isReady: boolean;
  isAuthenticated: boolean;
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
  const insets = useSafeAreaInsets();

  // ✅ уменьшаем safe-area сверху (например на 10px)
  const top = insets.top > 0 ? Math.max(insets.top - 15, 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Safe-area зона сверху под цвет темы */}
      <View style={{ height: top, backgroundColor: colors.background }} />

      <GestureHandlerRootView style={{ flex: 1 }}>
        {!isReady ? (
          <Loading fullScreen message="Загрузка..." />
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
      </GestureHandlerRootView>
    </View>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authStep, setAuthStep] = useState<'welcome' | 'email' | 'otp' | 'name' | 'goal' | 'daily' | 'signin'>('welcome');
  const ensuredUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        const loaded = await DatabaseService.loadAll();
        if (!isMounted) return;
        if (loaded) {
          unsubscribe = setupAutoSave();
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

  // Keep isAuthenticated in sync with Supabase session state.
  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Supabase session error:', error.message);
        }
        setIsAuthenticated(Boolean(data.session));
        const user = data.session?.user;
        if (user && ensuredUserIdRef.current !== user.id) {
          ensuredUserIdRef.current = user.id;
          NeonService.ensureUserExists({
            id: user.id,
            email: user.email,
            displayName: (user.user_metadata as any)?.full_name,
          });
          DatabaseService.reloadRemoteDataForUser(user.id);
        }
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(session));
      if (session?.user && ensuredUserIdRef.current !== session.user.id) {
        ensuredUserIdRef.current = session.user.id;
        NeonService.ensureUserExists({
          id: session.user.id,
          email: session.user.email,
          displayName: (session.user.user_metadata as any)?.full_name,
        });
        DatabaseService.reloadRemoteDataForUser(session.user.id);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  /**
   * Handle OAuth deep links from Supabase (PKCE flow).
   * When the app is opened via flashly://auth-callback?code=..., exchange code for a session.
   */
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const handleUrl = async (url: string) => {
      const { error } = await supabase.auth.exchangeCodeForSession(url);
      if (error) {
        console.error('Supabase code exchange failed:', error.message);
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

  const appReady = isReady && authChecked;

  return (
    <SafeAreaProvider>
      <AppRoot
        isReady={appReady}
        isAuthenticated={isAuthenticated}
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
  );
}
