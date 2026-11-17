/**
 * Корень приложения: загрузка, онбординг/вход или навигация, окна приглашения и набора по ссылке
 * (Clean 8 — перенесено из App.tsx без изменений.)
 */
import { useEffect, useState } from 'react';
import { Platform, View, StyleSheet, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigator } from '@/navigation';
import { LoadingSplash, SPLASH_BACKGROUND } from '@/components/common';
import { ToastHost } from '@/components/ui/Toast';
import { AppUpdateGuard } from '@/components/appUpdate/AppUpdateGuard';
import { currentNews, initWhatsNew } from '@/services/whatsNew';
import { markLaunchInterrupted, setGateOpen } from '@/services/modalGate';
import { requestPushPermission, isPushSupported } from '@/services/pushNotifications';
import { useSettingsStore, useThemeColors } from '@/store';
import { X } from 'lucide-react-native';
import { Text as ThemedText } from '@/components/common/Text';
import { borderRadius, iconSize, screenPadding, spacing } from '@/constants';
import { CourseInviteModal } from '@/components/CourseInviteModal';
import { SharedSetPreviewModal } from '@/components/share/SharedSetPreviewModal';
import { WelcomeScreen } from '@/screens/WelcomeScreen';
import { StepTransition } from '@/components/onboarding/StepTransition';
import { StarterBuildScreen } from '@/screens/firstLesson/StarterBuildScreen';
import { WithTeacherScreen } from '@/screens/WithTeacherScreen';
import { TeacherCodeScreen } from '@/screens/courseJoin/TeacherCodeScreen';
import { CourseFoundScreen } from '@/screens/courseJoin/CourseFoundScreen';
import { CourseNameScreen } from '@/screens/courseJoin/CourseNameScreen';
import { CenterFoundScreen } from '@/screens/courseJoin/CenterFoundScreen';
import { CenterInviteModal } from '@/components/CenterInviteModal';
import { TeacherInviteModal } from '@/components/TeacherInviteModal';
import type { CenterActivateAction, CenterCodeResult } from '@/services/CenterService';
import type { CourseInviteInfo, JoinCourseAction } from '@/services/neon/courses';
import { FirstCardsScreen } from '@/screens/firstLesson/FirstCardsScreen';
import { FirstMatchScreen } from '@/screens/firstLesson/FirstMatchScreen';
import { FirstResultsScreen } from '@/screens/firstLesson/FirstResultsScreen';
import type { StarterSet } from '@/services/StarterSetService';
import { NameOnboardingScreen } from '@/screens/NameOnboardingScreen';
import { RoleSelectionScreen } from '@/screens/RoleSelectionScreen';
import { NativeLanguageScreen } from '@/screens/NativeLanguageScreen';
import { TargetLanguagesScreen } from '@/screens/TargetLanguagesScreen';
import { LearningGoalScreen } from '@/screens/LearningGoalScreen';
import { DailyGoalScreen } from '@/screens/DailyGoalScreen';
import { AboutMeOnboardingScreen, type AboutMeAnswers } from '@/screens/AboutMeOnboardingScreen';
import { TeacherSubjectScreen } from '@/screens/TeacherSubjectScreen';
import { TeacherGroupSizeScreen } from '@/screens/TeacherGroupSizeScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from 'react-native';

// Стили для веб-платформы (iOS PWA scroll fix)
const webStyles =
  Platform.OS === 'web'
    ? StyleSheet.create({
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
      })
    : undefined;

export type AuthStep =
  | 'welcome'
  | 'name'
  | 'role'
  | 'teacher_code'
  | 'course_found'
  | 'course_name'
  | 'center_found'
  | 'native_language'
  | 'target_languages'
  | 'starter_build'
  | 'first_cards'
  | 'first_match'
  | 'first_results'
  | 'goal'
  | 'daily'
  | 'with_teacher'
  | 'about'
  | 'teacher_subject'
  | 'teacher_size';

type AppRootProps = {
  isReady: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  pendingInviteToken: string | null;
  onInviteAccepted: (courseId: string, courseTitle: string) => void;
  onInviteDismiss: () => void;
  /** Набор по ссылке (plan/new/share_set.md, Share 4) */
  pendingShareCode: string | null;
  shareDeferred: boolean;
  shareAutoAdd: boolean;
  onShareRequestSignIn: () => void;
  onShareClose: () => void;
  onShareOpenSet: (setId: string) => void;
  currentUserId: string | null;
  onBackToWelcome: () => void;
  onBackToName: () => void;
  onBackToRole: () => void;
  onBackToNativeLanguage: () => void;
  onBackToTargetLanguages: () => void;
  onBackToGoal: () => void;
  onBackToTeacherSubject: () => void;
  onSubmitName: (name?: string) => void;
  onSubmitRole: (role: string) => void;
  onSubmitNativeLanguage: (code: string) => void;
  onSubmitTargetLanguages: (codes: string[]) => void;
  /** «Поменять местами»: новый родной язык (бывший изучаемый) */
  onSwapLanguages: (newNative: string) => void;
  /** Ученик с кодом или ссылкой учителя (этап 7) */
  courseJoin: { via: 'code' | 'link'; info: CourseInviteInfo; joined?: boolean } | null;
  onHaveCode: () => void;
  onCodeFound: (code: string, info: CourseInviteInfo) => void;
  onCourseJoin: JoinCourseAction;
  onCourseNotMine: () => void;
  onCourseName: (name: string) => void;
  /** Ученик с кодом или ссылкой учебного центра (plan/new/center_books.md, Center 5) */
  centerJoin: { via: 'code' | 'link'; info: Extract<CenterCodeResult, { ok: true }> } | null;
  onCenterFound: (code: string, info: Extract<CenterCodeResult, { ok: true }>) => void;
  onCenterActivate: CenterActivateAction;
  onCenterNotMine: () => void;
  /** Ссылка центра /join/<код> (Center 5): у вошедшего — окно, у нового — онбординг */
  pendingCenterCode: string | null;
  onCenterInviteJoined: (info: Extract<CenterCodeResult, { ok: true }>) => void;
  onCenterInviteDismiss: () => void;
  /** Ссылка для учителей центра /t/<код> (Center 13) */
  pendingTeacherInvite: string | null;
  onTeacherInviteJoined: () => void;
  onTeacherInviteDismiss: () => void;
  /** Первый урок (Start 2.5): выданный стартовый набор и шаги урока */
  firstLesson: StarterSet | null;
  starterReady: boolean | null;
  onStarterBuilt: (ok: boolean) => void;
  onFirstCardsDone: () => void;
  onFirstMatchDone: () => void;
  onFirstResultsDone: () => void;
  /** «Ты учишься с учителем?» (Start 3.6) */
  onSubmitWithTeacher: (withTeacher?: boolean) => void;
  onBackToWithTeacher: () => void;
  targetLanguages?: string[];
  onSubmitGoal: (goalId?: string) => void;
  onSubmitDaily: (dailyId: string) => void;
  onBackToDaily: () => void;
  onSubmitAboutMe: (answers: AboutMeAnswers) => void;
  onSubmitTeacherSubject: (subjectId: string) => void;
  onSubmitTeacherSize: (sizeId: string) => void;
  authStep: AuthStep;
  /** Роль из онбординга: у учителя другой путь и другой счёт шагов */
  onboardingRole?: 'student' | 'teacher';
  /** Имя пришло из Sign in with Apple — экран имени пропускается */
  nameSkipped: boolean;
  authLoading: boolean;
  nativeLanguage?: string;
};

export function AppRoot({
  isReady,
  isAuthenticated,
  needsOnboarding,
  pendingInviteToken,
  onInviteAccepted,
  onInviteDismiss,
  pendingShareCode,
  shareDeferred,
  shareAutoAdd,
  onShareRequestSignIn,
  onShareClose,
  onShareOpenSet,
  currentUserId,
  onBackToWelcome,
  onBackToName,
  onBackToRole,
  onBackToNativeLanguage,
  onBackToTargetLanguages,
  onBackToGoal,
  onBackToTeacherSubject,
  onSubmitName,
  onSubmitRole,
  onSubmitNativeLanguage,
  onSubmitTargetLanguages,
  onSwapLanguages,
  courseJoin,
  onHaveCode,
  onCodeFound,
  onCourseJoin,
  onCourseNotMine,
  onCourseName,
  centerJoin,
  onCenterFound,
  onCenterActivate,
  onCenterNotMine,
  pendingCenterCode,
  onCenterInviteJoined,
  onCenterInviteDismiss,
  pendingTeacherInvite,
  onTeacherInviteJoined,
  onTeacherInviteDismiss,
  firstLesson,
  starterReady,
  onStarterBuilt,
  onFirstCardsDone,
  onFirstMatchDone,
  onFirstResultsDone,
  onSubmitWithTeacher,
  onBackToWithTeacher,
  targetLanguages,
  onSubmitGoal,
  onSubmitDaily,
  onBackToDaily,
  onSubmitAboutMe,
  onSubmitTeacherSubject,
  onSubmitTeacherSize,
  authStep,
  onboardingRole,
  nameSkipped,
  authLoading,
  nativeLanguage,
}: AppRootProps) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const insets = useSafeAreaInsets();
  const signedIn = isReady && isAuthenticated && !needsOnboarding;

  // Счёт шагов (plan/new/new_user_activation.md, Start 2.1). Ученик: до урока роль → родной →
  // изучаемый (из 3), после урока имя → цель → норма (из 3, без имени — из 2).
  // Учитель: роль → имя → родной → изучаемый → предмет → группа (из 6, без имени — из 5).
  const isTeacher = onboardingRole === 'teacher';
  const teacherTotal = isTeacher ? (nameSkipped ? 5 : 6) : undefined;
  const teacherStep = (studentStep: number) =>
    isTeacher ? studentStep + (nameSkipped ? 0 : 1) : studentStep;
  // После урока: имя → цель → норма → «С учителем?» (из 4, без имени — из 3)
  const afterLessonTotal = nameSkipped ? 3 : 4;
  // Во время онбординга ссылку учителя ведёт сам онбординг («Курс найден», Start 7.3)
  const inviteOpen = isAuthenticated && !needsOnboarding && !!pendingInviteToken;
  const centerInviteOpen = isAuthenticated && !needsOnboarding && !!pendingCenterCode;
  // Учитель по ссылке центра: окно после входа и онбординга (Center 13)
  const teacherInviteOpen = isAuthenticated && !needsOnboarding && !!pendingTeacherInvite;
  const shareOpen =
    isReady && !!pendingShareCode && (signedIn || (!isAuthenticated && !shareDeferred));

  // «Что нового» (plan/new/whats_new.md, News 3): новичок или старый пользователь — по сессии
  // при первом запуске; приглашение и набор по ссылке важнее и откладывают окно
  useEffect(() => {
    if (!isReady) return;
    initWhatsNew({ hasSession: isAuthenticated, signedIn, allIds: currentNews().map((n) => n.id) });
  }, [isReady, isAuthenticated, signedIn]);
  useEffect(() => setGateOpen('courseInvite', inviteOpen), [inviteOpen]);
  useEffect(() => setGateOpen('centerInvite', centerInviteOpen), [centerInviteOpen]);
  useEffect(() => setGateOpen('teacherInvite', teacherInviteOpen), [teacherInviteOpen]);
  useEffect(() => setGateOpen('shareLink', shareOpen), [shareOpen]);
  useEffect(() => {
    if (pendingInviteToken || pendingShareCode || pendingCenterCode || pendingTeacherInvite)
      markLaunchInterrupted();
  }, [pendingInviteToken, pendingShareCode, pendingCenterCode, pendingTeacherInvite]);

  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushBannerLoading, setPushBannerLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || needsOnboarding || Platform.OS !== 'web') return;
    const dismissed = localStorage.getItem('flashly_push_banner_dismissed');
    if (dismissed) return;
    isPushSupported().then((supported) => {
      if (supported && Notification.permission === 'default') {
        setTimeout(() => setShowPushBanner(true), 2000);
      }
    });
  }, [isAuthenticated, needsOnboarding]);

  // В нативном приложении системный диалог iOS сразу после онбординга больше не показываем
  // (plan/new/push_notifications.md, 1.1): он бывает один раз, и тратить его на человека, который ещё
  // не видел пользы, нельзя. Его открывает лист после первого урока (1.2). Если разрешение уже есть,
  // токен тихо обновляет refreshPushToken при входе (handleSession) и после онбординга.

  // Полный safe area сверху: контент не заходит под статус-бар / Dynamic Island.
  // Нижний отступ каждый низ экрана учитывает сам (панель вкладок — в AppNavigator).
  const top = insets.top;

  // Синхронизируем meta theme-color с текущей темой (только веб)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const meta = document.querySelector('meta[name=\"theme-color\"]');
    const themeColor = colors.background;

    if (meta) {
      meta.setAttribute('content', themeColor);
    } else {
      const newMeta = document.createElement('meta');
      newMeta.name = 'theme-color';
      newMeta.content = themeColor;
      document.head.appendChild(newMeta);
    }
  }, [colors.background]);

  // Контент приложения
  const appContent = (
    <>
      {!isReady ? (
        <LoadingSplash />
      ) : isAuthenticated && !needsOnboarding ? (
        <AppNavigator />
      ) : (
        <StepTransition step={authStep}>
          {authStep === 'welcome' ? (
            <WelcomeScreen
              isLoading={authLoading}
              centerInvited={!!pendingCenterCode}
              teacherInvited={!!pendingTeacherInvite}
            />
          ) : authStep === 'name' ? (
            <NameOnboardingScreen
              onBack={isTeacher ? onBackToRole : undefined}
              onContinue={onSubmitName}
              onSkip={onSubmitName}
              step={isTeacher ? 2 : 1}
              total={isTeacher ? 6 : 3}
            />
          ) : authStep === 'role' ? (
            <RoleSelectionScreen
              onBack={onBackToWelcome}
              onContinue={onSubmitRole}
              onHaveCode={onHaveCode}
              step={1}
              total={3}
            />
          ) : authStep === 'teacher_code' ? (
            <TeacherCodeScreen
              onFound={onCodeFound}
              onCenterFound={onCenterFound}
              onBack={onBackToRole}
            />
          ) : authStep === 'course_found' && courseJoin ? (
            <CourseFoundScreen
              info={courseJoin.info}
              viaLink={courseJoin.via === 'link'}
              onJoin={onCourseJoin}
              onNotMine={onCourseNotMine}
            />
          ) : authStep === 'center_found' && centerJoin ? (
            <CenterFoundScreen
              info={centerJoin.info}
              viaLink={centerJoin.via === 'link'}
              onActivate={onCenterActivate}
              onNotMine={onCenterNotMine}
            />
          ) : authStep === 'course_name' ? (
            <CourseNameScreen onContinue={onCourseName} />
          ) : authStep === 'native_language' ? (
            <NativeLanguageScreen
              initial={nativeLanguage}
              onBack={isTeacher && !nameSkipped ? onBackToName : onBackToRole}
              onContinue={onSubmitNativeLanguage}
              step={teacherStep(2)}
              total={teacherTotal ?? 3}
            />
          ) : authStep === 'target_languages' ? (
            <TargetLanguagesScreen
              nativeLanguage={nativeLanguage}
              initial={targetLanguages}
              onSwap={onSwapLanguages}
              onBack={onBackToNativeLanguage}
              onContinue={onSubmitTargetLanguages}
              step={teacherStep(3)}
              total={teacherTotal ?? 3}
            />
          ) : authStep === 'starter_build' ? (
            <StarterBuildScreen
              native={nativeLanguage ?? 'ru'}
              target={targetLanguages?.[0] ?? 'en'}
              ready={starterReady}
              onDone={onStarterBuilt}
            />
          ) : authStep === 'first_cards' && firstLesson ? (
            <FirstCardsScreen
              cards={firstLesson.cards}
              target={firstLesson.set.languageFrom ?? 'en'}
              native={firstLesson.set.languageTo ?? 'ru'}
              onDone={onFirstCardsDone}
            />
          ) : authStep === 'first_match' && firstLesson ? (
            <FirstMatchScreen cards={firstLesson.cards} onDone={onFirstMatchDone} />
          ) : authStep === 'first_results' && firstLesson ? (
            <FirstResultsScreen
              cards={firstLesson.cards}
              questionsLeft={afterLessonTotal}
              onContinue={onFirstResultsDone}
            />
          ) : authStep === 'goal' ? (
            <LearningGoalScreen
              onBack={nameSkipped ? undefined : onBackToName}
              onContinue={onSubmitGoal}
              step={nameSkipped ? 1 : 2}
              total={afterLessonTotal}
            />
          ) : authStep === 'daily' ? (
            <DailyGoalScreen
              onBack={onBackToGoal}
              onContinue={onSubmitDaily}
              step={nameSkipped ? 2 : 3}
              total={afterLessonTotal}
            />
          ) : authStep === 'with_teacher' ? (
            <WithTeacherScreen
              onBack={onBackToDaily}
              onContinue={onSubmitWithTeacher}
              step={nameSkipped ? 3 : 4}
              total={afterLessonTotal}
            />
          ) : authStep === 'about' ? (
            <AboutMeOnboardingScreen onBack={onBackToWithTeacher} onContinue={onSubmitAboutMe} />
          ) : authStep === 'teacher_subject' ? (
            <TeacherSubjectScreen
              onBack={onBackToTargetLanguages}
              onContinue={onSubmitTeacherSubject}
              step={teacherStep(4)}
              total={teacherTotal}
            />
          ) : authStep === 'teacher_size' ? (
            <TeacherGroupSizeScreen
              onBack={onBackToTeacherSubject}
              onContinue={onSubmitTeacherSize}
              step={teacherStep(5)}
              total={teacherTotal}
            />
          ) : (
            <WelcomeScreen
              isLoading={authLoading}
              centerInvited={!!pendingCenterCode}
              teacherInvited={!!pendingTeacherInvite}
            />
          )}
        </StepTransition>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: isReady ? colors.background : SPLASH_BACKGROUND }}>
      {/* Базовая строка состояния: на заставке светлая, дальше по теме (экраны с Container задают свою) */}
      <StatusBar
        barStyle={!isReady || resolvedTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={isReady ? colors.background : SPLASH_BACKGROUND}
      />
      {/* Safe-area зона сверху под цвет темы (на загрузке — фон заставки LoadingSplash) */}
      <View
        style={{
          height: top,
          backgroundColor: isReady ? colors.background : SPLASH_BACKGROUND,
        }}
      />

      <GestureHandlerRootView style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          // На веб оборачиваем в scroll-контейнер для фиксации iOS overscroll
          <View style={webStyles?.scrollContainer}>{appContent}</View>
        ) : (
          // На нативных платформах используем как есть
          appContent
        )}
      </GestureHandlerRootView>

      {/* Push notification banner */}
      {showPushBanner && (
        <View
          style={{
            position: 'absolute' as any,
            bottom: 90,
            left: screenPadding,
            right: screenPadding,
            // primaryFill + onPrimary: в тёмной теме primary слишком светлый под белый текст
            backgroundColor: colors.primaryFill,
            borderRadius: borderRadius.l,
            padding: spacing.m,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: spacing.xxs },
            shadowOpacity: 1,
            shadowRadius: spacing.s,
            elevation: 8,
            gap: spacing.s,
          }}
        >
          <View style={{ flex: 1 }}>
            <ThemedText variant="label" style={{ color: colors.onPrimary, fontWeight: '700' }}>
              Включи уведомления
            </ThemedText>
            <ThemedText
              variant="caption"
              style={{ color: colors.onPrimary, marginTop: spacing.xxs / 2 }}
            >
              Напомним когда пора заниматься и сохранить серию
            </ThemedText>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Разрешить уведомления"
            onPress={async () => {
              setPushBannerLoading(true);
              await requestPushPermission(currentUserId);
              setPushBannerLoading(false);
              setShowPushBanner(false);
              localStorage.setItem('flashly_push_banner_dismissed', '1');
            }}
            style={{
              backgroundColor: colors.onPrimary,
              borderRadius: borderRadius.m,
              paddingHorizontal: spacing.s,
              paddingVertical: spacing.xs,
            }}
          >
            <ThemedText variant="label" style={{ color: colors.primaryFill, fontWeight: '700' }}>
              {pushBannerLoading ? '...' : 'Разрешить'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            hitSlop={spacing.s}
            onPress={() => {
              setShowPushBanner(false);
              localStorage.setItem('flashly_push_banner_dismissed', '1');
            }}
            style={{ padding: spacing.xxs }}
          >
            <X size={iconSize.s} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Модалка принятия приглашения в курс */}
      {inviteOpen && (
        <CourseInviteModal
          token={pendingInviteToken}
          userId={currentUserId}
          onAccepted={onInviteAccepted}
          onDismiss={onInviteDismiss}
        />
      )}

      {/* Ссылка учебного центра у вошедшего пользователя (plan/new/center_books.md, Center 5) */}
      {centerInviteOpen && (
        <CenterInviteModal
          code={pendingCenterCode}
          onJoined={onCenterInviteJoined}
          onDismiss={onCenterInviteDismiss}
        />
      )}

      {/* Ссылка для учителей учебного центра (plan/new/center_books.md, Center 13) */}
      {teacherInviteOpen && (
        <TeacherInviteModal
          token={pendingTeacherInvite}
          onJoined={onTeacherInviteJoined}
          onDismiss={onTeacherInviteDismiss}
        />
      )}

      {/* Набор по ссылке: без входа — превью и «Войти и добавить»; пока человек входит и проходит
          онбординг, окно скрыто и возвращается само после входа */}
      {shareOpen && pendingShareCode && (
        <SharedSetPreviewModal
          code={pendingShareCode}
          signedIn={signedIn}
          autoAdd={shareAutoAdd}
          onRequestSignIn={onShareRequestSignIn}
          onClose={onShareClose}
          onOpenSet={onShareOpenSet}
        />
      )}

      {/* Тосты (toast.success(...)) — поверх экранов */}
      {/* «Вышла новая версия»: заходы и обязательное окно на любом экране (app_update_prompt.md, Update 4) */}
      <AppUpdateGuard />
      <ToastHost />
    </View>
  );
}
