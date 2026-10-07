/**
 * Profile Screen
 * @description Экран профиля и настроек
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { useSettingsStore, useThemeColors, useDiamondStore } from '@/store';
import { supabase, NeonService, Analytics, StreakService, DatabaseService } from '@/services';
import type { UserStats } from '@/services';
import { Text } from '@/components/common';
import { spacing, borderRadius, iconSize, alpha } from '@/constants';
import { Button, Card, ListGroup, ListRow, ProgressBar, Screen, toast } from '@/components/ui';
import {
  User,
  BookOpen,
  GraduationCap,
  Bell,
  Palette,
  Volume2,
  MessageSquare,
  ShieldCheck,
  FileText,
  ExternalLink,
  LogOut,
} from 'lucide-react-native';
import type { Session } from '@supabase/supabase-js';
import type { ThemeMode } from '@/types';
import { useFocusEffect } from '@react-navigation/native';
import { version as APP_VERSION } from '../../package.json';
import { getLevelProgress, XP_PER_LEVEL } from '@/utils/level';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/config/legal';
import { COMMUNITY_LIBRARY_ENABLED } from '@/config/features';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Авто' },
];

// ==================== MAIN SCREEN ====================

export function ProfileScreen({ navigation }: any) {
  const colors = useThemeColors();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const [session, setSession] = useState<Session | null>(null);
  const [userNameHandle, setUserNameHandle] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(() => StreakService.cachedUserStats());
  const streak = useSettingsStore((s) => s.streakCache.currentStreak);
  const diamonds = useDiamondStore((s) => s.diamonds);
  const loadRewards = useDiamondStore((s) => s.loadRewards);
  const isTeacher = useSettingsStore((s) => s.isTeacher);
  const [deleting, setDeleting] = useState(false);


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
      const msg = 'Не удалось удалить аккаунт. Проверь интернет и попробуй ещё раз.';
      if (Platform.OS === 'web') window.alert(msg);
      else toast.error(msg);
      return;
    }
    DatabaseService.clearAll();
    await doSignOut('local');
  }, [doSignOut]);

  const handleDeleteAccount = useCallback(() => {
    if (deleting) return;
    const title = 'Удалить аккаунт?';
    const message =
      'Будут безвозвратно удалены все твои наборы, прогресс, серия, алмазы и публикации в библиотеке.' +
      (isTeacher ? ' Твои курсы тоже будут удалены, и ученики потеряют к ним доступ.' : '') +
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
    <Screen contentStyle={st.content}>
      {/* ======== Header ======== */}
      <Text variant="h2" accessibilityRole="header" style={[st.headerTitle, { color: colors.textPrimary }]}>Профиль</Text>

      {/* ======== Hero Card ======== */}
      <Card style={st.heroCard}>
        {/* User Info Row */}
        <View style={st.userRow}>
          <View style={st.avatarWrap}>
            {/* Level Ring */}
            <View style={[st.avatarRing, { borderColor: alpha(colors.primary, 20) }]} />
            <View style={[st.avatar, { backgroundColor: colors.primaryFill }]}>
              <Text variant="h1" style={{ color: colors.onPrimary }}>{avatarLetter}</Text>
            </View>
            <View style={[st.levelBadge, { backgroundColor: colors.primaryFill, borderColor: colors.surface }]}>
              <Text variant="caption" style={[st.bold, { color: colors.onPrimary }]}>Ур. {level}</Text>
            </View>
          </View>
          <View style={st.userInfo}>
            <Text variant="h3" style={[st.bold, { color: colors.textPrimary }]} numberOfLines={1}>{userName}</Text>
            {userNameHandle && (
              <Text variant="bodySmall" style={[st.semibold, { color: colors.primary }]}>{userNameHandle}</Text>
            )}
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {userEmail ?? 'Войди, чтобы синхронизировать'}
            </Text>
          </View>
        </View>

        {/* XP Progress */}
        <View style={st.xpSection}>
          <View style={st.xpLabelRow}>
            <Text variant="overline" color="secondary">Опыт</Text>
            <Text variant="label" style={{ color: colors.primary }}>{xpCurrent} / {XP_PER_LEVEL}</Text>
          </View>
          <ProgressBar progress={xpPercent} accessibilityLabel="Опыт до следующего уровня" />
          <Text variant="caption" color="secondary">{xpToNext} до уровня {level + 1} · 1 карточка = 1 очко опыта</Text>
        </View>

        {/* Quick Stats */}
        <View style={[st.statsRow, { borderTopColor: colors.border }]}>
          <View style={st.statItem} accessible accessibilityLabel={`Серия: ${session ? streak : 0}`}>
            <Text variant="h3" style={[st.bold, { color: colors.primary }]}>{session ? streak : 0}</Text>
            <Text variant="caption" color="secondary">Серия</Text>
          </View>
          <View style={[st.statItem, st.statMiddle, { borderColor: colors.border }]} accessible accessibilityLabel={`Алмазы: ${session ? diamonds : 0}`}>
            <Text variant="h3" style={[st.bold, { color: colors.primary }]}>{session ? diamonds : 0}</Text>
            <Text variant="caption" color="secondary">Алмазы</Text>
          </View>
          <View style={st.statItem} accessible accessibilityLabel={`Изучено: ${totalCardsStudied}`}>
            <Text variant="h3" style={[st.bold, { color: colors.primary }]}>{totalCardsStudied}</Text>
            <Text variant="caption" color="secondary">Изучено</Text>
          </View>
        </View>
      </Card>

      {/* ======== Account ======== */}
      <ListGroup title="Аккаунт" style={st.group}>
        <ListRow icon={User} title="Личные данные" onPress={() => navigation?.navigate('PersonalInfo')} />
        {COMMUNITY_LIBRARY_ENABLED && (
          <ListRow icon={BookOpen} title="Мои публикации" onPress={() => navigation?.navigate('MyPublications')} />
        )}
      </ListGroup>

      {/* ======== Learning ======== */}
      <ListGroup title="Обучение" style={st.group}>
        <ListRow icon={GraduationCap} title="Настройки обучения" onPress={() => navigation?.navigate('LearningSettings')} />
        <ListRow icon={Bell} title="Уведомления" onPress={() => navigation?.navigate('NotificationSettings')} />
      </ListGroup>

      {/* ======== App ======== */}
      <ListGroup title="Приложение" style={st.group}>
        <ListRow
          icon={Palette}
          title="Тема"
          right={
            <View style={[st.segment, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="radiogroup">
              {THEME_OPTIONS.map((opt) => {
                const active = themeMode === opt.value;
                return (
                  <Pressable hitSlop={{ top: spacing.xs, bottom: spacing.xs }}
                    key={opt.value}
                    onPress={() => setTheme(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={[st.segmentItem, active && { backgroundColor: colors.primaryFill }]}
                  >
                    <Text variant="caption" style={[st.bold, { color: active ? colors.onPrimary : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          }
        />
        <ListRow icon={Volume2} title="Звук и вибрация" onPress={() => navigation?.navigate('SoundSettings')} />
      </ListGroup>

      {/* ======== Support ======== */}
      <ListGroup title="Поддержка" style={st.group}>
        <ListRow icon={MessageSquare} title="Написать нам" onPress={() => navigation?.navigate('Feedback')} />
      </ListGroup>

      {/* ======== Legal ======== */}
      <ListGroup title="Правовая информация" style={st.group}>
        <ListRow
          icon={ShieldCheck}
          title="Политика конфиденциальности"
          chevron={false}
          right={<ExternalLink size={iconSize.xs} color={colors.textTertiary} />}
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
        />
        <ListRow
          icon={FileText}
          title="Условия использования"
          chevron={false}
          right={<ExternalLink size={iconSize.xs} color={colors.textTertiary} />}
          onPress={() => Linking.openURL(TERMS_URL)}
        />
      </ListGroup>

      {/* ======== Logout ======== */}
      {session && (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [st.logoutBtn, { backgroundColor: alpha(colors.error, 10) }, pressed && st.pressed]}
          onPress={handleLogout}
        >
          <LogOut size={iconSize.s} color={colors.errorText} />
          <Text variant="button" style={[st.noLetterSpacing, { color: colors.errorText }]}>Выйти</Text>
        </Pressable>
      )}

      {session && (
        <View style={st.accountLinks}>
          <Button variant="quiet" tone="secondary" size="s" title="Выйти на всех устройствах" onPress={handleLogoutEverywhere} />
          <Button
            variant="danger"
            size="s"
            title={deleting ? 'Удаляем аккаунт…' : 'Удалить аккаунт'}
            onPress={handleDeleteAccount}
            loading={deleting}
          />
        </View>
      )}

      {/* App Info */}
      <Text variant="caption" align="center" style={[st.appVersion, { color: colors.textTertiary }]}>Flashly v{APP_VERSION}</Text>
    </Screen>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.m,
  },
  bold: {
    fontWeight: '700',
  },
  semibold: {
    fontWeight: '600',
  },
  noLetterSpacing: {
    letterSpacing: 0,
  },
  pressed: {
    opacity: 0.85,
  },
  headerTitle: {
    marginBottom: spacing.m,
  },
  heroCard: {
    padding: spacing.l,
    marginBottom: spacing.l,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.full,
    borderWidth: 3,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    position: 'absolute',
    bottom: -spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs / 2,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  userInfo: {
    flex: 1,
    gap: spacing.xxs / 2,
  },
  xpSection: {
    marginTop: spacing.l,
    gap: spacing.xs,
  },
  xpLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.l,
    paddingTop: spacing.m,
    borderTopWidth: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statMiddle: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  group: {
    marginBottom: spacing.l,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: borderRadius.m,
    padding: spacing.xxs / 2,
  },
  segmentItem: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.s,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    borderRadius: borderRadius.m,
  },
  accountLinks: {
    alignItems: 'center',
    marginTop: spacing.s,
  },
  appVersion: {
    marginTop: spacing.l,
  },
});
