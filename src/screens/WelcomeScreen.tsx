/**
 * WelcomeScreen
 * @description Онбординг / заглушка авторизации. Показываем, если нет аккаунта.
 */
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Button, Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePwaInstall } from '@/hooks/usePwaInstall';

type Props = {
  onCreateAccount?: () => void;
  onSignIn?: () => void;
};

export function WelcomeScreen({ onCreateAccount, onSignIn }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { canInstall, promptInstall } = usePwaInstall();

  const tiles = [
    { icon: 'sparkles', color: 'rgba(100, 103, 242, 0.55)', rotate: '-6deg', iconColor: '#fff', offset: 0 },
    { icon: 'book-outline', color: 'rgba(100, 103, 242, 0.18)', rotate: '12deg', iconColor: colors.primary, offset: 12 },
    { icon: 'flash', color: 'rgba(100, 103, 242, 0.70)', rotate: '5deg', iconColor: '#fff', offset: -10 },
    { icon: 'bulb-outline', color: 'rgba(100, 103, 242, 0.28)', rotate: '-8deg', iconColor: colors.primary, offset: 6 },
  ];

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <View
        style={[
          styles.shell,
          {
            backgroundColor: colors.background,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="flash" size={36} color={colors.primary} />
          </View>
          <Text
            variant="h1"
            align="center"
            style={[styles.title, { color: colors.textPrimary }]}
          >
            Flashly
          </Text>
          <Text
            variant="bodyLarge"
            color="secondary"
            align="center"
            style={styles.subtitle}
          >
            Learn smarter. Remember longer.
          </Text>
        </View>

        <View style={styles.illustration}>
          <View style={styles.tilesGrid}>
            {tiles.map((tile, idx) => (
              <View
                key={tile.icon + idx}
                style={[
                  styles.tile,
                  {
                    backgroundColor: tile.color,
                    transform: [{ rotate: tile.rotate }],
                    marginTop: tile.offset,
                    shadowColor: colors.shadow,
                  },
                ]}
              >
                <Ionicons name={tile.icon as any} size={30} color={tile.iconColor} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title="Создать аккаунт"
            onPress={onCreateAccount}
            fullWidth
            style={styles.actionButton}
          />
          <Button
            title="Войти"
            variant="outline"
            onPress={onSignIn}
            fullWidth
            style={styles.actionButton}
          />
          {canInstall && (
            <Button
              title="Скачать приложение"
              variant="ghost"
              onPress={promptInstall}
              fullWidth
              leftIcon={<Ionicons name="download-outline" size={20} color={colors.primary} />}
              style={styles.actionButton}
            />
          )}
        </View>

        <View style={styles.footer}>
          <Text variant="caption" color="secondary" align="center" style={styles.footerLine}>
            Продолжая, вы соглашаетесь с нашими
          </Text>
          <Text variant="caption" color="secondary" align="center" style={styles.footerLine}>
            Условиями использования и Политикой конфиденциальности
          </Text>
        </View>

        <View style={[styles.homeIndicator, { backgroundColor: colors.border }]} />
      </View>
      </ScrollView>
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
    borderRadius: 0,
    paddingHorizontal: spacing.l,
    paddingVertical: 0,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  logoCircle: {
    backgroundColor: 'rgba(243, 244, 246, 0.8)',
    padding: spacing.m,
    borderRadius: 18,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
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
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 10,
    marginBottom: spacing.m,
  },
  actions: {
    marginBottom: spacing.l,
  },
  actionButton: {
    marginBottom: spacing.s,
  },
  footer: {
    marginBottom: spacing.m,
  },
  footerLine: {
    marginBottom: 2,
  },
  homeIndicator: {
    alignSelf: 'center',
    width: 110,
    height: 6,
    borderRadius: 999,
    opacity: 0.6,
    marginTop: spacing.s,
  },
});
