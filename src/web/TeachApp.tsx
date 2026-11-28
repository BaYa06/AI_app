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
import { phIdentify, phSetPersonProps } from '@/services/posthog';
import { rememberReturnTo, takeReturnTo } from './auth/returnTo';
import { GuestPage, NotTeacherPage, ProfileErrorPage, SignInPage } from './auth/AuthPages';
import { LoadingPage, NotFoundPage } from './ui/states';
import { HomePage } from './pages/HomePage';
import { CoursePage } from './pages/CoursePage';
import { StudentPage } from './pages/StudentPage';
import { CoursesProvider } from './data/CoursesContext';
import { ExamsPage } from './pages/ExamsPage';
import { ExamSetupPage } from './pages/ExamSetupPage';
import { ExamBuildPage } from './pages/ExamBuildPage';
import { ExamPage } from './pages/ExamPage';
import { ExamQuestionPage } from './pages/ExamQuestionPage';
import { ExamStudentPage } from './pages/ExamStudentPage';
import { ProjectorPage } from './pages/ProjectorPage';
import { QuickSetupPage } from './pages/QuickSetupPage';
import { QuickTestPage } from './pages/QuickTestPage';
import { UiGalleryPage } from './pages/UiGalleryPage';

const ROUTES: RouteDef[] = [
  { name: 'home', pattern: '/' },
  { name: 'course', pattern: '/courses/:courseId' },
  { name: 'student', pattern: '/courses/:courseId/students/:studentId' },
  { name: 'exams', pattern: '/exams' },
  { name: 'quickNew', pattern: '/courses/:courseId/tests/new' },
  { name: 'quick', pattern: '/tests/:sessionId' },
  { name: 'examNew', pattern: '/courses/:courseId/exams/new' },
  { name: 'examBuild', pattern: '/exams/:sessionId/build' },
  { name: 'examQuestion', pattern: '/exams/:sessionId/questions/:itemId' },
  { name: 'examStudent', pattern: '/exams/:sessionId/students/:participantId' },
  { name: 'exam', pattern: '/exams/:sessionId' },
  ...(__DEV__ ? [{ name: 'ui', pattern: '/_ui' }] : []),
];

function Routes() {
  const route = useRoute(ROUTES);
  if (!route) return <NotFoundPage />;
  if (route.name === 'home') return <HomePage />;
  if (route.name === 'course')
    return <CoursePage key={route.params.courseId} courseId={route.params.courseId} />;
  if (route.name === 'exams') return <ExamsPage />;
  if (route.name === 'quickNew')
    return <QuickSetupPage key={route.params.courseId} courseId={route.params.courseId} />;
  if (route.name === 'quick')
    return <QuickTestPage key={route.params.sessionId} sessionId={route.params.sessionId} />;
  if (route.name === 'examNew')
    return <ExamSetupPage key={route.params.courseId} courseId={route.params.courseId} />;
  if (route.name === 'examBuild') return <ExamBuildPage sessionId={route.params.sessionId} />;
  if (route.name === 'examQuestion')
    return (
      <ExamQuestionPage
        key={route.params.itemId}
        sessionId={route.params.sessionId}
        itemId={route.params.itemId}
      />
    );
  if (route.name === 'examStudent')
    return (
      <ExamStudentPage
        key={route.params.participantId}
        sessionId={route.params.sessionId}
        participantId={route.params.participantId}
      />
    );
  if (route.name === 'exam')
    return <ExamPage key={route.params.sessionId} sessionId={route.params.sessionId} />;
  if (route.name === 'student')
    return (
      <StudentPage
        key={route.params.studentId}
        courseId={route.params.courseId}
        studentId={route.params.studentId}
      />
    );
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

  // PostHog: учитель — по UUID (не email), вышел — сбрасываем, чтобы не склеить с другим человеком
  const teacherId = session.status === 'teacher' ? session.user.id : null;
  useEffect(() => {
    if (teacherId && teacherId !== 'preview') {
      phIdentify(teacherId);
      phSetPersonProps({ is_teacher: true });
    } else if (session.status === 'out') {
      phIdentify(null);
    }
  }, [teacherId, session.status]);

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
        <CoursesProvider>
          <Shell email={session.user.email}>
            {path.startsWith('/auth-callback') ? <LoadingPage /> : <Routes />}
          </Shell>
        </CoursesProvider>
      );
  }
}

const PROJECTOR_ROUTE: RouteDef[] = [{ name: 'projector', pattern: '/projector/:sessionId' }];

/** Окно проектора живёт отдельно от входа: данные ему присылает окно учителя, токен и сервер не нужны */
function Root() {
  const projector = useRoute(PROJECTOR_ROUTE);
  if (projector) return <ProjectorPage sessionId={projector.params.sessionId} />;
  return <Gate />;
}

export function TeachApp() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <Root />
        <ToastHost />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
