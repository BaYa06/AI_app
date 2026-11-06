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
  | 'native_language'
  | 'target_languages'
  | 'goal'
  | 'daily'
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
  onSubmitGoal: (goalId: string) => void;
  onSubmitDaily: (dailyId: string) => void;
  onBackToDaily: () => void;
  onSubmitAboutMe: (answers: AboutMeAnswers) => void;
  onSubmitTeacherSubject: (subjectId: string) => void;
  onSubmitTeacherSize: (sizeId: string) => void;
  authStep: AuthStep;
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
  onSubmitGoal,
  onSubmitDaily,
  onBackToDaily,
  onSubmitAboutMe,
  onSubmitTeacherSubject,
  onSubmitTeacherSize,
  authStep,
  authLoading,
  nativeLanguage,
}: AppRootProps) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const insets = useSafeAreaInsets();
  const signedIn = isReady && isAuthenticated && !needsOnboarding;
  const inviteOpen = isAuthenticated && !!pendingInviteToken;
  const shareOpen =
    isReady && !!pendingShareCode && (signedIn || (!isAuthenticated && !shareDeferred));

  // «Что нового» (plan/new/whats_new.md, News 3): новичок или старый пользователь — по сессии
  // при первом запуске; приглашение и набор по ссылке важнее и откладывают окно
  useEffect(() => {
    if (!isReady) return;
    initWhatsNew({ hasSession: isAuthenticated, signedIn, allIds: currentNews().map((n) => n.id) });
  }, [isReady, isAuthenticated, signedIn]);
  useEffect(() => setGateOpen('courseInvite', inviteOpen), [inviteOpen]);
  useEffect(() => setGateOpen('shareLink', shareOpen), [shareOpen]);
  useEffect(() => {
    if (pendingInviteToken || pendingShareCode) markLaunchInterrupted();
  }, [pendingInviteToken, pendingShareCode]);

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
      ) : authStep === 'welcome' ? (
        <WelcomeScreen isLoading={authLoading} />
      ) : authStep === 'name' ? (
        <NameOnboardingScreen
          onBack={onBackToWelcome}
          onContinue={onSubmitName}
          onSkip={onSubmitName}
        />
      ) : authStep === 'role' ? (
        <RoleSelectionScreen onBack={onBackToName} onContinue={onSubmitRole} />
      ) : authStep === 'native_language' ? (
        <NativeLanguageScreen onBack={onBackToRole} onContinue={onSubmitNativeLanguage} />
      ) : authStep === 'target_languages' ? (
        <TargetLanguagesScreen
          nativeLanguage={nativeLanguage}
          onBack={onBackToNativeLanguage}
          onContinue={onSubmitTargetLanguages}
        />
      ) : authStep === 'goal' ? (
        <LearningGoalScreen onBack={onBackToTargetLanguages} onContinue={onSubmitGoal} />
      ) : authStep === 'daily' ? (
        <DailyGoalScreen onBack={onBackToGoal} onContinue={onSubmitDaily} />
      ) : authStep === 'about' ? (
        <AboutMeOnboardingScreen onBack={onBackToDaily} onContinue={onSubmitAboutMe} />
      ) : authStep === 'teacher_subject' ? (
        <TeacherSubjectScreen
          onBack={onBackToTargetLanguages}
          onContinue={onSubmitTeacherSubject}
        />
      ) : authStep === 'teacher_size' ? (
        <TeacherGroupSizeScreen onBack={onBackToTeacherSubject} onContinue={onSubmitTeacherSize} />
      ) : (
        <WelcomeScreen isLoading={authLoading} />
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
      <ToastHost />
    </View>
  );
}
