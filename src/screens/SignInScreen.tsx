/**
 * SignInScreen
 * @description Экран входа: только Google OAuth (без email/кода).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Linking,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { Text } from '@/components/common';
import { Button, GoogleLogo, ScreenHeader, type IconComponent } from '@/components/ui';
import { spacing, screenPadding } from '@/constants';
import { useThemeColors } from '@/store';
import { SUPABASE_OAUTH_REDIRECT, supabase } from '@/services/supabaseClient';
import { describeError } from '@/utils/userErrors';

// Кнопка Google берёт иконку по тем же пропсам size/color, что и lucide
const GoogleIcon = GoogleLogo as unknown as IconComponent;

type Props = {
  onBack?: () => void;
  onSendCode?: (email?: string) => void;
  onCreateAccount?: () => void;
};

export function SignInScreen({ onBack, onSendCode, onCreateAccount }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getParamFromCallbackUrl = useCallback((rawUrl: string, name: string): string | null => {
    if (!rawUrl || !name) {
      return null;
    }

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const queryOrHashPattern = new RegExp(`[?#&]${escapedName}=([^&#]*)`);
    const match = rawUrl.match(queryOrHashPattern);
    if (!match?.[1]) {
      return null;
    }

    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch {
      return match[1];
    }
  }, []);

  // Guest login
  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;
    } catch (e: any) {
      setError('Не удалось войти. Попробуй ещё раз.');
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    // On web/PWA: let Supabase handle the redirect natively via window.location
    // This ensures the OAuth callback returns to the same PWA window
    if (Platform.OS === 'web') {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: SUPABASE_OAUTH_REDIRECT,
          // skipBrowserRedirect: false (default) — Supabase will redirect via window.location
        },
      });
      if (authError) {
        setError(describeError(authError, 'Не удалось войти. Попробуй ещё раз.'));
        setIsLoading(false);
      }
      // Page will navigate away to Google; no finally needed
      return;
    }

    // Native mobile: use InAppBrowser with PKCE
    console.log('[auth] Redirect URI:', SUPABASE_OAUTH_REDIRECT);
    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: SUPABASE_OAUTH_REDIRECT,
        skipBrowserRedirect: true,
      },
    });
    console.log('[auth] OAuth URL:', data?.url);
    if (authError) {
      setError(describeError(authError, 'Не удалось войти. Попробуй ещё раз.'));
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
            ephemeralWebSession: true,
          });
          if (result.type === 'success' && result.url) {
            // Some iOS flows do not emit a Linking event; exchange here as a fallback.
            const code = getParamFromCallbackUrl(result.url, 'code');
            if (code) {
              const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeError) {
                console.error('[auth] Code exchange failed:', exchangeError.message);
                setError(describeError(exchangeError, 'Не удалось войти. Попробуй ещё раз.'));
              }
            } else {
              const errorDesc = getParamFromCallbackUrl(result.url, 'error_description');
              if (errorDesc) {
                setError(errorDesc);
              }
            }
          }
        } else {
          await Linking.openURL(data.url);
        }
      } catch (e) {
        console.error('[auth] Failed to open browser:', e);
        setError('Не удалось открыть браузер для входа через Google');
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top app bar */}
        <ScreenHeader onBack={onBack} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerText}>
            <Text variant="h1" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
              С возвращением
            </Text>
            <Text variant="body" align="center" style={[styles.subheader, { color: colors.textSecondary }]}>
              Войди, чтобы продолжить обучение в Flashly
            </Text>
          </View>

          <View style={styles.ctaBlock}>
            <Button
              title="Войти через Google"
              icon={GoogleIcon}
              onPress={signInWithGoogle}
              fullWidth
              disabled={isLoading}
            />
            {error && (
              <Text variant="bodySmall" align="center" accessibilityRole="alert" style={{ color: colors.errorText }}>
                {error}
              </Text>
            )}
            {/* Guest login */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text variant="bodySmall" style={{ color: colors.textTertiary }}>или</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
            <Button
              title="Попробовать без регистрации"
              variant="quiet"
              tone="secondary"
              onPress={handleGuestLogin}
              disabled={isLoading}
              fullWidth
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.l) }]}>
          <Text variant="bodySmall" style={{ color: colors.textTertiary }}>
            Нет аккаунта?
          </Text>
          <Button title="Создать" variant="quiet" size="s" onPress={onCreateAccount} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.l,
  },
  headerText: {
    gap: spacing.s,
  },
  subheader: {
    paddingHorizontal: spacing.s,
  },
  ctaBlock: {
    gap: spacing.s,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
  },
});
