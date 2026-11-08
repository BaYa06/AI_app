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
import { MoreVertical, EyeOff, BookOpen, RotateCcw } from 'lucide-react-native';
import type { CardSet } from '@/types';
import { Analytics } from '@/services/analytics';
import { type LessonPlan } from '@/services/LessonService';
import { StaggerCard } from '../StaggerCard';
import { SHORT_MONTHS } from '../setsSort';
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
}: Props) {
  // Статусы слов (plan/new/word_status_colors.md); у набора с сервера нет разбивки — выученные считаем «знаю»
  const learning = set.learningCount || 0;
  const young = set.youngCount ?? (set.masteredCount || 0);
  const mature = set.matureCount ?? 0;
  const fresh = Math.max(0, set.cardCount - learning - young - mature);
  const statusLabel = `учится ${learning}, знаю ${young}, выучено надолго ${mature}, новых ${fresh}`;
  // Цвет набора — лёгким оттенком плитки даты: помогает узнать набор, но не спорит с «N ждут»
  const accentColor = getDeckAccentColor(set.id || index);
  const created = new Date(set.createdAt);
  const waitingCount = reviewStats.waitingBySet[set.id] || 0;
  const cardsLabel = `${set.cardCount} ${pluralize(set.cardCount, 'карточка', 'карточки', 'карточек')}`;
  const showHidden = !!(set.isHiddenFromStudents && set.courseId && isTeacher);
  // Набор, из которого урок дня берёт новые слова (5.2) — связывает список с карточкой урока
  const isFocus = isTeacher !== true && lessonPlan.focusSetId === set.id;
  const hasBadges = isFocus || waitingCount > 0 || !!set.isOfficial || showHidden;

  return (
    <StaggerCard key={set.id} index={index}>
      <SurfaceCard
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
        ]
          .filter(Boolean)
          .join(', ')}
      >
        {/* Строка набора (plan/done/home_redesign.md, 5.1): дата, название, «48 карточек · 62%», бейджи, прогресс */}
        <View style={styles.setCardHeader}>
          <View style={styles.setCardLeft}>
            <View style={[styles.dateIcon, { backgroundColor: alpha(accentColor, 10) }]}>
              <Text variant="caption" style={[styles.dateMonth, { color: colors.textSecondary }]}>
                {SHORT_MONTHS[created.getMonth()]}
              </Text>
              <Text variant="bodyLarge" style={[styles.dateDay, { color: colors.textPrimary }]}>
                {created.getDate()}
              </Text>
            </View>

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
      </SurfaceCard>
    </StaggerCard>
  );
}
