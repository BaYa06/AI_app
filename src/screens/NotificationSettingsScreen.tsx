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
  AppState,
  Linking,
  Platform,
} from 'react-native';
import { Bell, BellOff, BookOpen, ChevronDown, ChevronUp, Flame, Trophy, Users } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { spacing, borderRadius, alpha, iconSize } from '@/constants';
import { Button, Card, ListGroup, ListRow, Screen, ScreenHeader, Switch, toast } from '@/components/ui';
import {
  requestPushPermission,
  unsubscribePush,
  getPushStatus,
  type PushStatus,
} from '@/services/pushNotifications';
import { supabase } from '@/services';
import { API_BASE } from '@/config/apiBase';
import { Analytics } from '@/services/analytics';

/** «Что присылать» (plan/push_notifications.md, 2.4) — ключи как SETTING_GROUPS в api/push/_decide.js */
type PushGroup = 'lesson' | 'streak' | 'course' | 'rating';
const PUSH_GROUPS: { key: PushGroup; title: string; hint: string }[] = [
  { key: 'lesson', title: 'Урок дня', hint: 'Слова ждут повторения, напоминание вернуться' },
  { key: 'streak', title: 'Серия', hint: 'Серия под угрозой' },
  { key: 'course', title: 'Курс и учитель', hint: 'Учитель просит повторить' },
  { key: 'rating', title: 'Рейтинг', hint: 'Место в рейтинге курса, итоги недели' },
];
const PUSH_GROUP_ICONS = { lesson: BookOpen, streak: Flame, course: Users, rating: Trophy } as const;

// Сервер проверяет напоминания каждые 15 минут и шлёт их только с 8:00 до 21:45 (api/push.js, cron-reminders)
const MIN_HOUR = 8;
const MAX_HOUR = 21;
const MINUTE_STEP = 15;
const clampHour = (h: number) => Math.min(MAX_HOUR, Math.max(MIN_HOUR, h));
const clampMinute = (m: number) => Math.min(60 - MINUTE_STEP, Math.max(0, Math.floor(m / MINUTE_STEP) * MINUTE_STEP));

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
  const [minutes, setMinutes] = useState(0);
  // По умолчанию все дни; фильтр по дням сервер применяет, только если их выбрали здесь (Push 0.6)
  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
  });
  // Выключенные переключатели; loadedOff — как было при открытии, чтобы отметить новые выключения в аналитике
  const [groupsOff, setGroupsOff] = useState<PushGroup[]>([]);
  const [loadedOff, setLoadedOff] = useState<PushGroup[]>([]);

  // Push notifications (real)
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Вернулся из настроек iPhone — разрешение могло поменяться (plan/push_notifications.md, 1.3)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') getPushStatus().then(setPushStatus);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    getPushStatus().then(setPushStatus);
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      const token = data.session?.access_token;
      setUserId(uid);
      if (uid && token) {
        fetch(`${API_BASE}/push?action=settings`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            setReminderEnabled(d.notifEnabled ?? true);
            setHours(clampHour(d.notifHour ?? 19));
            setMinutes(clampMinute(d.notifMinute ?? 0));
            const off: PushGroup[] = Array.isArray(d.notifCategoriesOff)
              ? d.notifCategoriesOff
              : d.notifStreak === false ? ['streak'] : [];
            setGroupsOff(off);
            setLoadedOff(off);
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
  const incrementMinutes = () => setMinutes((m) => (m + MINUTE_STEP) % 60);
  const decrementMinutes = () => setMinutes((m) => (m - MINUTE_STEP + 60) % 60);

  const pad = (n: number) => String(n).padStart(2, '0');

  const handleSave = async () => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('No session');
      const res = await fetch(`${API_BASE}/push?action=settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notifEnabled: reminderEnabled,
          notifHour: hours,
          notifMinute: minutes,
          notifDays: DAYS.filter((day) => selectedDays[day.key])
            .map((day) => day.key)
            .join(','),
          notifDaysExplicit: true,
          notifStreak: !groupsOff.includes('streak'),
          notifCategoriesOff: groupsOff,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const group of groupsOff) if (!loadedOff.includes(group)) Analytics.pushCategoryDisabled(group);
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
        <Text variant="caption" color="secondary" style={st.cardHint}>Напоминания приходят с 8:00 до 21:45</Text>
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
              accessibilityLabel={`Час напоминания: ${hours}`}
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

          <Text variant="h1" style={{ color: colors.textTertiary }}>:</Text>

          <View style={st.timeCol}>
            <Button
              variant="icon"
              icon={ChevronUp}
              background="none"
              iconColor={colors.textSecondary}
              accessibilityLabel="Позже на 15 минут"
              onPress={incrementMinutes}
            />
            <View
              accessible
              accessibilityLabel={`Минуты напоминания: ${pad(minutes)}`}
              style={[st.timeBox, { backgroundColor: colors.surface, borderColor: alpha(colors.primary, 20) }]}
            >
              <Text variant="h1" style={{ color: colors.primary }}>{pad(minutes)}</Text>
            </View>
            <Button
              variant="icon"
              icon={ChevronDown}
              background="none"
              iconColor={colors.textSecondary}
              accessibilityLabel="Раньше на 15 минут"
              onPress={decrementMinutes}
            />
          </View>
        </View>
      </Card>

      {/* Day Selector */}
      <Card tone="muted" style={st.card}>
        <Text variant="label" color="secondary" style={st.daysLabel}>Повторять</Text>
        <View style={st.daysRow}>
          {DAYS.map((day) => {
            const active = selectedDays[day.key];
            return (
              <Pressable hitSlop={spacing.xxs}
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

      {/* Отказал в iOS: второй раз системный диалог не появится — включить можно только в настройках iPhone */}
      {Platform.OS !== 'web' && pushStatus?.permission === 'denied' && (
        <Card style={st.deniedCard}>
          <View style={st.deniedHeader}>
            <BellOff size={iconSize.s} color={colors.textSecondary} />
            <View style={st.deniedText}>
              <Text variant="body" style={[st.bold, { color: colors.textPrimary }]}>Уведомления выключены в настройках iPhone</Text>
              <Text variant="bodySmall" color="secondary">
                Пока они выключены, напоминания не придут. Открой настройки и включи «Разрешить уведомления».
              </Text>
            </View>
          </View>
          <Button title="Открыть настройки iPhone" variant="secondary" size="s" onPress={() => Linking.openSettings().catch(() => {})} />
        </Card>
      )}

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

      {/* ======== Что присылать (2.4) ======== */}
      <ListGroup title="Что присылать" style={st.group}>
        {PUSH_GROUPS.map((group) => (
          <ListRow
            key={group.key}
            icon={PUSH_GROUP_ICONS[group.key]}
            iconColor={group.key === 'streak' ? colors.streak : undefined}
            title={group.title}
            subtitle={group.hint}
            right={
              <Switch
                value={!groupsOff.includes(group.key)}
                onValueChange={(on) => setGroupsOff((prev) => (on ? prev.filter((g) => g !== group.key) : [...prev, group.key]))}
                accessibilityLabel={group.title}
              />
            }
          />
        ))}
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
  deniedCard: {
    marginTop: spacing.l,
    gap: spacing.m,
  },
  deniedHeader: {
    flexDirection: 'row',
    gap: spacing.m,
    alignItems: 'flex-start',
  },
  deniedText: {
    flex: 1,
    gap: spacing.xxs,
  },
  group: {
    marginTop: spacing.l,
    marginBottom: spacing.xs,
  },
});
