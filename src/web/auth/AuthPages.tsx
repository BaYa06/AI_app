/**
 * Экраны входа веб-кабинета (plan/new/web_cabinet.md, Web 3): вход, гость, «не учитель», ошибка профиля.
 * Один фиолетовый, без иллюстраций; единственная главная кнопка на экране.
 */
import React, { useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { supabase } from '@/services/supabaseClient';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { TEACH_APPLE_SIGNIN } from '@/config/features';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { GoogleLogo } from '@/components/ui/GoogleLogo';
import type { IconComponent } from '@/components/ui/types';
import { BASE_PATH } from '../router';

/** Знак Google для кнопки: подстраивается под размер и цвет, которые задаёт Button */
function GoogleLogoIcon({ size, color }: { size?: number; color?: string }) {
  return <GoogleLogo size={size} color={color} />;
}
// Button принимает иконки lucide; наш знак совместим по props (size, color)
const GoogleIcon = GoogleLogoIcon as unknown as IconComponent;

const TEACHERS_URL = 'https://flashlycards.app/teachers';

/** Адрес, на который Supabase вернёт после входа. Должен быть в Redirect URLs проекта. */
function redirectUrl(): string {
  return `${window.location.origin}${BASE_PATH}/auth-callback`;
}

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // сессии уже нет
  }
}

function Frame({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={styles.column}>
        <Image
          source={{ uri: '/icons/icon-96.png' }}
          style={styles.logo}
          accessibilityLabel="Flashly"
        />
        {children}
      </View>
    </View>
  );
}

function urlError(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('error_description') ? 'Не удалось войти. Попробуй ещё раз.' : null;
}

export function SignInPage() {
  const [error, setError] = useState<string | null>(urlError);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  const signIn = async (provider: 'google' | 'apple') => {
    setError(null);
    setBusy(provider);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl() },
    });
    // При успехе браузер уходит к провайдеру — сюда вернёмся только с ошибкой
    if (authError) {
      setError('Не удалось войти. Попробуй ещё раз.');
      setBusy(null);
    }
  };

  return (
    <Frame>
      <Text variant="h1" align="center">
        Кабинет учителя
      </Text>
      <Text variant="body" color="secondary" align="center">
        Курсы, ученики и экзамены на большом экране. Входи тем же аккаунтом, что и в приложении.
      </Text>
      <View style={styles.actions}>
        <Button
          title="Войти через Google"
          icon={GoogleIcon}
          onPress={() => signIn('google')}
          loading={busy === 'google'}
          disabled={busy !== null}
          fullWidth
        />
        {TEACH_APPLE_SIGNIN ? (
          <Button
            variant="secondary"
            title="Войти через Apple"
            onPress={() => signIn('apple')}
            loading={busy === 'apple'}
            disabled={busy !== null}
            fullWidth
          />
        ) : null}
      </View>
      {error ? (
        <Text variant="bodySmall" color="error" align="center" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Text variant="bodySmall" color="secondary" align="center">
        Нет аккаунта? Скачай Flashly и выбери роль «Учитель».
      </Text>
      <Button
        variant="quiet"
        title="Как стать учителем"
        onPress={() => Linking.openURL(TEACHERS_URL)}
      />
    </Frame>
  );
}

/** Гостевой аккаунт: курсы привязаны к устройству — просим привязать Google/Apple */
export function GuestPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const link = async () => {
    setError(null);
    setBusy(true);
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: redirectUrl() },
    });
    if (linkError) {
      setError('Не получилось привязать аккаунт. Попробуй ещё раз.');
      setBusy(false);
    }
  };

  return (
    <Frame>
      <Text variant="h1" align="center">
        Привяжи аккаунт
      </Text>
      <Text variant="body" color="secondary" align="center">
        Сейчас ты вошёл как гость. Чтобы курсы и ученики не потерялись, привяжи Google.
      </Text>
      <View style={styles.actions}>
        <Button
          title="Привязать Google"
          icon={GoogleIcon}
          onPress={link}
          loading={busy}
          fullWidth
        />
        <Button variant="quiet" tone="secondary" title="Выйти" icon={LogOut} onPress={signOut} />
      </View>
      {error ? (
        <Text variant="bodySmall" color="error" align="center" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Frame>
  );
}

export function NotTeacherPage({ email }: { email: string | null }) {
  return (
    <Frame>
      <Text variant="h1" align="center">
        Кабинет — только для учителей
      </Text>
      <Text variant="body" color="secondary" align="center">
        {email ? `Аккаунт ${email} — не учительский. ` : ''}
        Роль меняется в приложении Flashly: Профиль → Роль.
      </Text>
      <View style={styles.actions}>
        <Button
          title="Как стать учителем"
          onPress={() => Linking.openURL(TEACHERS_URL)}
          fullWidth
        />
        <Button variant="quiet" tone="secondary" title="Выйти" icon={LogOut} onPress={signOut} />
      </View>
    </Frame>
  );
}

export function ProfileErrorPage({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame>
      <Text variant="h1" align="center">
        Не получилось войти
      </Text>
      <Text variant="body" color="secondary" align="center">
        Нет связи или сервер не отвечает. Попробуй ещё раз.
      </Text>
      <View style={styles.actions}>
        <Button title="Повторить" onPress={onRetry} fullWidth />
        <Button variant="quiet" tone="secondary" title="Выйти" icon={LogOut} onPress={signOut} />
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.l },
  column: { width: '100%', maxWidth: 400, alignItems: 'center', gap: spacing.m },
  logo: { width: 64, height: 64, borderRadius: borderRadius.l, marginBottom: spacing.s },
  actions: { width: '100%', gap: spacing.s, marginTop: spacing.s, alignItems: 'center' },
});
