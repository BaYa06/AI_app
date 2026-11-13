/**
 * Строка набора на главной: дата, название, бейджи, прогресс по статусам слов
 * (Clean 8a — тело колбэка visibleSets.map из HomeScreen без изменений).
 */
import React from 'react';
import { View } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha, getDeckAccentColor } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { pluralize } from '@/utils';
import { Button, Card as SurfaceCard, Badge, SegmentedProgressBar } from '@/components/ui';
import {
  MoreVertical,
  EyeOff,
  BookOpen,
  RotateCcw,
  Clock,
  ClipboardCheck,
} from 'lucide-react-native';
import { formatDue } from '@/services/homework';
import type { CardSet } from '@/types';
import { SET_ORIGIN_LABEL, setOriginIcon } from '@/utils/setOrigin';
import { Analytics } from '@/services/analytics';
import { type LessonPlan } from '@/services/LessonService';
import { StaggerCard } from '../StaggerCard';
import { SetOriginTile } from './SetOriginTile';
import { styles } from '../styles';

type Props = {
  set: CardSet;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
  isTeacher: boolean | null;
  lessonPlan: Pick<LessonPlan, 'focusSetId'>;
  reviewStats: { waitingBySet: Record<string, number> };
  setSetMenuTarget: React.Dispatch<React.SetStateAction<CardSet | null>>;
  navigation: any;
  /**
   * Учитель в своём курсе (plan/new/teacher_cabinet.md, Teacher 5): прогресс группы вместо личного —
   * сколько учеников прошли все карточки, начали и не открывали. null/нет — личная полоска, как раньше.
   */
  groupProgress?: { total: number; started: number; completed: number } | null;
  /** Набор в задании учителя (Teacher 26): янтарная рамка, бейдж «Задание» и «до: …» под карточкой */
  homeworkDue?: string | null;
};

export function SetListItem({
  set,
  index,
  colors,
  isTeacher,
  lessonPlan,
  reviewStats,
  setSetMenuTarget,
  navigation,
  groupProgress,
  homeworkDue = null,
}: Props) {
  // Статусы слов (plan/new/word_status_colors.md); у набора с сервера нет разбивки — выученные считаем «знаю»
  const learning = set.learningCount || 0;
  const young = set.youngCount ?? (set.masteredCount || 0);
  const mature = set.matureCount ?? 0;
  const fresh = Math.max(0, set.cardCount - learning - young - mature);
  const statusLabel = groupProgress
    ? groupProgressLabel(groupProgress)
    : `учится ${learning}, знаю ${young}, выучено надолго ${mature}, новых ${fresh}`;
  // Цвет набора — лёгким оттенком плитки значка: помогает узнать набор, но не спорит с «N ждут»
  const accentColor = getDeckAccentColor(set.id || index);
  const waitingCount = reviewStats.waitingBySet[set.id] || 0;
  const cardsLabel = `${set.cardCount} ${pluralize(set.cardCount, 'карточка', 'карточки', 'карточек')}`;
  const showHidden = !!(set.isHiddenFromStudents && set.courseId && isTeacher);
  // Набор, из которого урок дня берёт новые слова (5.2) — связывает список с карточкой урока
  const isFocus = isTeacher !== true && lessonPlan.focusSetId === set.id;
  const hasBadges = !!homeworkDue || isFocus || waitingCount > 0 || !!set.isOfficial || showHidden;

  return (
    <StaggerCard key={set.id} index={index}>
      <SurfaceCard
        style={
          homeworkDue
            ? {
                borderWidth: 2,
                borderColor: colors.homework,
                backgroundColor: alpha(colors.homework, 10),
              }
            : undefined
        }
        onPress={() => {
          triggerHaptic('selection');
          Analytics.homeAction('set');
          navigation?.navigate('SetDetail', { setId: set.id });
        }}
        accessibilityLabel={[
          set.title,
          cardsLabel,
          statusLabel,
          waitingCount > 0 ? `${waitingCount} ждут повторения` : null,
          isFocus ? 'сейчас учишь' : null,
          homeworkDue ? `задание до ${formatDue(homeworkDue)}` : null,
          SET_ORIGIN_LABEL[setOriginIcon(set)],
        ]
          .filter(Boolean)
          .join(', ')}
      >
        {/* Строка набора (plan/done/home_redesign.md, 5.1): значок происхождения (Teacher 31), название, «48 карточек · 62%», бейджи, прогресс */}
        <View style={styles.setCardHeader}>
          <View style={styles.setCardLeft}>
            <SetOriginTile set={set} accentColor={accentColor} />

            <View style={styles.flex1}>
              <Text
                variant="body"
                style={[styles.setTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {set.title}
              </Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {cardsLabel}
              </Text>
              {hasBadges && (
                <View style={styles.setBadges}>
                  {homeworkDue && <Badge label="Задание" tone="warning" icon={ClipboardCheck} />}
                  {isFocus && <Badge label="Сейчас учишь" tone="primary" />}
                  {/* «N ждут» — единственный цветной сигнал строки: здесь есть дело */}
                  {waitingCount > 0 && (
                    <Badge label={`${waitingCount} ждут`} tone="warning" icon={RotateCcw} />
                  )}
                  {set.isOfficial && <Badge label="По учебнику" tone="neutral" icon={BookOpen} />}
                  {showHidden && <Badge label="Скрыто" tone="neutral" icon={EyeOff} />}
                </View>
              )}
            </View>
          </View>

          <Button
            variant="icon"
            icon={MoreVertical}
            background="none"
            iconSize={iconSize.s}
            iconColor={colors.textSecondary}
            accessibilityLabel={`Действия с набором «${set.title}»`}
            onPress={(e) => {
              e.stopPropagation();
              // Юнит учебника нельзя редактировать/скрывать — открываем сам набор
              // (там у учителя есть «Сделать копию себе»).
              if (set.isOfficial) {
                navigation?.navigate('SetDetail', { setId: set.id });
              } else if (set.courseId && isTeacher) {
                setSetMenuTarget(set);
              } else {
                navigation?.navigate('SetEditor', {
                  setId: set.id,
                  autoFocusTitle: true,
                });
              }
            }}
          />
        </View>

        {groupProgress ? (
          <GroupProgress progress={groupProgress} colors={colors} />
        ) : (
          <>
            <SegmentedProgressBar
              total={set.cardCount}
              segments={[
                { value: mature, color: colors.statusMature },
                { value: young, color: colors.statusYoung },
                { value: learning, color: colors.statusLearning },
              ]}
              style={styles.setProgress}
            />
            <View
              style={styles.setStatusCounts}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              {[
                { n: mature, color: colors.statusMature },
                { n: young, color: colors.statusYoung },
                { n: learning, color: colors.statusLearning },
                { n: fresh, color: colors.surfaceMuted },
              ].map(({ n, color }, i) => (
                <View key={i} style={styles.setStatusCount}>
                  <View
                    style={[
                      styles.setStatusDot,
                      { backgroundColor: color },
                      i === 3 && { borderWidth: 1, borderColor: colors.border },
                    ]}
                  />
                  <Text variant="caption" style={[styles.tabular, { color: colors.textSecondary }]}>
                    {n}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
        {homeworkDue && (
          <View style={[styles.setHomeworkDue, { borderTopColor: alpha(colors.homework, 40) }]}>
            <Clock size={iconSize.xs} color={colors.homeworkText} />
            <Text variant="caption" style={{ color: colors.homeworkText, fontWeight: '600' }}>
              {`до: ${formatDue(homeworkDue)}`}
            </Text>
          </View>
        )}
      </SurfaceCard>
    </StaggerCard>
  );
}

/** «прошли 8 из 22, начали 7, не открывали 7» */
function groupProgressLabel(p: { total: number; started: number; completed: number }) {
  const started = Math.max(0, p.started - p.completed);
  const none = Math.max(0, p.total - p.started);
  return `прошли ${p.completed} из ${p.total}, начали ${started}, не открывали ${none}`;
}

/** Прогресс группы по набору: прошли все карточки / начали / не открывали */
function GroupProgress({
  progress,
  colors,
}: {
  progress: { total: number; started: number; completed: number };
  colors: ReturnType<typeof useThemeColors>;
}) {
  const started = Math.max(0, progress.started - progress.completed);
  const none = Math.max(0, progress.total - progress.started);
  return (
    <>
      <SegmentedProgressBar
        total={progress.total}
        segments={[
          { value: progress.completed, color: colors.success },
          { value: started, color: colors.warning },
        ]}
        style={styles.setProgress}
      />
      <View
        style={styles.setStatusCounts}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {[
          { n: progress.completed, label: 'прошли', color: colors.success },
          { n: started, label: 'начали', color: colors.warning },
          { n: none, label: 'не открывали', color: colors.surfaceMuted },
        ].map(({ n, label, color }, i) => (
          <View key={label} style={styles.setStatusCount}>
            <View
              style={[
                styles.setStatusDot,
                { backgroundColor: color },
                i === 2 && { borderWidth: 1, borderColor: colors.border },
              ]}
            />
            <Text variant="caption" style={[styles.tabular, { color: colors.textSecondary }]}>
              {`${label} ${n}`}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}
