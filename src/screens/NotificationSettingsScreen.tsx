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
  TextInput,
  Platform,
  ActivityIndicator,
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
  const [minutes, setMinutes] = useState(0);
  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
  });
  const [customMessage, setCustomMessage] = useState('Время учиться!');
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [streakReminders, setStreakReminders] = useState(true);
  const [achievementAlerts, setAchievementAlerts] = useState(true);

  // Push notifications (real)
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();

  useEffect(() => {
    getPushStatus().then(setPushStatus);
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id);
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

  const incrementHours = () => setHours((h) => (h + 1) % 24);
  const decrementHours = () => setHours((h) => (h - 1 + 24) % 24);
  const incrementMinutes = () => setMinutes((m) => (m + 5) % 60);
  const decrementMinutes = () => setMinutes((m) => (m - 5 + 60) % 60);

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

            <Text style={[st.timeSep, { color: colors.textTertiary }]}>:</Text>

            <View style={st.timeCol}>
              <Pressable onPress={incrementMinutes} style={st.timeArrow}>
                <Ionicons name="chevron-up" size={24} color={colors.textTertiary} />
              </Pressable>
              <View style={[st.timeBox, { backgroundColor: cardBg, borderColor: colors.primary + '30' }]}>
                <Text style={[st.timeText, { color: colors.primary }]}>{pad(minutes)}</Text>
              </View>
              <Pressable onPress={decrementMinutes} style={st.timeArrow}>
                <Ionicons name="chevron-down" size={24} color={colors.textTertiary} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Day Selector */}
        <View style={[st.card, { backgroundColor: subtleBg, borderColor: cardBorder }]}>
          <Text style={[st.cardLabel, { color: colors.textTertiary }]}>Повторять</Text>
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

        {/* Custom Message */}
        <View style={st.inputSection}>
          <Text style={[st.cardLabel, { color: colors.textTertiary }]}>Текст напоминания</Text>
          <View style={[st.inputWrap, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <TextInput
              style={[st.input, { color: colors.textPrimary }, Platform.OS === 'web' && { outlineStyle: 'none' as any }]}
              value={customMessage}
              onChangeText={setCustomMessage}
              placeholder="Введите текст..."
              placeholderTextColor={colors.textTertiary}
            />
            <Ionicons name="create-outline" size={18} color={colors.textTertiary} />
          </View>
        </View>

        {/* Sound Picker */}
        <Pressable style={[st.soundCard, { backgroundColor: subtleBg, borderColor: cardBorder }]}>
          <View style={[st.soundIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="musical-note" size={20} color={colors.primary} />
          </View>
          <View style={st.soundInfo}>
            <Text style={[st.soundTitle, { color: colors.textPrimary }]}>Звук уведомления</Text>
            <Text style={[st.soundValue, { color: colors.textTertiary }]}>Aurora (по умолч.)</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary + '60'} />
        </Pressable>

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

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          {/* Email */}
          <View style={st.toggleRow}>
            <Ionicons name="mail-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.toggleText, { color: colors.textPrimary }]}>Email-уведомления</Text>
            <Switch
              value={emailNotifications}
              onValueChange={setEmailNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
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

          <View style={[st.divider, { backgroundColor: dividerColor }]} />

          {/* Achievement */}
          <View style={st.toggleRow}>
            <Ionicons name="trophy-outline" size={22} color={colors.textTertiary} />
            <Text style={[st.toggleText, { color: colors.textPrimary }]}>Оповещения о наградах</Text>
            <Switch
              value={achievementAlerts}
              onValueChange={setAchievementAlerts}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* ======== Save Button ======== */}
        <Pressable
          style={[st.saveBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={st.saveBtnText}>Сохранить настройки</Text>
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

  // Input
  inputSection: {
    marginBottom: spacing.m,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    height: 52,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    height: '100%',
  },

  // Sound
  soundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.s,
    marginBottom: spacing.l,
  },
  soundIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundInfo: {
    flex: 1,
    gap: 2,
  },
  soundTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  soundValue: {
    fontSize: 12,
    fontWeight: '500',
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
  divider: {
    height: 1,
    marginHorizontal: spacing.m,
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
