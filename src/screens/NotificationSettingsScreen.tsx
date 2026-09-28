/**
 * Notification Settings Screen
 * @description Экран настроек уведомлений
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useThemeColors, useSettingsStore } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  requestPushPermission,
  unsubscribePush,
  getPushStatus,
  type PushStatus,
} from '@/services/pushNotifications';
import { supabase } from '@/services';
import { API_BASE } from '@/config/apiBase';

// Сервер шлёт напоминания раз в час и только с 8 до 21 (api/push.js, cron-reminders)
const MIN_HOUR = 8;
const MAX_HOUR = 21;
const clampHour = (h: number) => Math.min(MAX_HOUR, Math.max(MIN_HOUR, h));

const DAYS = [
  { key: 'mon', label: 'Пн' },
  { key: 'tue', label: 'Вт' },
  { key: 'wed', label: 'Ср' },
  { key: 'thu', label: 'Чт' },
  { key: 'fri', label: 'Пт' },
  { key: 'sat', label: 'Сб' },
  { key: 'sun', label: 'Вс' },
] as const;

export function NotificationSettingsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const subtleBg = isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC';
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

  // ---- State ----
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [hours, setHours] = useState(19);
  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
  });
  const [streakReminders, setStreakReminders] = useState(true);

  // Push notifications (real)
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPushStatus().then(setPushStatus);
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      setUserId(uid);
      if (uid) {
        fetch(`${API_BASE}/push?action=settings&userId=${uid}`)
          .then((r) => r.json())
          .then((d) => {
            setReminderEnabled(d.notifEnabled ?? true);
            setHours(clampHour(d.notifHour ?? 19));
            setStreakReminders(d.notifStreak ?? true);
            if (d.notifDays) {
              const active = d.notifDays.split(',');
              setSelectedDays({
                mon: active.includes('mon'),
                tue: active.includes('tue'),
                wed: active.includes('wed'),
                thu: active.includes('thu'),
                fri: active.includes('fri'),
                sat: active.includes('sat'),
                sun: active.includes('sun'),
              });
            }
          })
          .catch(() => {});
      }
    });
  }, []);

  const handleTogglePush = useCallback(async () => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (pushStatus?.permission === 'granted' && pushStatus?.token) {
        const ok = await unsubscribePush();
        if (ok) {
          setPushStatus({ permission: 'default', token: null, isSupported: true });
        }
      } else {
        const status = await requestPushPermission(userId);
        setPushStatus(status);
      }
    } catch (error) {
      console.error('[NotificationSettings] Push toggle error:', error);
    } finally {
      setPushLoading(false);
    }
  }, [pushLoading, pushStatus, userId]);

  const toggleDay = (key: string) => {
    setSelectedDays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const incrementHours = () => setHours((h) => (h >= MAX_HOUR ? MIN_HOUR : h + 1));
  const decrementHours = () => setHours((h) => (h <= MIN_HOUR ? MAX_HOUR : h - 1));

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      {/* ======== Header ======== */}
      <View style={[st.header, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF', borderBottomColor: cardBorder }]}>
        <Pressable
          style={[st.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[st.headerTitle, { color: colors.textPrimary }]}>Уведомления</Text>
        <View style={st.headerSpacer} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ======== Learning Reminder ======== */}
        <View style={st.sectionHeader}>
          <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Напоминание об учёбе</Text>
          <Switch
            value={reminderEnabled}
            onValueChange={setReminderEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Time Picker */}
        <View style={[st.card, { backgroundColor: subtleBg, borderColor: cardBorder }]}>
          <Text style={[st.cardLabel, { color: colors.textTertiary }]}>Время ежедневного напоминания</Text>
          <Text style={[st.cardHint, { color: colors.textTertiary }]}>Напоминания приходят с 8:00 до 21:00</Text>
          <View style={st.timeRow}>
            <View style={st.timeCol}>
              <Pressable onPress={incrementHours} style={st.timeArrow}>
                <Ionicons name="chevron-up" size={24} color={colors.textTertiary} />
              </Pressable>
              <View style={[st.timeBox, { backgroundColor: cardBg, borderColor: colors.primary + '30' }]}>
                <Text style={[st.timeText, { color: colors.primary }]}>{pad(hours)}</Text>
              </View>
              <Pressable onPress={decrementHours} style={st.timeArrow}>
                <Ionicons name="chevron-down" size={24} color={colors.textTertiary} />
              </Pressable>
            </View>

            <Text style={[st.timeSep, { color: colors.textTertiary }]}>:00</Text>
          </View>
        </View>

        {/* Day Selector */}
        <View style={[st.card, { backgroundColor: subtleBg, borderColor: cardBorder }]}>
          <Text style={[st.cardLabel, { color: colors.textTertiary, marginBottom: spacing.m }]}>Повторять</Text>
          <View style={st.daysRow}>
            {DAYS.map((day) => {
              const active = selectedDays[day.key];
              return (
                <Pressable
                  key={day.key}
                  onPress={() => toggleDay(day.key)}
                  style={[
                    st.dayBtn,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0'),
                    },
                  ]}
                >
                  <Text
                    style={[
                      st.dayText,
                      { color: active ? '#FFFFFF' : colors.textTertiary },
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ======== Divider ======== */}
        <View style={[st.sectionDivider, { backgroundColor: dividerColor }]} />

        {/* ======== General Preferences ======== */}
        <Text style={[st.groupLabel, { color: colors.textTertiary }]}>Основные настройки</Text>

        <View style={[st.toggleCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Push */}
          <View style={st.toggleRow}>
            <Ionicons name="notifications" size={22} color={colors.textTertiary} />
            <Text style={[st.toggleText, { color: colors.textPrimary }]}>Push-уведомления</Text>
            {pushLoading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Switch
                value={pushStatus?.permission === 'granted' && !!pushStatus?.token}
                onValueChange={handleTogglePush}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
                disabled={pushStatus?.permission === 'denied' || pushStatus?.isSupported === false}
              />
            )}
          </View>
        </View>

        {/* ======== Gamification ======== */}
        <Text style={[st.groupLabel, { color: colors.textTertiary }]}>Геймификация</Text>

        <View style={[st.toggleCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Streak */}
          <View style={st.toggleRow}>
            <Ionicons name="flame" size={22} color={colors.primary} />
            <Text style={[st.toggleText, { color: colors.textPrimary }]}>Напоминания о серии</Text>
            <Switch
              value={streakReminders}
              onValueChange={setStreakReminders}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* ======== Save Button ======== */}
        <Pressable
          style={[st.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={async () => {
            if (!userId || saving) return;
            setSaving(true);
            try {
              const res = await fetch(`${API_BASE}/push?action=settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId,
                  notifEnabled: reminderEnabled,
                  notifHour: hours,
                  notifMinute: 0,
                  notifDays: Object.entries(selectedDays)
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(','),
                  notifStreak: streakReminders,
                }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              navigation.goBack();
            } catch (e) {
              console.error('[NotificationSettings] Save error:', e);
              const msg = 'Не удалось сохранить настройки. Проверьте интернет и попробуйте ещё раз.';
              if (Platform.OS === 'web') window.alert(msg);
              else Alert.alert('Ошибка', msg);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Text style={st.saveBtnText}>{saving ? 'Сохранение...' : 'Сохранить настройки'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.l,
    paddingBottom: spacing.xxl + 40,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.l,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // Card
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.l,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xxs,
  },
  cardHint: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: spacing.m,
  },

  // Time Picker
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.m,
  },
  timeCol: {
    alignItems: 'center',
  },
  timeArrow: {
    padding: spacing.xs,
  },
  timeBox: {
    width: 64,
    height: 76,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 30,
    fontWeight: '800',
  },
  timeSep: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 4,
  },

  // Days
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Divider
  sectionDivider: {
    height: 2,
    borderRadius: 1,
    marginBottom: spacing.l,
  },

  // Group label
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.s,
    paddingHorizontal: spacing.xxs,
  },

  // Toggle card
  toggleCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.l,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: 14,
    paddingHorizontal: spacing.m,
  },
  toggleText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },

  // Save button
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: borderRadius.xl,
    marginTop: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
