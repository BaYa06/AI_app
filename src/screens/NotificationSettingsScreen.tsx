/**
 * Notification Settings Screen
 * @description Экран настроек уведомлений
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Bell, ChevronDown, ChevronUp, Flame } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius, alpha } from '@/constants';
import { Button, Card, ListGroup, ListRow, Screen, ScreenHeader, Switch, toast } from '@/components/ui';
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

  const handleSave = async () => {
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
      toast.error('Не удалось сохранить настройки. Проверь интернет и попробуй ещё раз');
    } finally {
      setSaving(false);
    }
  };

  const pushOn = pushStatus?.permission === 'granted' && !!pushStatus?.token;

  return (
    <Screen
      header={<ScreenHeader title="Уведомления" onBack={() => navigation.goBack()} bordered />}
      contentStyle={st.content}
    >
      {/* ======== Learning Reminder ======== */}
      <View style={st.sectionHeader}>
        <Text variant="h3" accessibilityRole="header" style={{ color: colors.textPrimary }}>Напоминание об учёбе</Text>
        <Switch value={reminderEnabled} onValueChange={setReminderEnabled} accessibilityLabel="Напоминание об учёбе" />
      </View>

      {/* Time Picker */}
      <Card tone="muted" style={st.card}>
        <Text variant="label" color="secondary">Время ежедневного напоминания</Text>
        <Text variant="caption" color="secondary" style={st.cardHint}>Напоминания приходят с 8:00 до 21:00</Text>
        <View style={st.timeRow}>
          <View style={st.timeCol}>
            <Button
              variant="icon"
              icon={ChevronUp}
              background="none"
              iconColor={colors.textSecondary}
              accessibilityLabel="Позже на час"
              onPress={incrementHours}
            />
            <View
              accessible
              accessibilityLabel={`Время напоминания: ${hours}:00`}
              style={[st.timeBox, { backgroundColor: colors.surface, borderColor: alpha(colors.primary, 20) }]}
            >
              <Text variant="h1" style={{ color: colors.primary }}>{pad(hours)}</Text>
            </View>
            <Button
              variant="icon"
              icon={ChevronDown}
              background="none"
              iconColor={colors.textSecondary}
              accessibilityLabel="Раньше на час"
              onPress={decrementHours}
            />
          </View>

          <Text variant="h1" style={{ color: colors.textTertiary }}>:00</Text>
        </View>
      </Card>

      {/* Day Selector */}
      <Card tone="muted" style={st.card}>
        <Text variant="label" color="secondary" style={st.daysLabel}>Повторять</Text>
        <View style={st.daysRow}>
          {DAYS.map((day) => {
            const active = selectedDays[day.key];
            return (
              <Pressable
                key={day.key}
                onPress={() => toggleDay(day.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={day.label}
                style={[st.dayBtn, { backgroundColor: active ? colors.primaryFill : colors.surfaceVariant }]}
              >
                <Text variant="caption" style={[st.bold, { color: active ? colors.onPrimary : colors.textSecondary }]}>
                  {day.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* ======== General Preferences ======== */}
      <ListGroup title="Основные настройки" style={st.group}>
        <ListRow
          icon={Bell}
          title="Push-уведомления"
          right={
            pushLoading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Switch
                value={pushOn}
                onValueChange={handleTogglePush}
                disabled={pushStatus?.permission === 'denied' || pushStatus?.isSupported === false}
                accessibilityLabel="Push-уведомления"
              />
            )
          }
        />
      </ListGroup>

      {/* ======== Gamification ======== */}
      <ListGroup title="Геймификация" style={st.group}>
        <ListRow
          icon={Flame}
          iconColor={colors.streak}
          title="Напоминания о серии"
          right={<Switch value={streakReminders} onValueChange={setStreakReminders} accessibilityLabel="Напоминания о серии" />}
        />
      </ListGroup>

      {/* ======== Save Button ======== */}
      <Button title={saving ? 'Сохранение...' : 'Сохранить настройки'} onPress={handleSave} disabled={saving} fullWidth />
    </Screen>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.l,
  },
  bold: {
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.m,
  },
  card: {
    marginBottom: spacing.s,
  },
  cardHint: {
    marginTop: spacing.xxs,
    marginBottom: spacing.s,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.m,
  },
  timeCol: {
    alignItems: 'center',
  },
  timeBox: {
    width: 64,
    height: 76,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysLabel: {
    marginBottom: spacing.s,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    marginTop: spacing.l,
    marginBottom: spacing.xs,
  },
});
