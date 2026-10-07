/**
 * WelcomeScreen
 * @description Экран приветствия с Google OAuth авторизацией.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Zap, Sparkles, BookOpen, Lightbulb, Download, Share, PlusSquare, CheckCircle2 } from 'lucide-react-native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import appleAuth, { AppleButton } from '@invertase/react-native-apple-authentication';
import { Text } from '@/components/common';
import { Button, Dialog, GoogleLogo, type IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, heights, iconSize, screenPadding } from '@/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { SUPABASE_OAUTH_REDIRECT, supabase } from '@/services/supabaseClient';
import { describeError } from '@/utils/userErrors';
import { setAppleSignInName } from '@/services/appleSignInName';

type Props = {
  isLoading?: boolean;
};

// Декоративные плитки: насыщенные — заливка primaryFill, светлые — подложка primary 10 / 20 %
type Tile = { icon: IconComponent; fill: 'solid' | 10 | 20; rotate: string; offset: number };
const TILES: Tile[] = [
  { icon: Sparkles, fill: 'solid', rotate: '-6deg', offset: 0 },
  { icon: BookOpen, fill: 10, rotate: '12deg', offset: spacing.s },
  { icon: Zap, fill: 'solid', rotate: '5deg', offset: -spacing.s },
  { icon: Lightbulb, fill: 20, rotate: '-8deg', offset: spacing.xs },
];

const INSTALL_STEPS: { icon: IconComponent; text: string }[] = [
  { icon: Share, text: 'Нажми кнопку «Поделиться»' },
  { icon: PlusSquare, text: 'Выбери «На экран Домой»' },
  { icon: CheckCircle2, text: 'Нажми «Добавить»' },
];

// Кнопка Google берёт иконку по тем же пропсам size/color, что и lucide
const GoogleIcon = GoogleLogo as unknown as IconComponent;

export function WelcomeScreen({ isLoading: externalLoading }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { canInstall, promptInstall, isIosSafari } = usePwaInstall();
  const [showIosModal, setShowIosModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loading = isLoading || externalLoading;
  const canUseAppleSignIn = Platform.OS === 'ios' && appleAuth.isSupported;


  const getParamFromCallbackUrl = useCallback((rawUrl: string, name: string): string | null => {
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
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);

    // Web/PWA: let Supabase handle the redirect natively
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: SUPABASE_OAUTH_REDIRECT,
        },
      });
      if (error) {
        console.error('[auth] Google sign-in error', error);
        setAuthError(describeError(error, 'Не удалось войти. Попробуй ещё раз.'));
        setIsLoading(false);
      }
      return;
    }

    // Native mobile: use InAppBrowser with PKCE
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: SUPABASE_OAUTH_REDIRECT,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error('[auth] Google sign-in error', error);
      setAuthError(describeError(error, 'Не удалось войти. Попробуй ещё раз.'));
      setIsLoading(false);
      return;
    }

    if (data?.url) {
      try {
        if (await InAppBrowser.isAvailable()) {
          const result = await InAppBrowser.openAuth(data.url, SUPABASE_OAUTH_REDIRECT, {
            showTitle: false,
            enableUrlBarHiding: true,
            enableDefaultShare: false,
            ephemeralWebSession: false,
          });
          if (result.type === 'success' && result.url) {
            const code = getParamFromCallbackUrl(result.url, 'code');
            if (code) {
              const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeError) {
                console.error('[auth] Code exchange failed:', exchangeError.message);
                setAuthError(describeError(exchangeError, 'Не удалось войти. Попробуй ещё раз.'));
              }
            } else {
              const errorDesc = getParamFromCallbackUrl(result.url, 'error_description');
              if (errorDesc) {
                setAuthError(describeError(errorDesc, 'Не удалось войти. Попробуй ещё раз.'));
              }
            }
          }
        } else {
          await Linking.openURL(data.url);
        }
      } catch (e) {
        console.error('[auth] Failed to open browser:', e);
        setAuthError('Не удалось открыть браузер для входа через Google');
      } finally {
        setIsLoading(false);
      }
    }
  }, [getParamFromCallbackUrl]);

  const signInWithApple = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);

    try {
      const response = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });

      const { identityToken, nonce, fullName } = response;
      if (!identityToken) {
        setAuthError('Apple не вернул токен авторизации');
        return;
      }

      // Имя приходит только при первом входе — запоминаем до входа, его заберёт App
      const appleName = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim() || null;
      setAppleSignInName(appleName);

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
        nonce,
      });

      if (error) {
        setAppleSignInName(null);
        console.error('[auth] Apple sign-in error', error);
        setAuthError(describeError(error, 'Не удалось войти. Попробуй ещё раз.'));
      }
    } catch (e: any) {
      if (e?.code !== appleAuth.Error.CANCELED) {
        console.error('[auth] Apple sign-in failed:', e);
        setAuthError('Не удалось войти через Apple');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canUseAppleSignIn) return;
    return appleAuth.onCredentialRevoked(() => {
      supabase.auth.signOut();
    });
  }, [canUseAppleSignIn]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: spacing.s, paddingBottom: insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <View style={styles.header}>
            <View style={[styles.logoCircle, { backgroundColor: colors.surfaceMuted }]}>
              <Zap size={iconSize.l} color={colors.primary} fill={colors.primary} />
            </View>
            <Text variant="h1" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
              Flashly
            </Text>
            <Text variant="bodyLarge" align="center" style={[styles.subtitle, { color: colors.textSecondary }]}>
              Учись умнее. Запоминай надолго.
            </Text>
          </View>

          <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.tilesGrid}>
              {TILES.map(({ icon: Glyph, fill, rotate, offset }, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.tile,
                    {
                      backgroundColor: fill === 'solid' ? colors.primaryFill : alpha(colors.primary, fill),
                      transform: [{ rotate }],
                      marginTop: offset,
                    },
                  ]}
                >
                  <Glyph size={iconSize.l} color={fill === 'solid' ? colors.onPrimary : colors.primary} />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.actions}>
            {loading ? (
              <ActivityIndicator
                size="large"
                color={colors.primary}
                accessibilityLabel="Входим"
                style={styles.spinner}
              />
            ) : (
              <>
                <Button title="Войти через Google" icon={GoogleIcon} onPress={signInWithGoogle} fullWidth />
                {canUseAppleSignIn && (
                  <AppleButton
                    buttonStyle={AppleButton.Style.BLACK}
                    buttonType={AppleButton.Type.SIGN_IN}
                    cornerRadius={borderRadius.m}
                    style={styles.appleButton}
                    onPress={signInWithApple}
                  />
                )}
              </>
            )}
            {authError && (
              <Text variant="bodySmall" align="center" accessibilityRole="alert" style={{ color: colors.errorText }}>
                {authError}
              </Text>
            )}
            {(canInstall || isIosSafari) && (
              <Button
                title="Скачать приложение"
                variant="quiet"
                icon={Download}
                onPress={canInstall ? promptInstall : () => setShowIosModal(true)}
                fullWidth
              />
            )}
          </View>

          <View style={styles.footer}>
            <Text variant="caption" align="center" style={{ color: colors.textSecondary }}>
              Продолжая, ты соглашаешься с нашими
            </Text>
            <Text variant="caption" align="center" style={{ color: colors.textSecondary }}>
              Условиями использования и Политикой конфиденциальности
            </Text>
          </View>

          <View style={[styles.homeIndicator, { backgroundColor: colors.border }]} />
        </View>
      </ScrollView>

      <Dialog
        visible={showIosModal}
        onClose={() => setShowIosModal(false)}
        title="Установить приложение"
        footer={<Button title="Понятно" onPress={() => setShowIosModal(false)} fullWidth />}
      >
        <View style={styles.modalSteps}>
          {INSTALL_STEPS.map(({ icon: Glyph, text }) => (
            <View key={text} style={styles.modalStep}>
              <Glyph size={iconSize.m} color={colors.primary} />
              <Text variant="body" style={[styles.modalStepText, { color: colors.textPrimary }]}>
                {text}
              </Text>
            </View>
          ))}
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: screenPadding,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  logoCircle: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  illustration: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.l,
  },
  tilesGrid: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  actions: {
    gap: spacing.s,
    marginBottom: spacing.l,
  },
  spinner: {
    marginVertical: spacing.m,
  },
  appleButton: {
    width: '100%',
    height: heights.button,
  },
  footer: {
    gap: spacing.xxs / 2,
    marginBottom: spacing.m,
  },
  homeIndicator: {
    alignSelf: 'center',
    width: 110,
    height: 6,
    borderRadius: borderRadius.full,
    opacity: 0.6,
    marginTop: spacing.s,
  },
  modalSteps: {
    gap: spacing.m,
  },
  modalStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  modalStepText: {
    flex: 1,
  },
});
