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
  Switch,
} from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { DatabaseService, supabase } from '@/services';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { Session } from '@supabase/supabase-js';

// ==================== НАСТРОЙКИ СЕКЦИЙ ====================

const QUICK_ACTIONS = [
  { icon: 'bar-chart-outline', label: 'Статистика' },
  { icon: 'trophy-outline', label: 'Награды' },
  { icon: 'settings-outline', label: 'Настройки' },
] as const;

const ACCOUNT_ITEMS = [
  { icon: 'person-outline', label: 'Личные данные', badge: null },
  { icon: 'shield-checkmark-outline', label: 'Безопасность', badge: null },
  { icon: 'card-outline', label: 'Подписка', badge: 'PRO' },
] as const;

const PREFERENCES_ITEMS = [
  { icon: 'school-outline', label: 'Настройки обучения' },
] as const;

const CUSTOMIZATION_ITEMS_KEYS = ['appearance', 'notifications', 'sound'] as const;

const DATA_ITEMS = [
  { icon: 'server-outline', label: 'Данные и хранилище' },
  { icon: 'document-text-outline', label: 'Правовая информация' },
] as const;

// ==================== MAIN SCREEN ====================

export function ProfileScreen({ navigation }: any) {
  const colors = useThemeColors();
  const settings = useSettingsStore((s) => s.settings);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const isDark = resolvedTheme === 'dark';

  const [session, setSession] = useState<Session | null>(null);

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

  const userEmail = session?.user?.email;
  const userName = useMemo(() => {
    if (!userEmail) return 'Гость';
    return userEmail.split('@')[0];
  }, [userEmail]);

  const avatarLetter = useMemo(
    () => (userEmail ? userEmail[0].toUpperCase() : '?'),
    [userEmail],
  );

  // Переключение темной темы
  const handleToggleDarkMode = useCallback(() => {
    toggleTheme();
  }, [toggleTheme]);

  // Экспорт данных
  const handleExport = useCallback(async () => {
    try {
      DatabaseService.exportData();
      Alert.alert('Экспорт', 'Данные подготовлены для экспорта');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось экспортировать данные');
    }
  }, []);

  // Очистка данных
  const handleClearData = useCallback(() => {
    Alert.alert(
      'Удалить все данные?',
      'Все наборы и карточки будут удалены. Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            DatabaseService.clearAll();
            Alert.alert('Готово', 'Все данные удалены');
          },
        },
      ],
    );
  }, []);

  // Logout
  const handleLogout = useCallback(() => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }, []);

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
          <Pressable
            style={[st.headerBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* ======== Hero Card ======== */}
        <View style={[st.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* User Info Row */}
          <View style={st.userRow}>
            <View style={st.avatarWrap}>
              {/* Level Ring */}
              <View style={[st.avatarRing, { borderColor: colors.primary + '30' }]} />
              <View style={[st.avatarRingProgress, { borderColor: colors.primary, borderTopColor: 'transparent' }]} />
              <View style={[st.avatar, { backgroundColor: colors.primary }]}>
                <Text style={st.avatarText}>{avatarLetter}</Text>
              </View>
              <View style={[st.levelBadge, { backgroundColor: colors.primary }]}>
                <Text style={st.levelText}>LVL 12</Text>
              </View>
            </View>
            <View style={st.userInfo}>
              <Text style={[st.userName, { color: colors.textPrimary }]}>{userName}</Text>
              <Text style={[st.userEmail, { color: colors.textTertiary }]}>
                {userEmail ?? 'Войдите, чтобы синхронизировать'}
              </Text>
            </View>
          </View>

          {/* XP Progress */}
          <View style={st.xpSection}>
            <View style={st.xpLabelRow}>
              <Text style={[st.xpLabel, { color: colors.textTertiary }]}>Прогресс XP</Text>
              <Text style={[st.xpPercent, { color: colors.primary }]}>67%</Text>
            </View>
            <View style={[st.xpBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
              <View style={[st.xpBarFill, { backgroundColor: colors.primary, width: '67%' }]} />
            </View>
            <Text style={[st.xpHint, { color: colors.textTertiary }]}>330 XP до уровня 13</Text>
          </View>

          {/* Quick Stats */}
          <View style={[st.statsRow, { borderTopColor: dividerColor }]}>
            <View style={st.statItem}>
              <Text style={[st.statValue, { color: colors.primary }]}>7</Text>
              <Text style={[st.statLabel, { color: colors.textTertiary }]}>Серия</Text>
            </View>
            <View style={[st.statItem, st.statMiddle, { borderColor: dividerColor }]}>
              <Text style={[st.statValue, { color: colors.primary }]}>24</Text>
              <Text style={[st.statLabel, { color: colors.textTertiary }]}>Награды</Text>
            </View>
            <View style={st.statItem}>
              <Text style={[st.statValue, { color: colors.primary }]}>847</Text>
              <Text style={[st.statLabel, { color: colors.textTertiary }]}>Карточки</Text>
            </View>
          </View>
        </View>

        {/* ======== Quick Actions ======== */}
        <View style={st.quickActionsRow}>
          {QUICK_ACTIONS.map((action, i) => (
            <Pressable
              key={i}
              style={[st.quickActionBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
              onPress={() => {
                if (i === 0) navigation?.navigate('Statistics');
                if (i === 1) navigation?.navigate('Achievements');
              }}
            >
              <Ionicons name={action.icon as any} size={28} color={colors.primary} />
              <Text style={[st.quickActionLabel, { color: colors.textPrimary }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ======== Account Settings ======== */}
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Настройки аккаунта</Text>
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {ACCOUNT_ITEMS.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={[st.divider, { backgroundColor: dividerColor }]} />}
              <Pressable
                style={st.settingsItem}
                onPress={() => {
                  if (i === 0) navigation?.navigate('PersonalInfo');
                  if (i === 1) navigation?.navigate('Security');
                  if (i === 2) navigation?.navigate('Subscription');
                }}
              >
                <Ionicons name={item.icon as any} size={22} color={colors.textTertiary} />
                <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>{item.label}</Text>
                {item.badge && (
                  <View style={[st.proBadge, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[st.proBadgeText, { color: colors.primary }]}>{item.badge}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
              </Pressable>
            </React.Fragment>
          ))}
        </View>

        {/* ======== Preferences ======== */}
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Предпочтения</Text>
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {PREFERENCES_ITEMS.map((item, i) => (
            <Pressable key={i} style={st.settingsItem}>
              <Ionicons name={item.icon as any} size={22} color={colors.textTertiary} />
              <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
            </Pressable>
          ))}
        </View>

        {/* ======== App Customization ======== */}
        <Text style={[st.sectionLabel, { color: colors.textTertiary }]}>Кастомизация</Text>
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Appearance */}
          <View style={st.settingsItem}>
            <Ionicons name="color-palette-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Внешний вид</Text>
            <Switch
              value={themeMode === 'dark'}
              onValueChange={handleToggleDarkMode}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          {/* Notifications */}
          <Pressable
            style={st.settingsItem}
            onPress={() => navigation?.navigate('NotificationSettings')}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Уведомления</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          {/* Sound */}
          <Pressable style={st.settingsItem}>
            <Ionicons name="volume-medium-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Звук и эффекты</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>
        </View>

        {/* ======== Data & Legal ======== */}
        <View style={[st.settingsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Pressable style={st.settingsItem} onPress={handleExport}>
            <Ionicons name="server-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Данные и хранилище</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          <Pressable style={st.settingsItem}>
            <Ionicons name="document-text-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.settingsItemText, { color: colors.textPrimary }]}>Правовая информация</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
          </Pressable>
        </View>

        {/* ======== Danger Zone ======== */}
        <Pressable
          style={[st.dangerBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2' }]}
          onPress={handleClearData}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
          <Text style={[st.dangerBtnText, { color: colors.error }]}>Удалить все данные</Text>
        </Pressable>

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

        {/* App Info */}
        <Text style={[st.appVersion, { color: colors.textTertiary }]}>Flashly v1.0.0</Text>
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
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
  avatarRingProgress: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    transform: [{ rotate: '-45deg' }],
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

  // Quick Actions
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.s,
    marginBottom: spacing.l,
  },
  quickActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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

  // PRO Badge
  proBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.xs,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Danger Button
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 14,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.s,
  },
  dangerBtnText: {
    fontSize: 15,
    fontWeight: '700',
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

  // App Version
  appVersion: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
