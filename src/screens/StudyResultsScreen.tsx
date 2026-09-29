/**
 * Study Results Screen
 * @description Экран результатов тренировки после завершения изучения карточек
 */
import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useThemeColors } from '@/store';
import { Text, StreakCelebrationModal } from '@/components/common';
import { Analytics } from '@/services/analytics';
import { recordSessionForRatingPrompt, markRatingPromptShown } from '@/services/feedback';
import { RatingPromptModal } from '@/components/RatingPromptModal';
import { spacing, borderRadius, heights, iconSize, screenPadding, alpha } from '@/constants';
import { pluralize } from '@/utils';
import { Badge, Button, Card, ScreenHeader, Sheet, useScreenBottomInset } from '@/components/ui';
import type { RootStackScreenProps } from '@/types/navigation';
import { Settings, CheckCircle2, List, ArrowRight, RotateCcw, BookOpen, X } from 'lucide-react-native';

type Props = RootStackScreenProps<'StudyResults'>;

export function StudyResultsScreen({ navigation, route }: Props) {
  const {
    setId,
    totalCards,
    learnedCards,
    timeSpent,
    errors,
    errorCards,
    modeTitle = 'Карточки',
    cardLimit,
    dueCardIds,
    phaseId,
    totalPhaseCards = 0,
    studiedInPhase = 0,
    phaseOffset = 0,
    phaseFailedIds = [],
    onlyHard,
    streakIncreased,
    newStreakCount,
  } = route.params;
  const colors = useThemeColors();
  const bottomInset = useScreenBottomInset();
  const [showErrorsModal, setShowErrorsModal] = React.useState(false);
  const [showStreakModal, setShowStreakModal] = React.useState(streakIncreased === true);
  const [showRatingPrompt, setShowRatingPrompt] = React.useState(false);

  // Окно оценки — только в хороший момент (правила в services/feedback.ts). Когда показываем
  // празднование серии, второе окно подряд не открываем — спросим в другой раз.
  React.useEffect(() => {
    const goodMoment = recordSessionForRatingPrompt({ totalCards, errors });
    if (!goodMoment || streakIncreased) return;
    const timer = setTimeout(() => {
      markRatingPromptShown();
      setShowRatingPrompt(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Логика фаз: проверяем завершена ли фаза
  // Фаза завершена только если все карточки просмотрены (phaseOffset >= totalPhaseCards) И нет ошибок
  const allCardsViewed = phaseOffset >= totalPhaseCards;
  const hasFailedCards = phaseFailedIds && phaseFailedIds.length > 0;
  const isPhaseComplete = phaseId && totalPhaseCards > 0 && allCardsViewed && !hasFailedCards;
  
  // Осталось = карточки которые еще не просмотрены + ошибочные карточки
  const remainingNewCards = phaseId && totalPhaseCards > 0 ? Math.max(0, totalPhaseCards - phaseOffset) : 0;
  const remainingFailedCards = phaseFailedIds?.length || 0;
  const remainingInPhase = remainingNewCards + remainingFailedCards;
  
  // Analytics: study_session_complete
  React.useEffect(() => {
    const modeMap: Record<string, 'flashcard' | 'quiz' | 'match'> = {
      'Карточки': 'flashcard',
      'Тест': 'quiz',
      'Пары': 'match',
    };
    Analytics.studySessionComplete({
      setId,
      mode: modeMap[modeTitle] ?? 'flashcard',
      cardCount: totalCards,
      correctAnswers: learnedCards,
      timeSpentSec: timeSpent,
      phaseComplete: Boolean(isPhaseComplete),
    });
  }, []);

  // Debug info
  console.log('[StudyResults] Параметры фазы:', {
    phaseId,
    totalPhaseCards,
    phaseOffset,
    studiedInPhase,
    phaseFailedIds,
    remainingNewCards,
    remainingFailedCards,
    remainingInPhase,
    isPhaseComplete,
    allCardsViewed,
    hasFailedCards
  });

  // Логика кнопки: если фаза завершена - "Закончить", иначе - "Следующие карточки (N осталось)"
  const primaryButtonLabel = isPhaseComplete 
    ? 'Закончить' 
    : remainingInPhase > 0 
      ? `Следующие карточки (${remainingInPhase} ${remainingInPhase === 1 ? 'осталась' : remainingInPhase < 5 ? 'осталось' : 'осталось'})`
      : 'Следующие карточки';

  // Форматирование времени (в минуты:секунды)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBack = () => {
    navigation.navigate('Main', { screen: 'Home' });
  };

  const handleSettings = () => {
    navigation.navigate('Settings');
  };

  const handleViewDetails = () => {
    if (errorCards.length > 0) {
      setShowErrorsModal(true);
    }
  };

  const handleNextCards = () => {
    console.log('[StudyResults] handleNextCards вызван:', {
      isPhaseComplete,
      phaseId,
      totalPhaseCards,
      studiedInPhase,
      phaseOffset,
      phaseFailedIds,
      remainingInPhase
    });
    
    // Если фаза завершена — возвращаем к набору или на главную (если запущено из HomeScreen)
    if (isPhaseComplete) {
      if (dueCardIds && dueCardIds.length > 0) {
        navigation.navigate('Main', { screen: 'Home' });
      } else {
        navigation.navigate('SetDetail', { setId });
      }
      return;
    }

    // Продолжаем фазу - запускаем следующую порцию
    if (route.params.nextMode === 'match') {
      navigation.push('Match', {
        setId,
        cardLimit,
        dueCardIds,
        phaseId,
        totalPhaseCards,
        studiedInPhase,
        phaseOffset,
        phaseFailedIds,
      });
      return;
    }

    if (route.params.nextMode === 'audio') {
      navigation.push('AudioLearning', {
        setId,
        cardLimit,
        dueCardIds,
        phaseId,
        totalPhaseCards,
        studiedInPhase,
        phaseOffset,
        phaseFailedIds,
      });
      return;
    }

    if (route.params.nextMode === 'wordBuilder') {
      navigation.push('WordBuilder', {
        setId,
        cardLimit,
        dueCardIds,
        phaseId,
        totalPhaseCards,
        studiedInPhase,
        phaseOffset,
        phaseFailedIds,
      });
      return;
    }

    if (route.params.nextMode === 'multipleChoice') {
      navigation.push('MultipleChoice', {
        setId,
        cardLimit,
        dueCardIds,
        phaseId,
        totalPhaseCards,
        studiedInPhase,
        phaseOffset,
        phaseFailedIds,
      });
      return;
    }

    navigation.push('Study', {
      setId,
      mode: 'classic',
      studyAll: true,
      onlyHard,
      cardLimit,
      dueCardIds,
      phaseId,
      totalPhaseCards,
      studiedInPhase,
      phaseOffset,
      phaseFailedIds,
    });
  };

  const handleReviewMistakes = () => {
    // Передаем front текст ошибочных карточек для повторения
    const errorFronts = errorCards.map(card => card.front);
    // Продолжаем ту же фазу, не сбрасывая прогресс
    navigation.push('Study', {
      setId,
      mode: 'classic',
      errorCardsFronts: errorFronts,
      dueCardIds,
      phaseId,
      totalPhaseCards,
      studiedInPhase,
      phaseOffset,
      phaseFailedIds,
      cardLimit,
      studyAll: true,
      onlyHard: true,
    });
  };

  const handleReviewWords = () => {
    navigation.push('Study', { setId, mode: 'classic', studyAll: true });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={modeTitle}
        onBack={handleBack}
        right={<Button variant="icon" icon={Settings} accessibilityLabel="Настройки" onPress={handleSettings} />}
      />

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={[styles.medallion, { backgroundColor: colors.primaryFill, borderColor: alpha(colors.primary, 20) }]}>
            <CheckCircle2 size={iconSize.xl} color={colors.onPrimary} strokeWidth={3} />
          </View>

          <Text variant="h1" align="center" accessibilityRole="header" style={styles.title}>
            {errors === 0 ? 'Превосходно!' : 'Готово!'}
          </Text>

          <Text variant="h2" align="center" style={styles.subtitle}>
            Выучено{' '}
            <Text variant="h2" style={{ color: colors.primary }}>
              {learnedCards} {pluralize(learnedCards, 'слово', 'слова', 'слов')}
            </Text>{' '}
            из {totalCards}
          </Text>

          {/* Прогресс фазы */}
          {phaseId && totalPhaseCards > 0 && (
            <Text variant="body" color="secondary" align="center" style={styles.phaseProgress}>
              Прогресс фазы: {studiedInPhase}/{totalPhaseCards} ({Math.round((studiedInPhase / totalPhaseCards) * 100)}%)
            </Text>
          )}

          <Text variant="body" color="secondary" align="center" style={styles.description}>
            {errors === 0 && isPhaseComplete
              ? 'Все карточки фазы выучены! Так держать!'
              : 'Отличная работа — продолжай серию!'}
          </Text>
        </View>

        {/* Statistics Card */}
        <Card padding="none" style={styles.statsCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem} accessible accessibilityLabel={`Время: ${formatTime(timeSpent)}`}>
              <Text variant="overline" color="secondary" style={styles.statLabel}>
                Время
              </Text>
              <Text variant="h3" style={[styles.bold, { color: colors.textPrimary }]}>
                {formatTime(timeSpent)}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.statItem} accessible accessibilityLabel={`Ошибок: ${errors}`}>
              <Text variant="overline" color="secondary" style={styles.statLabel}>
                Ошибок
              </Text>
              <Text variant="h3" style={[styles.bold, { color: errors > 0 ? colors.errorText : colors.textPrimary }]}>
                {errors}
              </Text>
            </View>
          </View>
        </Card>

        {/* Detailed Review Button - показываем только если есть ошибки */}
        {errorCards.length > 0 && (
          <Pressable
            onPress={handleViewDetails}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.detailButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { backgroundColor: colors.surfaceMuted, borderColor: alpha(colors.primary, 40) },
            ]}
          >
            <View style={styles.detailButtonMain}>
              <List size={iconSize.s} color={colors.primary} />
              <Text variant="button" style={[styles.noLetterSpacing, { color: colors.primary }]}>
                Посмотреть результат
              </Text>
            </View>
            <Text variant="caption" color="secondary">
              Список слов, ответы и ошибки
            </Text>
          </Pressable>
        )}

        {/* Flexible Spacer */}
        <View style={styles.flexSpacer} />
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { backgroundColor: colors.background, paddingBottom: bottomInset + spacing.l }]}>
        <Button title={primaryButtonLabel} iconRight={ArrowRight} onPress={handleNextCards} fullWidth />

        {/* Secondary Actions Stack */}
        <View style={styles.secondaryActions}>
          {/* Review Mistakes - показываем только если есть ошибки */}
          {errorCards.length > 0 && (
            <Pressable
              onPress={handleReviewMistakes}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: alpha(colors.error, 20) },
                pressed && [styles.pressedScale, { backgroundColor: alpha(colors.error, 10) }],
              ]}
            >
              <RotateCcw size={iconSize.s} color={colors.errorText} />
              <Text variant="button" style={[styles.noLetterSpacing, { color: colors.errorText }]}>
                Повторить ошибки
              </Text>
            </Pressable>
          )}

          {/* Review Words */}
          <Pressable
            onPress={handleReviewWords}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.border },
              pressed && [styles.pressedScale, { backgroundColor: colors.surfaceMuted, borderColor: colors.textTertiary }],
            ]}
          >
            <BookOpen size={iconSize.s} color={colors.textSecondary} />
            <Text variant="button" style={[styles.noLetterSpacing, { color: colors.textSecondary }]}>
              Повторить слова
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Список ошибок — нижний лист */}
      <Sheet
        visible={showErrorsModal}
        onClose={() => setShowErrorsModal(false)}
        title="Ошибки"
        headerRight={
          <Button
            variant="icon"
            icon={X}
            background="none"
            accessibilityLabel="Закрыть"
            onPress={() => setShowErrorsModal(false)}
          />
        }
        footer={<Button title="Закрыть" onPress={() => setShowErrorsModal(false)} fullWidth />}
      >
        <Text variant="caption" color="secondary" style={styles.sheetSubtitle}>
          {errorCards.length} {pluralize(errorCards.length, 'слово', 'слова', 'слов')} — повтори их ещё раз
        </Text>
        <View style={styles.errorListContent}>
          {errorCards.map((card, index) => (
            <View
              key={card.id ?? index}
              style={[styles.errorRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.errorIndex, { backgroundColor: alpha(colors.error, 10) }]}>
                <Text variant="label" style={[styles.bold, { color: colors.errorText }]}>{index + 1}</Text>
              </View>
              <View style={styles.errorBody}>
                <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>{card.front}</Text>
                <Text variant="bodySmall" style={{ color: colors.textSecondary }}>{card.back}</Text>
              </View>
              {card.rating === 2 && <Badge label="Сомневаюсь" tone="warning" />}
            </View>
          ))}
        </View>
      </Sheet>

      <StreakCelebrationModal
        visible={showStreakModal}
        streakCount={newStreakCount ?? 0}
        onClose={() => setShowStreakModal(false)}
      />
      <RatingPromptModal
        visible={showRatingPrompt}
        onClose={() => setShowRatingPrompt(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  semibold: {
    fontWeight: '600',
  },
  bold: {
    fontWeight: '700',
  },
  noLetterSpacing: {
    letterSpacing: 0,
  },
  pressedScale: {
    transform: [{ scale: 0.98 }],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.l,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  // Без свечения: рамка 4 px в тон primary
  medallion: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    marginBottom: spacing.l,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.xs,
  },
  phaseProgress: {
    marginTop: spacing.xs,
  },
  description: {
    marginTop: spacing.xxs,
  },
  statsCard: {
    padding: spacing.l,
    marginBottom: spacing.l,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xxs,
  },
  statLabel: {
    marginBottom: spacing.xs,
  },
  divider: {
    width: 1,
    height: 40,
  },
  detailButton: {
    borderRadius: borderRadius.l,
    borderWidth: 2,
    padding: spacing.m,
    marginBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  detailButtonMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flexSpacer: {
    minHeight: spacing.l,
    flex: 1,
  },
  bottomActions: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    gap: spacing.s,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  secondaryButton: {
    flex: 1,
    height: heights.button,
    borderRadius: borderRadius.m,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
  },
  sheetSubtitle: {
    marginTop: -spacing.xs,
    marginBottom: spacing.m,
  },
  errorListContent: {
    gap: spacing.s,
    paddingBottom: spacing.xs,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  errorIndex: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBody: {
    flex: 1,
    gap: spacing.xxs,
  },
});
