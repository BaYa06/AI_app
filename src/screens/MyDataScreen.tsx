/**
 * MyDataScreen — «Профиль → Мои данные» (plan/new/push_notifications.md, 2.7 и «Приватность профиля»)
 * @description Что приложение знает для напоминаний: привычное время и дни (из занятий в приложении),
 * цель, возраст, занятия в центре. Всё можно изменить, выключить или стереть.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Clock, Trash2 } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, Card, ListGroup, ListRow, Screen, ScreenHeader, Switch, confirmDialog, toast } from '@/components/ui';
import { spacing } from '@/constants';
import { NeonService, type AboutMe } from '@/services/NeonService';
import { AboutMeForm, DEFAULT_CLASS_HOUR, WEEK_DAYS, type AboutMeValue } from '@/components/push/AboutMeForm';

const GOAL_LABELS: Record<string, string> = {
  studies: 'Для учёбы',
  courses: 'Для курсов',
  travel: 'Для путешествий',
  self: 'Для себя',
};

function daysLabel(days: string[]): string {
  return WEEK_DAYS.filter((d) => days.includes(d.key)).map((d) => d.label).join(', ');
}

function toFormValue(data: AboutMe): AboutMeValue {
  return {
    ageRange: data.ageRange,
    attendsClasses: data.classDays.length > 0 ? true : null,
    classDays: data.classDays,
    classHour: data.classHour ?? DEFAULT_CLASS_HOUR,
  };
}

export function MyDataScreen({ navigation }: any) {
  const colors = useThemeColors();
  const [data, setData] = useState<AboutMe | null>(null);
  const [form, setForm] = useState<AboutMeValue | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    NeonService.getAboutMe()
      .then((d) => {
        if (!d) return setLoadFailed(true);
        setData(d);
        setForm(toFormValue(d));
      })
      .catch(() => setLoadFailed(true));
  }, []);
  useEffect(load, [load]);

  const handleToggleHabits = useCallback(async (on: boolean) => {
    if (!data) return;
    setData({ ...data, useHabits: on });
    const ok = await NeonService.saveAboutMe({ useHabits: on });
    if (!ok) {
      setData({ ...data });
      toast.error('Не удалось сохранить. Проверь интернет');
    }
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    const classes = form.attendsClasses === true && form.classDays.length > 0;
    const ok = await NeonService.saveAboutMe({
      ageRange: form.ageRange,
      classDays: classes ? form.classDays : [],
      classHour: classes ? form.classHour : null,
    });
    setSaving(false);
    if (ok) {
      toast.success('Сохранено');
      navigation.goBack();
    } else {
      toast.error('Не удалось сохранить. Проверь интернет');
    }
  }, [form, saving, navigation]);

  const handleClearAll = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: 'Стереть мои данные?',
      message: 'Удалим возраст, занятия и привычное время. Напоминания будут приходить во время из настроек уведомлений.',
      confirmText: 'Стереть',
      destructive: true,
    });
    if (!confirmed) return;
    const ok = await NeonService.saveAboutMe({ ageRange: null, classDays: [], classHour: null, clearHabits: true });
    if (ok) {
      toast.success('Данные стёрты');
      load();
    } else {
      toast.error('Не удалось стереть. Проверь интернет');
    }
  }, [load]);

  return (
    <Screen header={<ScreenHeader title="Мои данные" onBack={() => navigation.goBack()} bordered />} contentStyle={st.content}>
      {!data || !form ? (
        loadFailed ? (
          <View style={st.center}>
            <Text variant="body" color="secondary" align="center">Не удалось загрузить данные</Text>
            <Button title="Повторить" variant="secondary" onPress={load} />
          </View>
        ) : (
          <View style={st.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )
      ) : (
        <>
          <Text variant="body" color="secondary">
            Это нужно только для напоминаний: чтобы они приходили вовремя и по делу. Не для рекламы, третьим лицам не передаётся.
          </Text>

          <ListGroup title="Что приложение заметило" style={st.group}>
            <ListRow
              icon={Clock}
              title="Подстраивать напоминания под мои привычки"
              subtitle={
                data.habits.usualTime
                  ? `Обычно учишься около ${data.habits.usualTime}${data.habits.usualDays.length ? ` · ${daysLabel(data.habits.usualDays)}` : ''}`
                  : 'Пока мало занятий, чтобы понять привычное время'
              }
              chevron={false}
              right={<Switch value={data.useHabits} onValueChange={handleToggleHabits} accessibilityLabel="Подстраивать напоминания под привычки" />}
            />
            {data.learningGoal ? (
              <ListRow title="Цель" subtitle={GOAL_LABELS[data.learningGoal] ?? data.learningGoal} chevron={false} />
            ) : null}
          </ListGroup>

          <Card tone="muted" style={st.card}>
            <AboutMeForm value={form} onChange={setForm} />
          </Card>

          <Button title={saving ? 'Сохранение…' : 'Сохранить'} onPress={handleSave} disabled={saving} fullWidth />
          <Button
            title="Стереть мои данные"
            icon={Trash2}
            variant="danger"
            onPress={handleClearAll}
            fullWidth
            style={st.clear}
          />
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.l,
    gap: spacing.m,
  },
  center: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.m,
  },
  group: {
    marginTop: spacing.xs,
  },
  card: {
    marginBottom: spacing.xs,
  },
  clear: {
    marginTop: spacing.xs,
  },
});
