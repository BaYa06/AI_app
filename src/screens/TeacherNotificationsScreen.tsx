/**
 * Список уведомлений учителя — «колокольчик» (plan/new/teacher_cabinet.md, Teacher 49; макет 15):
 * напоминания об уроках, итоги недели, ученики и задания за 30 дней, в том числе те, что не ушли
 * пушем. Тап — на экран записи. Открытие списка отмечает записи просмотренными.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Zap } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, ScreenHeader } from '@/components/ui';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { TEACHER_INSIGHTS_ENABLED, TEACHER_LESSON_PREP_ENABLED } from '@/config/features';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import {
  NOTIFICATIONS_EMPTY,
  notificationTime,
  teacherLinkTarget,
  type TeacherNotification,
} from '@/services/teacherNotifications';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherNotifications'>;

export function TeacherNotificationsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<TeacherNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await NeonService.loadTeacherNotifications();
    if (!res) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems(res.notifications);
    // Список открыт — записи просмотрены (точка на колокольчике гаснет)
    if (res.unseen > 0) NeonService.markTeacherNotificationsSeen().catch(() => {});
  }, []);

  useEffect(() => {
    Analytics.teacherAction('notifications', 'home');
    load();
  }, [load]);

  const open = (n: TeacherNotification) => {
    const target = teacherLinkTarget(n.link, {
      lessonPrep: TEACHER_LESSON_PREP_ENABLED,
      insights: TEACHER_INSIGHTS_ENABLED,
    });
    if (!target || target.screen === 'TeacherNotifications') return;
    // Параметры экрана из ссылки неполные (нет названия курса) — экраны достают его сами
    const go = navigation.navigate as unknown as (screen: string, params?: object) => void;
    go(target.screen, target.params);
  };

  return (
    <View style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader title="Уведомления" onBack={() => navigation.goBack()} />
      {items === null ? (
        <View style={st.center}>
          {failed ? (
            <>
              <Text color="secondary">Не получилось загрузить уведомления</Text>
              <Button title="Повторить" variant="secondary" onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[st.content, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
        >
          {items.length === 0 ? (
            <View style={st.empty}>
              <View style={[st.emptyIcon, { backgroundColor: colors.surfaceMuted }]}>
                <Bell size={iconSize.l} color={colors.textSecondary} />
              </View>
              <Text color="secondary" style={st.emptyText}>
                {NOTIFICATIONS_EMPTY}
              </Text>
            </View>
          ) : (
            items.map((n) => (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}. ${n.body}`}
                onPress={() => open(n)}
                style={({ pressed }) => [
                  st.row,
                  {
                    backgroundColor: n.seen ? colors.surface : alpha(colors.primary, 10),
                    borderColor: n.seen ? colors.border : alpha(colors.primary, 40),
                  },
                  pressed && st.pressed,
                ]}
              >
                <View style={[st.icon, { backgroundColor: colors.primaryFill }]}>
                  <Zap size={iconSize.s} color={colors.onPrimary} />
                </View>
                <View style={st.flex}>
                  <View style={st.rowTop}>
                    <Text variant="bodySmall" style={[st.flex, st.bold]}>
                      {n.title}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {notificationTime(n.createdAt)}
                    </Text>
                  </View>
                  {n.body ? (
                    <Text variant="bodySmall" color="secondary">
                      {n.body}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m },
  content: { padding: spacing.m, gap: spacing.s },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '600' },
  row: {
    flexDirection: 'row',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  icon: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  empty: { alignItems: 'center', gap: spacing.m, paddingTop: spacing.xxl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { textAlign: 'center' },
});
