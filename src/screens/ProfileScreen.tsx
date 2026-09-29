/**
 * Profile Screen
 * @description Экран профиля и настроек
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSettingsStore, useThemeColors, useDiamondStore } from '@/store';
import { supabase, NeonService, Analytics, StreakService, DatabaseService } from '@/services';
import type { UserStats } from '@/services';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { Session } from '@supabase/supabase-js';
import type { ThemeMode } from '@/types';
import { useFocusEffect } from '@react-navigation/native';
import { version as APP_VERSION } from '../../package.json';
import { getLevelProgress, XP_PER_LEVEL } from '@/utils/level';

// ==================== ПРАВОВАЯ ИНФОРМАЦИЯ ====================

// Пустая ссылка — пункт не показывается
const PRIVACY_POLICY_URL = '';
const TERMS_URL = '';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Авто' },
];

// ==================== MAIN SCREEN ====================

export function ProfileScreen({ navigation }: any) {
  const colors = useThemeColors();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const isDark = resolvedTheme === 'dark';

  const [session, setSession] = useState<Session | null>(null);
  const [userNameHandle, setUserNameHandle] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(() => StreakService.cachedUserStats());
  const streak = useSettingsStore((s) => s.streakCache.currentStreak);
  const diamonds = useDiamondStore((s) => s.diamonds);
  const loadRewards = useDiamondStore((s) => s.loadRewards);
  const isTeacher = useSettingsStore((s) => s.isTeacher);
  const [deleting, setDeleting] = useState(false);

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

  // Подтягиваем актуальную сессию Supabase
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Имя и статистика из БД (обновляем при каждом фокусе экрана)
  const sessionUserId = session?.user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!sessionUserId) {
        setUserNameHandle(null);
        setDisplayName(null);
        return;
      }
      NeonService.getUserName(sessionUserId).then(setUserNameHandle);
      NeonService.getDisplayName(sessionUserId).then(setDisplayName);
      StreakService.fetchUserStats().then((stats) => {
        if (stats) setUserStats(stats);
      });
      loadRewards();
    }, [sessionUserId, loadRewards]),
  );

  const userEmail = session?.user?.email;
  const userName = useMemo(() => {
    if (displayName?.trim()) return displayName.trim();
    if (!userEmail) return 'Гость';
    return userEmail.split('@')[0];
  }, [displayName, userEmail]);

  const avatarLetter = useMemo(
    () => (userName !== 'Гость' ? userName[0].toUpperCase() : '?'),
    [userName],
  );

  // Без входа статистики нет — показываем нули, а не кэш прошлого аккаунта
  const totalCardsStudied = session ? (userStats?.total_cards_studied ?? 0) : 0;
  const { level, xpCurrent, xpPercent, xpToNext } = getLevelProgress(totalCardsStudied);

  // Logout. scope 'global' — завершить сессии и на всех остальных устройствах
  const doSignOut = useCallback(async (scope: 'local' | 'global' = 'local') => {
    try {
      Analytics.logout();
      await supabase.auth.signOut({ scope });
    } catch (e) {
      console.error('Logout error:', e);
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm('Выйти из аккаунта?')) {
        doSignOut();
      }
      return;
    }
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => doSignOut() },
    ]);
  }, [doSignOut]);

  const handleLogoutEverywhere = useCallback(() => {
    const title = 'Выйти на всех устройствах?';
    const message = 'Сессии завершатся на всех телефонах и в браузерах, включая этот.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n${message}`)) doSignOut('global');
      return;
    }
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти везде', style: 'destructive', onPress: () => doSignOut('global') },
    ]);
  }, [doSignOut]);

  // Удаление аккаунта (требование App Store): сервер удаляет данные и пользователя,
  // затем чистим устройство и выходим — App.tsx по SIGNED_OUT вернёт на экран приветствия
  const doDeleteAccount = useCallback(async () => {
    setDeleting(true);
    const ok = await NeonService.deleteAccount();
    if (!ok) {
      setDeleting(false);
      const msg = 'Не удалось удалить аккаунт. Проверьте интернет и попробуйте ещё раз.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Ошибка', msg);
      return;
    }
    DatabaseService.clearAll();
    await doSignOut('local');
  }, [doSignOut]);

  const handleDeleteAccount = useCallback(() => {
    if (deleting) return;
    const title = 'Удалить аккаунт?';
    const message =
      'Будут безвозвратно удалены все ваши наборы, прогресс, серия, алмазы и публикации в библиотеке.' +
      (isTeacher ? ' Ваши курсы тоже будут удалены, и ученики потеряют к ним доступ.' : '') +
      ' Отменить это нельзя.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) doDeleteAccount();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: doDeleteAccount },
    ]);
  }, [deleting, isTeacher, doDeleteAccount]);

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ======== Header ======== */}
        <View style={st.header}>
          <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Профиль</Text>
        </View>

        {/* ======== Hero Card ======== */}
        <View style={[st.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* User Info Row */}
          <View style={st.userRow}>
            <View style={st.avatarWrap}>
              {/* Level Ring */}
              <View style={[st.avatarRing, { borderColor: colors.primary + '30' }]} />
              <View style={[st.avatar, { backgroundColor: colors.primary }]}>
                <Text style={st.avatarText}>{avatarLetter}</Text>
              </View>
              <View style={[st.levelBadge, { backgroundColor: colors.primary }]}>
                <Text style={st.levelText}>Ур. {level}</Text>
              </View>
            </View>
            <View style={st.userInfo}>
              <Text style={[st.userName, { color: colors.textPrimary }]}>{userName}</Text>
              {userNameHandle && (
                <Text style={[st.userHandle, { color: colors.primary }]}>{userNameHandle}</Text>
              )}
              <Text style={[st.userEmail, { color: colors.textTertiary }]}>
                {userEmail ?? 'Войдите, чтобы синхронизировать'}
              </Text>
            </View>
          </View>

          {/* XP Progress */}
          <View style={st.xpSection}>
            <View style={st.xpLabelRow}>
              <Text style={[st.xpLabel, { color: colors.textTertiary }]}>Опыт</Text>
              <Text style={[st.xpPercent, { color: colors.primary }]}>{xpCurrent} / {XP_PER_LEVEL}</Text>
            </View>
            <View style={[st.xpBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <View style={[st.xpBarFill, { backgroundColor: colors.primary, width: `${xpPercent}%` }]} />
            </View>
            <Text style={[st.xpHint, { color: colors.textTertiary }]}>{xpToNext} до уровня {level + 1} · 1 карточка = 1 очко опыта</Text>
          </View>

          {/* Quick Stats */}
          <View style={[st.statsRow, { borderTopColor: dividerColor }]}>
            <View style={st.statItem}>
              <Text style={[st.statValue, { color: colors.primary }]}>{session ? streak : 0}</Text>
              <Text style={[st.statLabel, { color: colors.textTertiary }]}>Серия</Text>
            </View>
            <View style={[st.statItem, st.statMiddle, { borderColor: dividerColor }]}>
              <Text style={[st.statValue, { color: colors.primary }]}>{session ? diamonds : 0}</Text>
              <Text style={[st.statLabel, { color: colors.textTertiary }]}>Алмазы</Text>
            </View>
            <View style={st.statItem}>
              <Text style={[st.statValue, { color: colors.primary }]}>{totalCardsStudied}</Text>
              <Text style={[st.statLabel, { color: colors.textTertiary }]}>Изучено</Text>
            </View>
          </View>
        </View>

        {/* ======== Account ======== */}
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Аккаунт</Text>
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Pressable style={st.settingsItem} onPress={() => navigation?.navigate('PersonalInfo')}>
            <Ionicons name="person-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Личные данные</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          <Pressable style={st.settingsItem} onPress={() => navigation?.navigate('MyPublications')}>
            <Ionicons name="book-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Мои публикации</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>
        </View>

        {/* ======== Learning ======== */}
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Обучение</Text>
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Pressable style={st.settingsItem} onPress={() => navigation?.navigate('LearningSettings')}>
            <Ionicons name="school-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Настройки обучения</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          <Pressable style={st.settingsItem} onPress={() => navigation?.navigate('NotificationSettings')}>
            <Ionicons name="notifications-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Уведомления</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>
        </View>

        {/* ======== App ======== */}
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Приложение</Text>
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={st.settingsItem}>
            <Ionicons name="color-palette-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Тема</Text>
            <View style={[st.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              {THEME_OPTIONS.map((opt) => {
                const active = themeMode === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setTheme(opt.value)}
                    style={[st.segmentItem, active && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[st.segmentText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          <Pressable style={st.settingsItem} onPress={() => navigation?.navigate('SoundSettings')}>
            <Ionicons name="volume-medium-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Звук и вибрация</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>
        </View>

        {/* ======== Support ======== */}
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Поддержка</Text>
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Pressable style={st.settingsItem} onPress={() => navigation?.navigate('Feedback')}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Написать нам</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>
        </View>

        {/* ======== Legal ======== */}
        {(PRIVACY_POLICY_URL || TERMS_URL) ? (
          <>
            <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Правовая информация</Text>
            <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {PRIVACY_POLICY_URL ? (
                <Pressable style={st.settingsItem} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={colors.textTertiary} />
                  <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Политика конфиденциальности</Text>
                  <Ionicons name="open-outline" size={18} color={colors.textTertiary + '60'} />
                </Pressable>
              ) : null}

              {PRIVACY_POLICY_URL && TERMS_URL ? (
                <View style={[st.divider, { backgroundColor: dividerColor }]} />
              ) : null}

              {TERMS_URL ? (
                <Pressable style={st.settingsItem} onPress={() => Linking.openURL(TERMS_URL)}>
                  <Ionicons name="document-text-outline" size={22} color={colors.textTertiary} />
                  <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Условия использования</Text>
                  <Ionicons name="open-outline" size={18} color={colors.textTertiary + '60'} />
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ======== Logout ======== */}
        {session && (
          <Pressable
            style={[st.logoutBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2' }]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={[st.logoutText, { color: colors.error }]}>Выйти</Text>
          </Pressable>
        )}

        {session && (
          <View style={st.accountLinks}>
            <Pressable onPress={handleLogoutEverywhere} hitSlop={8}>
              <Text style={[st.accountLinkText, { color: colors.textTertiary }]}>Выйти на всех устройствах</Text>
            </Pressable>
            <Pressable onPress={handleDeleteAccount} disabled={deleting} hitSlop={8} style={st.deleteRow}>
              {deleting && <ActivityIndicator size="small" color={colors.error} />}
              <Text style={[st.accountLinkText, { color: colors.error }]}>
                {deleting ? 'Удаляем аккаунт…' : 'Удалить аккаунт'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* App Info */}
        <Text style={[st.appVersion, { color: colors.textTertiary }]}>Flashly v{APP_VERSION}</Text>
      </ScrollView>
    </View>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.l,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  // Hero Card
  heroCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.l,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.l,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  levelBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  userHandle: {
    fontSize: 14,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 13,
    fontWeight: '500',
  },

  // XP
  xpSection: {
    marginBottom: spacing.l,
  },
  xpLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  xpLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  xpPercent: {
    fontSize: 13,
    fontWeight: '700',
  },
  xpBarBg: {
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.xxs,
  },
  xpBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  xpHint: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'right',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.m,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statMiddle: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },

  // Section Label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.s,
    paddingHorizontal: spacing.xs,
  },

  // Settings Card
  settingsCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.l,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: 14,
    paddingHorizontal: spacing.m,
  },
  settingsItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.m,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 14,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.m,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
  },

  // Account links
  accountLinks: {
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.l,
  },
  accountLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  // Theme segment
  segment: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    padding: 3,
  },
  segmentItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // App Version
  appVersion: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
