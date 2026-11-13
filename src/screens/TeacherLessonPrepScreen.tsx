/**
 * Экран 10 «Перед уроком» (plan/new/teacher_cabinet.md, Teacher 38): готовность группы,
 * «Где группа ошибается», собранная разминка (живой тест по трудным словам) и «Не открывали»
 * с «Напомнить N». Данные — useLessonPrep, правила — services/lessonPrep.ts.
 * Цвета — только токены: экран один на обе темы.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Send, Zap } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { Button, ScreenHeader, confirmDialog, toast } from '@/components/ui';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { Analytics } from '@/services/analytics';
import {
  errorPercent,
  hardCardCaption,
  isHighError,
  prepSubtitle,
  readinessOverline,
  remindLabel,
  warmupCaption,
  type HardCard,
  type PrepReadiness,
} from '@/services/lessonPrep';
import { useLessonPrep } from '@/components/teacher/useLessonPrep';
import { useCourseTitle } from '@/components/teacher/useCourseTitle';
import { pluralize } from '@/utils';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherLessonPrep'>;
type Colors = ReturnType<typeof useThemeColors>;

export function TeacherLessonPrepScreen({ navigation, route }: Props) {
  const { courseId } = route.params;
  // По ссылке из пуша названия курса в параметрах нет — берём из списка курсов
  const courseTitle = useCourseTitle(courseId, route.params.courseTitle);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { data, warmup, nextLesson, loading, refreshing, refresh } = useLessonPrep(courseId);
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);

  useEffect(() => {
    Analytics.teacherLessonPrepViewed();
  }, []);

  const readiness = data?.readiness ?? null;
  const hard = data?.hardCards ?? null;

  const startWarmup = useCallback(() => {
    Analytics.teacherAction('warmup_start', 'course');
    navigation.navigate('ExamLobby', {
      courseId,
      courseTitle,
      cardIds: warmup.map((c) => c.cardId),
      purpose: 'warmup',
    });
  }, [navigation, courseId, courseTitle, warmup]);

  const remind = useCallback(async () => {
    if (!readiness || readiness.notOpenedStudents.length === 0) return;
    const n = readiness.notOpenedStudents.length;
    const ok = await confirmDialog({
      title: `${remindLabel(n)}?`,
      message: `${n} ${pluralize(n, 'ученик получит', 'ученика получат', 'учеников получат')} уведомление с просьбой позаниматься перед уроком`,
      confirmText: 'Напомнить',
    });
    if (!ok) return;
    Analytics.teacherAction('prep_remind', 'course');
    setReminding(true);
    const res = await NeonService.remindStudents(
      courseId,
      readiness.notOpenedStudents.map((s) => s.id)
    );
    setReminding(false);
    if (!res) {
      toast.error('Не получилось напомнить. Проверь интернет');
      return;
    }
    setReminded(true);
    toast.success(
      res.students > 0 ? `Напомнили: ${res.students}` : 'Сегодня этим ученикам уже напоминали'
    );
  }, [readiness, courseId]);

  return (
    <View style={[st.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        center={
          <View>
            <Text variant="h3" numberOfLines={1}>
              {`Урок с группой ${courseTitle}`}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {prepSubtitle(nextLesson?.label ?? null, readiness) || 'Подготовка к уроку'}
            </Text>
          </View>
        }
      />
      {loading && !data ? (
        <View style={st.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[st.content, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
        >
          {readiness && <ReadinessCard colors={colors} readiness={readiness} />}

          <View style={st.section}>
            <Text variant="h3">Где группа ошибается</Text>
            {hard === null ? (
              <Text color="secondary">Не получилось загрузить трудные слова. Потяни вниз</Text>
            ) : hard.length === 0 ? (
              <Text color="secondary">
                Пока мало ответов: трудные слова появятся, когда ученики позанимаются
              </Text>
            ) : (
              <>
                <View
                  style={[st.list, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {hard.map((card, i) => (
                    <HardRow key={card.cardId} colors={colors} card={card} divider={i > 0} />
                  ))}
                </View>
                <Text variant="caption" color="secondary">
                  Доля неверных ответов за 14 дней
                </Text>
              </>
            )}
          </View>

          {warmup.length > 0 ? (
            <View
              style={[
                st.warmup,
                {
                  backgroundColor: alpha(colors.primary, 10),
                  borderColor: alpha(colors.primary, 40),
                },
              ]}
            >
              <View style={st.warmupHead}>
                <View style={[st.warmupIcon, { backgroundColor: colors.primaryFill }]}>
                  <Zap size={iconSize.m} color={colors.onPrimary} />
                </View>
                <View style={st.flex}>
                  <Text variant="body" style={st.bold}>
                    Разминка уже собрана
                  </Text>
                  <Text variant="bodySmall" color="secondary">
                    {warmupCaption(warmup.length)}
                  </Text>
                </View>
              </View>
              <Button title="Запустить живой тест" icon={Play} fullWidth onPress={startWarmup} />
            </View>
          ) : (
            hard !== null &&
            hard.length > 0 && (
              <Text color="secondary">
                Пока мало ответов, разминку соберём, когда ученики позанимаются
              </Text>
            )
          )}

          {readiness && readiness.notOpenedStudents.length > 0 && (
            <View style={st.section}>
              <Text variant="h3">
                {`${readiness.notOpenedCaption} ${readiness.title} · ${readiness.notOpenedStudents.length}`}
              </Text>
              <View style={st.chips}>
                {readiness.notOpenedStudents.map((s) => (
                  <View
                    key={s.id}
                    style={[
                      st.chip,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text variant="bodySmall">{s.name}</Text>
                  </View>
                ))}
              </View>
              <Button
                title={remindLabel(readiness.notOpenedStudents.length)}
                icon={Send}
                variant="secondary"
                fullWidth
                loading={reminding}
                disabled={reminded}
                onPress={remind}
              />
            </View>
          )}

          {!readiness && hard !== null && hard.length === 0 && (
            <Text color="secondary">
              В курсе пока нет наборов со словами — добавь набор или открой юнит учебника
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** «7/22 сдали задание» + полоска готовы / начали / не открывали */
function ReadinessCard({ colors, readiness }: { colors: Colors; readiness: PrepReadiness }) {
  const legend: Array<[string, string, number]> = [
    ['Готовы', colors.success, readiness.ready],
    ['Начали', colors.warning, readiness.started],
    [readiness.notOpenedCaption, colors.textTertiary, readiness.notOpened],
  ];
  return (
    <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="caption" color="secondary" style={st.overline}>
        {readinessOverline(readiness)}
      </Text>
      <View style={st.bigRow}>
        <Text variant="h1">{`${readiness.ready}/${readiness.total}`}</Text>
        <Text color="secondary">{readiness.readyCaption}</Text>
      </View>
      <View
        style={[st.bar, { backgroundColor: colors.surfaceMuted }]}
        accessibilityLabel={`Готовы ${readiness.ready}, начали ${readiness.started}, ${readiness.notOpenedCaption.toLowerCase()} ${readiness.notOpened}`}
      >
        {readiness.ready > 0 && (
          <View style={{ flex: readiness.ready, backgroundColor: colors.success }} />
        )}
        {readiness.started > 0 && (
          <View style={{ flex: readiness.started, backgroundColor: colors.warning }} />
        )}
        {readiness.notOpened > 0 && <View style={{ flex: readiness.notOpened }} />}
      </View>
      <View style={st.legend}>
        {legend.map(([label, color, n]) => (
          <View key={label} style={st.legendItem}>
            <View style={[st.dot, { backgroundColor: color }]} />
            <Text variant="bodySmall" color="secondary">{`${label} ${n}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Слово — перевод, доля ошибок, полоска, «Ünite 1 · ошибались 17 учеников» */
function HardRow({ colors, card, divider }: { colors: Colors; card: HardCard; divider: boolean }) {
  const high = isHighError(card);
  const percent = errorPercent(card);
  return (
    <View
      style={[
        st.hardRow,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}
    >
      <View style={st.hardTop}>
        <Text variant="body" style={st.flex} numberOfLines={2}>
          <Text variant="body" style={st.bold}>
            {card.front}
          </Text>
          <Text variant="body" color="secondary">{` — ${card.back}`}</Text>
        </Text>
        <Text
          variant="bodySmall"
          style={[st.bold, { color: high ? colors.errorText : colors.warningText }]}
        >
          {`${percent}%`}
        </Text>
      </View>
      <View style={[st.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            st.trackFill,
            {
              width: `${Math.min(100, percent)}%`,
              backgroundColor: high ? colors.error : colors.warning,
            },
          ]}
        />
      </View>
      <Text variant="caption" color="secondary">
        {hardCardCaption(card)}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.m, gap: spacing.l },
  section: { gap: spacing.s },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  card: {
    padding: spacing.m,
    gap: spacing.s,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  overline: { fontWeight: '600', letterSpacing: 0.8 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  bar: {
    height: 10,
    borderRadius: borderRadius.s,
    flexDirection: 'row',
    gap: 3,
    overflow: 'hidden',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  list: {
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.m,
  },
  hardRow: { paddingVertical: spacing.s, gap: spacing.xs },
  hardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  track: { height: 6, borderRadius: borderRadius.s, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: borderRadius.s },
  warmup: {
    padding: spacing.m,
    gap: spacing.s,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  warmupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  warmupIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
