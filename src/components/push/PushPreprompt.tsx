/**
 * PushPreprompt — «Напомнить завтра повторить эти слова?» (plan/push_notifications.md, шаг 1.2)
 * @description Свой лист на итогах урока перед системным диалогом iOS: тот бывает один раз,
 * и спрашивать его стоит, когда человек понял, зачем напоминание. Время выбирают сразу —
 * после согласия оно сохраняется на сервере. Когда показывать — services/pushPrompt.ts.
 */
import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Chip, Sheet, toast } from '@/components/ui';
import { spacing, borderRadius, alpha, iconSize } from '@/constants';
import { pluralize } from '@/utils';
import { Analytics } from '@/services/analytics';
import { requestPushPermission } from '@/services/pushNotifications';
import { supabase } from '@/services/supabaseClient';
import { REMINDER_SLOTS, saveReminderHour, suggestedSlot, type ReminderSlot } from '@/services/pushPrompt';

/** Чем закончился лист: custom — человек хочет своё время, открыть настройки уведомлений */
export type PushPrepromptResult = 'granted' | 'custom' | 'denied' | 'later';

interface Props {
  visible: boolean;
  /** Сколько слов было в уроке — их и напомним повторить */
  wordCount: number;
  onClose: (result: PushPrepromptResult) => void;
}

export function PushPreprompt({ visible, wordCount, onClose }: Props) {
  const colors = useThemeColors();
  const [slot, setSlot] = useState<ReminderSlot | 'custom'>(() => suggestedSlot(new Date().getHours()));
  const [loading, setLoading] = useState(false);

  const title = wordCount > 1
    ? `Напомнить завтра повторить эти ${wordCount} ${pluralize(wordCount, 'слово', 'слова', 'слов')}?`
    : 'Напомнить завтра про урок?';

  const handleLater = useCallback(() => {
    if (loading) return;
    Analytics.pushPrepromptLater();
    onClose('later');
  }, [loading, onClose]);

  const handleAccept = useCallback(async () => {
    if (loading) return;
    const hour = REMINDER_SLOTS.find((s) => s.key === slot)?.hour;
    Analytics.pushPrepromptAccepted(hour ?? 'custom');
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const status = await requestPushPermission(data.session?.user?.id ?? null);
      if (status.permission !== 'granted') {
        Analytics.pushPermissionDenied();
        onClose('denied');
        return;
      }
      Analytics.pushPermissionGranted();
      if (hour === undefined) {
        onClose('custom');
        return;
      }
      const saved = await saveReminderHour(hour);
      if (saved) toast.success(`Напомним завтра в ${hour}:00`);
      else toast.error('Время не сохранилось. Выбери его в настройках уведомлений');
      onClose('granted');
    } finally {
      setLoading(false);
    }
  }, [loading, slot, onClose]);

  return (
    <Sheet visible={visible} onClose={handleLater} scroll={false}>
      <View style={st.body}>
        <View style={[st.iconCircle, { backgroundColor: alpha(colors.primary, 10) }]}>
          <Bell size={iconSize.l} color={colors.primary} />
        </View>
        <Text variant="h3" align="center" accessibilityRole="header" style={{ color: colors.textPrimary }}>
          {title}
        </Text>
        <Text variant="body" align="center" color="secondary" style={st.subtitle}>
          Повторение на следующий день помогает словам запомниться. Одно напоминание в день.
        </Text>

        <Text variant="label" color="secondary" style={st.slotsLabel}>Когда напомнить</Text>
        <View style={st.slots}>
          {REMINDER_SLOTS.map((s) => (
            <Chip
              key={s.key}
              label={`${s.label} · ${s.hour}:00`}
              selected={slot === s.key}
              onPress={() => setSlot(s.key)}
            />
          ))}
          <Chip label="Своё время" selected={slot === 'custom'} onPress={() => setSlot('custom')} />
        </View>

        <View style={st.actions}>
          <Button title={loading ? 'Включаем…' : 'Напомнить'} icon={Bell} onPress={handleAccept} disabled={loading} fullWidth />
          <Button title="Не сейчас" variant="quiet" tone="secondary" onPress={handleLater} disabled={loading} fullWidth />
        </View>
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  body: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.l,
  },
  slotsLabel: {
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  slots: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.l,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
});
