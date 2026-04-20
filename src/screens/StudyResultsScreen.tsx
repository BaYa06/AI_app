/**
 * Study Results Screen
 * @description Экран результатов тренировки после завершения изучения карточек
 */
import React from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform, Modal } from 'react-native';
import { useThemeColors } from '@/store';
import { Text, StreakCelebrationModal } from '@/components/common';
import { Analytics } from '@/services/analytics';
import { spacing } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import { ArrowLeft, Settings, CheckCircle2, List, ArrowRight, RotateCcw, BookOpen, X } from 'lucide-react-native';

type Props = RootStackScreenProps<'StudyResults'>;

export function StudyResultsScreen({ navigation, route }: Props) {
  const {
    setId,
    totalCards,
    learnedCards,
    timeSpent,
    errors,
    errorCards,
    modeTitle = 'Flashcards',
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
  const [showErrorsModal, setShowErrorsModal] = React.useState(false);
  const [showStreakModal, setShowStreakModal] = React.useState(streakIncreased === true);

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
      'Flashcards': 'flashcard',
      'Multiple Choice': 'quiz',
      'Match': 'match',
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
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' }
          ]}
        >
          <ArrowLeft size={24} color={colors.textPrimary} />
        </Pressable>
        
        <Text variant="h3" style={styles.headerTitle}>
          {modeTitle}
        </Text>
        
        <Pressable
          onPress={handleSettings}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' }
          ]}
        >
          <Settings size={24} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Scrollable Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Spacer */}
        <View style={styles.topSpacer} />

        {/* Hero Section */}
        <View style={styles.heroSection}>
          {/* Medallion with glow effect */}
          <View style={styles.medallionContainer}>
            <View style={[styles.medallion, { 
              backgroundColor: colors.primary,
              borderColor: colors.background,
            }]}>
              <CheckCircle2 size={48} color="#FFFFFF" strokeWidth={3} />
            </View>
          </View>

          <Text variant="h1" align="center" style={styles.title}>
            {errors === 0 ? 'Превосходно!' : 'Готово!'}
          </Text>
          
          <Text variant="h2" align="center" style={styles.subtitle}>
            Выучено <Text style={{ color: colors.primary }}>{learnedCards} слов</Text> из {totalCards}
          </Text>
          
          {/* Прогресс фазы */}
          {phaseId && totalPhaseCards > 0 && (
            <Text variant="body" color="secondary" align="center" style={{ marginTop: spacing.xs }}>
              Прогресс фазы: {studiedInPhase}/{totalPhaseCards} ({Math.round((studiedInPhase / totalPhaseCards) * 100)}%)
            </Text>
          )}
          
          <Text variant="body" color="secondary" align="center" style={styles.description}>
            {errors === 0 
              ? isPhaseComplete 
                ? 'Все карточки фазы выучены! Так держать! 🎉'
                : 'Отличная работа — продолжай серию!'
              : 'Отличная работа — продолжай серию!'}
          </Text>
        </View>

        {/* Statistics Card */}
        <View style={[styles.statsCard, { 
          backgroundColor: colors.surface,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 12,
            },
            android: {
              elevation: 2,
            },
            web: {
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
            }
          })
        }]}>
          <View style={styles.statsGrid}>
            {/* Time */}
            <View style={styles.statItem}>
              <Text variant="caption" style={[styles.statLabel, { color: colors.textTertiary }]}>
                ВРЕМЯ
              </Text>
              <Text variant="h2" style={[styles.statValue, { color: colors.textPrimary }]}>
                {formatTime(timeSpent)}
              </Text>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            {/* Errors */}
            <View style={styles.statItem}>
              <Text variant="caption" style={[styles.statLabel, { color: colors.textTertiary }]}>
                ОШИБОК
              </Text>
              <Text variant="h2" style={[styles.statValue, { color: colors.error }]}>
                {errors}
              </Text>
            </View>
          </View>
        </View>

        {/* Detailed Review Button - показываем только если есть ошибки */}
        {errorCards.length > 0 && (
          <Pressable
            onPress={handleViewDetails}
            style={({ pressed }) => [
              styles.detailButton,
              { 
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
              },
              pressed && { 
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.primary + '4D',
              }
            ]}
          >
            <View style={styles.detailButtonContent}>
              <View style={styles.detailButtonMain}>
                <List size={20} color={colors.primary} />
                <Text variant="button" style={{ color: colors.primary }}>
                  Посмотреть результат
                </Text>
              </View>
              <Text variant="caption" color="secondary" style={styles.detailButtonHint}>
                Список слов, ответы и ошибки
              </Text>
            </View>
          </Pressable>
        )}

        {/* Flexible Spacer */}
        <View style={styles.flexSpacer} />
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { backgroundColor: colors.background }]}>
        {/* Primary CTA */}
        <Pressable
          onPress={handleNextCards}
          style={({ pressed }) => [
            styles.primaryButton,
            { 
              backgroundColor: colors.primary,
              ...Platform.select({
                ios: {
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                },
                android: {
                  elevation: 4,
                },
                web: {
                  boxShadow: `0 4px 16px ${colors.primary}40`,
                }
              })
            },
            pressed && { transform: [{ scale: 0.98 }] }
          ]}
        >
          <Text variant="button" style={styles.primaryButtonText}>
            {primaryButtonLabel}
          </Text>
          <ArrowRight size={22} color="#FFFFFF" />
        </Pressable>

        {/* Secondary Actions Stack */}
        <View style={styles.secondaryActions}>
          {/* Review Mistakes - показываем только если есть ошибки */}
          {errorCards.length > 0 && (
            <Pressable
              onPress={handleReviewMistakes}
              style={({ pressed }) => [
                styles.secondaryButton,
                { 
                  borderColor: colors.error + '1A',
                },
                pressed && { 
                  backgroundColor: colors.error + '0A',
                  transform: [{ scale: 0.98 }]
                }
              ]}
            >
              <RotateCcw size={20} color={colors.error} />
              <Text variant="button" style={{ color: colors.error }}>
                Повторить ошибки
              </Text>
            </Pressable>
          )}

          {/* Review Words */}
          <Pressable
            onPress={handleReviewWords}
            style={({ pressed }) => [
              styles.secondaryButton,
              { 
                borderColor: colors.border,
              },
              errorCards.length === 0 && { flex: 1 }, // Занимает всю ширину если нет ошибок
              pressed && { 
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.textTertiary,
                transform: [{ scale: 0.98 }]
              }
            ]}
          >
            <BookOpen size={20} color={colors.textSecondary} />
            <Text variant="button" style={{ color: colors.textSecondary }}>
              Повторить слова
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Modal со списком ошибок */}
      <Modal
        visible={showErrorsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowErrorsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text variant="h3">Ошибки ({errorCards.length})</Text>
              <Pressable
                onPress={() => setShowErrorsModal(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' }
                ]}
              >
                <X size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Error Cards List */}
            <ScrollView 
              style={styles.errorList}
              showsVerticalScrollIndicator={false}
            >
              {errorCards.map((card, index) => (
                <View 
                  key={index} 
                  style={[styles.errorCard, { 
                    backgroundColor: colors.surface,
                    borderColor: colors.borderLight,
                  }]}
                >
                  <View style={styles.errorCardHeader}>
                    <View style={[styles.errorBadge, { backgroundColor: colors.error + '1A' }]}>
                      <Text variant="caption" style={{ color: colors.error, fontWeight: '600' }}>
                        {card.rating === 1 ? 'Не знаю' : 'Сомневаюсь'}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.errorCardContent}>
                    <View style={styles.errorCardSide}>
                      <Text variant="caption" color="secondary" style={styles.errorCardLabel}>
                        Вопрос:
                      </Text>
                      <Text variant="body" style={styles.errorCardText}>
                        {card.front}
                      </Text>
                    </View>
                    
                    <View style={[styles.errorCardDivider, { backgroundColor: colors.borderLight }]} />
                    
                    <View style={styles.errorCardSide}>
                      <Text variant="caption" color="secondary" style={styles.errorCardLabel}>
                        Ответ:
                      </Text>
                      <Text variant="body" style={styles.errorCardText}>
                        {card.back}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Close Button */}
            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setShowErrorsModal(false)}
                style={({ pressed }) => [
                  styles.modalCloseButton,
                  { backgroundColor: colors.primary },
                  pressed && { transform: [{ scale: 0.98 }] }
                ]}
              >
                <Text variant="button" style={{ color: '#FFFFFF' }}>
                  Закрыть
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <StreakCelebrationModal
        visible={showStreakModal}
        streakCount={newStreakCount ?? 0}
        onClose={() => setShowStreakModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 20,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  topSpacer: {
    height: 24,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  medallionContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  medallion: {
    width: 96,
    height: 96,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#6467f2',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      web: {
        boxShadow: '0 0 20px rgba(100, 103, 242, 0.3)',
      }
    }),
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 8,
  },
  description: {
    marginTop: 4,
  },
  statsCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 40,
  },
  detailButton: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    marginBottom: 32,
  },
  detailButtonContent: {
    alignItems: 'center',
  },
  detailButtonMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  detailButtonHint: {
    fontSize: 12,
    marginTop: 4,
  },
  flexSpacer: {
    minHeight: 20,
    flex: 1,
  },
  bottomActions: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 16,
    gap: 12,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 15,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    paddingHorizontal: 15,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.1)',
      }
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorList: {
    flex: 1,
    padding: 16,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  errorCardHeader: {
    padding: 12,
    paddingBottom: 8,
  },
  errorBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  errorCardContent: {
    padding: 12,
    paddingTop: 0,
  },
  errorCardSide: {
    marginBottom: 12,
  },
  errorCardLabel: {
    marginBottom: 4,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  errorCardText: {
    fontSize: 16,
    lineHeight: 24,
  },
  errorCardDivider: {
    height: 1,
    marginVertical: 12,
  },
  modalFooter: {
    padding: 16,
    paddingBottom: 24,
  },
  modalCloseButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
