/**
 * Google-only auth screen for React Native + Supabase.
 * Opens Google in the system browser, listens for session changes, and exposes the logged-in user.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { Session } from '@supabase/supabase-js';

import { Button, Text } from '@/components/common';
import { borderRadius, spacing } from '@/constants';
import { SUPABASE_OAUTH_REDIRECT, supabase } from '@/services/supabaseClient';
import { useThemeColors } from '@/store';

type Props = {
  onBack?: () => void;
  // Kept optional for backward navigation compatibility; not used because flow is Google-only.
  onRequestCode?: (email?: string, password?: string) => void;
};

export function EmailAuthScreen({ onBack }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  /**
   * Triggers the Supabase OAuth flow in the system browser.
   * Supabase handles PKCE + code exchange and will deliver the session back via the deep link redirect URI.
   */
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: SUPABASE_OAUTH_REDIRECT,
      },
    });

    if (error) {
      console.error('[auth] Google sign-in error', error);
      setAuthError(error.message);
      setIsLoading(false);
    }
    // Loading spinner stays until onAuthStateChange fires or we get the existing session below.
  }, []);

  /**
   * Subscribes to Supabase auth state changes and restores any existing session on mount.
   */
  useEffect(() => {
    let isMounted = true;

    // Restore session if the user already signed in earlier.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) setAuthError(error.message);
        if (data.session) setSession(data.session);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setIsLoading(false);
      if (newSession?.user) {
        console.log('[auth] signed in', {
          id: newSession.user.id,
          email: newSession.user.email,
        });
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.shell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.navBar, { paddingTop: insets.top }]}>
          <Button
            title=""
            variant="ghost"
            onPress={onBack}
            style={styles.backButton}
            leftIcon={<Ionicons name="chevron-back" size={22} color={colors.textPrimary} />}
          />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, spacing.l) }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contentWrapper}>
            <View style={styles.content}>
              <View style={styles.heading}>
                <Text variant="h1" style={[styles.title, { color: colors.textPrimary }]}>
                  Войти через Google
                </Text>
                <Text variant="body" color="secondary">
                  Мы откроем системный браузер, вы выберете аккаунт Google, и вернётесь в приложение
                  с активной сессией Supabase.
                </Text>
              </View>

              <Button
                title="Continue with Google"
                onPress={signInWithGoogle}
                fullWidth
                disabled={isLoading}
                leftIcon={<Ionicons name="logo-google" size={18} color={colors.surface} />}
              />

              {isLoading && (
                <View style={styles.indicatorRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text variant="bodySmall" color="secondary" style={styles.indicatorText}>
                    Открываем Google…
                  </Text>
                </View>
              )}

              {session?.user && (
                <View style={[styles.sessionCard, { borderColor: colors.border }]}>
                  <Text variant="body" style={{ color: colors.textPrimary }}>
                    Вы вошли
                  </Text>
                  <Text variant="bodySmall" color="secondary">
                    User ID: {session.user.id}
                  </Text>
                  <Text variant="bodySmall" color="secondary">
                    Email: {session.user.email ?? '—'}
                  </Text>
                </View>
              )}

              {authError && (
                <Text variant="bodySmall" color="error" style={styles.error}>
                  {authError}
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  shell: {
    flex: 1,
    width: '100%',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignSelf: 'flex-start',
  },
  scrollContent: {
    flexGrow: 1,
  },
  contentWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.m,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    gap: spacing.m,
  },
  heading: {
    gap: spacing.s,
  },
  title: {
    letterSpacing: -0.4,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  indicatorText: {
    marginLeft: spacing.xs,
  },
  sessionCard: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  error: {
    marginTop: spacing.xs,
  },
});
