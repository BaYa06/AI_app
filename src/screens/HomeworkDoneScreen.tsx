/**
 * «Задание сдано!» (plan/new/teacher_cabinet.md, Teacher 28; макет У4).
 * Открывается после сессии, которая закрыла задание (useHomeworkDoneRedirect): сервер подтвердил
 * снимок сдачи. Слова, оценка, +20 алмазов (в срок), «учитель увидит», «Ещё путаешь N слов».
 */
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { useHomeworkStore } from '@/store/homeworkStore';
import { Text } from '@/components/common';
import { Button } from '@/components/ui';
import { alpha, borderRadius, spacing } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import type { RootStackParamList } from '@/types/navigation';
import { homeworkDoneTexts } from './studentHomework/homeworkDoneText';

type Props = NativeStackScreenProps<RootStackParamList, 'HomeworkDone'>;

export function HomeworkDoneScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sub = route.params;
  const hw = useHomeworkStore((s) => s.items.find((h) => h.id === sub.homeworkId));
  const t = homeworkDoneTexts(sub, hw);

  useEffect(() => {
    triggerHaptic('success');
  }, []);

  const tiles = [
    t.words ? { value: t.words, label: 'слов', color: colors.textPrimary } : null,
    { value: t.score, label: 'верно', color: colors.successText },
    t.diamonds ? { value: t.diamonds, label: 'алмазов', color: colors.successText } : null,
  ].filter((x): x is { value: string; label: string; color: string } => !!x);

  return (
    <View
      style={[
        st.screen,
        { backgroundColor: colors.background, paddingTop: insets.top + spacing.xxl },
      ]}
    >
      <ScrollView contentContainerStyle={st.content}>
        <View style={[st.halo, { backgroundColor: alpha(colors.success, 10) }]}>
          <View style={[st.circle, { backgroundColor: colors.gameGreen }]}>
            <Check size={44} color={colors.onPrimary} strokeWidth={3} />
          </View>
        </View>
        <View style={st.titles}>
          <Text variant="h1" align="center" accessibilityRole="header">
            {t.title}
          </Text>
          <Text color="secondary" align="center">
            {t.subtitle}
          </Text>
        </View>

        <View style={st.tiles}>
          {tiles.map((x) => (
            <View key={x.label} style={[st.tile, { backgroundColor: colors.surfaceMuted }]}>
              <Text variant="h2" style={{ color: x.color }}>
                {x.value}
              </Text>
              <Text variant="caption" color="secondary">
                {x.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={[st.box, { borderColor: colors.border }]}>
          <Text variant="bodyLarge" style={st.bold}>
            {t.teacher}
          </Text>
          {t.group && (
            <Text variant="bodySmall" color="secondary">
              {t.group}
            </Text>
          )}
        </View>

        {t.hard && (
          <View style={[st.hard, { backgroundColor: alpha(colors.homework, 10) }]}>
            <Text variant="bodySmall" style={[st.bold, { color: colors.homeworkText }]}>
              {t.hard}
            </Text>
          </View>
        )}
      </ScrollView>
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, spacing.m) }]}>
        <Button title="На главную" onPress={() => navigation.popToTop()} fullWidth />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.m, gap: spacing.l, alignItems: 'center' },
  halo: {
    width: 112,
    height: 112,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { gap: spacing.xs, alignItems: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.xs, alignSelf: 'stretch' },
  tile: {
    flex: 1,
    borderRadius: borderRadius.l,
    padding: spacing.s,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  box: {
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.xxs,
  },
  bold: { fontWeight: '600' },
  hard: { alignSelf: 'stretch', borderRadius: borderRadius.l, padding: spacing.m },
  footer: { paddingHorizontal: spacing.m, paddingTop: spacing.s },
});
