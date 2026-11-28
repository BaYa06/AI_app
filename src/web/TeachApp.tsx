/**
 * Корень веб-кабинета учителя (plan/new/web_cabinet.md, Web 2–3).
 * Порядок: загрузка → вход → роль → оболочка с маршрутами.
 */
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { navigate, useRoute, usePath, type RouteDef } from './router';
import { Shell } from './Shell';
import { useTeacherSession } from './auth/useTeacherSession';
import { rememberReturnTo, takeReturnTo } from './auth/returnTo';
import { GuestPage, NotTeacherPage, ProfileErrorPage, SignInPage } from './auth/AuthPages';
import { LoadingPage, NotFoundPage } from './ui/states';
import { HomePage } from './pages/HomePage';
import { UiGalleryPage } from './pages/UiGalleryPage';

const ROUTES: RouteDef[] = [
  { name: 'home', pattern: '/' },
  ...(__DEV__ ? [{ name: 'ui', pattern: '/_ui' }] : []),
];

function Routes() {
  const route = useRoute(ROUTES);
  if (!route) return <NotFoundPage />;
  if (route.name === 'home') return <HomePage />;
  if (route.name === 'ui') return <UiGalleryPage />;
  return <NotFoundPage />;
}

function Gate() {
  const { session, reload } = useTeacherSession();
  const path = usePath();

  // Вышел из аккаунта — запоминаем, где он был, чтобы вернуть после входа
  useEffect(() => {
    if (session.status === 'out') rememberReturnTo(path);
  }, [session.status, path]);

  // После входа браузер приходит на /auth-callback — отправляем обратно, откуда ушёл
  useEffect(() => {
    if (session.status === 'teacher' && path.startsWith('/auth-callback')) {
      navigate(takeReturnTo(), { replace: true });
    }
  }, [session.status, path]);

  switch (session.status) {
    case 'loading':
      return <LoadingPage />;
    case 'out':
      return <SignInPage />;
    case 'guest':
      return <GuestPage />;
    case 'notTeacher':
      return <NotTeacherPage email={session.email} />;
    case 'error':
      return <ProfileErrorPage onRetry={reload} />;
    case 'teacher':
      return (
        <Shell email={session.user.email}>
          {path.startsWith('/auth-callback') ? <LoadingPage /> : <Routes />}
        </Shell>
      );
  }
}

export function TeachApp() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <Gate />
        <ToastHost />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
