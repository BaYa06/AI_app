/**
 * Home Screen - Flashly Design
 * @description Главный экран с новым дизайном
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Text as RNText,
  Platform,
} from 'react-native';
import {
  School,
  Search,
  Plus,
  Flame,
  Play,
  BookOpen,
  CheckCircle2,
  AlertCircle,
} from '@/components/common/Icons';
import { useSetsStore, useSettingsStore } from '@/store';
// Text компонент не используется напрямую, но импортируется для типов
import { spacing, borderRadius } from '@/constants';
import type { MainTabScreenProps } from '@/types/navigation';
import type { CardSet } from '@/types';

type Props = MainTabScreenProps<'Home'>;
type CourseTab = {
  id: string;
  label: string;
  count: number;
};

export function HomeScreen({ navigation }: Props) {
  const colors = useSettingsStore((s) => s.colors);
  const todayStats = useSettingsStore((s) => s.todayStats);
  const sets = useSetsStore((s) => s.getAllSets());
  const [activeCourse, setActiveCourse] = useState<string>('all');

  const toTitleCase = (value: string) =>
    value
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const courseKeyFromSet = (set: CardSet) => {
    const lang = (set.languageTo || set.languageFrom || '').trim();
    if (lang) return lang.toLowerCase();
    return set.category || 'general';
  };

  const courseLabelFromSet = (set: CardSet) => {
    const lang = (set.languageTo || set.languageFrom || '').trim();
    if (lang) {
      const normalized = lang.toLowerCase();
      const languageMap: Record<string, string> = {
        de: 'German',
        en: 'English',
        es: 'Spanish',
        fr: 'French',
        ru: 'Russian',
      };
      return languageMap[normalized] || toTitleCase(lang);
    }

    if (set.category) {
      return toTitleCase(set.category);
    }

    return set.title;
  };

  // Подсчет карточек на сегодня
  const totalDueCards = useMemo(() => {
    return sets.reduce((sum, set) => sum + (set.reviewCount || 0) + (set.newCount || 0), 0);
  }, [sets]);

  // Прогресс на сегодня (пример: 12/50)
  const todayProgress = `${todayStats.cardsStudied}/50`;

  // Расчет прогресса для каждого набора
  const getProgress = (set: CardSet) => {
    if (set.cardCount === 0) return 0;
    return Math.round((set.masteredCount / set.cardCount) * 100);
  };

  // Определение статуса набора по прогрессу
  const getStatusColor = (progress: number) => {
    if (progress === 100) return colors.success;
    if (progress >= 50) return colors.warning;
    return colors.error;
  };

  const courseTabs = useMemo<CourseTab[]>(() => {
    if (sets.length === 0) {
      return [{ id: 'all', label: 'All Decks', count: 0 }];
    }

    const aggregated = new Map<string, CourseTab>();

    sets.forEach((set) => {
      const key = courseKeyFromSet(set);
      if (!aggregated.has(key)) {
        aggregated.set(key, { id: key, label: courseLabelFromSet(set), count: 0 });
      }
      aggregated.get(key)!.count += 1;
    });

    return [
      { id: 'all', label: 'All Decks', count: sets.length },
      ...Array.from(aggregated.values()).sort((a, b) => b.count - a.count),
    ];
  }, [sets]);

  useEffect(() => {
    if (!courseTabs.some((tab) => tab.id === activeCourse)) {
      setActiveCourse('all');
    }
  }, [activeCourse, courseTabs]);

  const filteredSets = useMemo(() => {
    if (activeCourse === 'all') return sets;
    return sets.filter((set) => courseKeyFromSet(set) === activeCourse);
  }, [activeCourse, sets]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Navigation Bar */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: Platform.select({
              ios: 'rgba(255, 255, 255, 0.8)',
              android: colors.surface,
              default: 'rgba(255, 255, 255, 0.8)',
            }),
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={[styles.logoContainer, { backgroundColor: colors.primary }]}>
              <School size={20} color="#FFFFFF" />
            </View>
            <RNText style={[styles.headerTitle, { color: colors.textPrimary }]}>Flashly</RNText>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.iconButton}>
              <Search size={20} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => navigation.navigate('SetEditor', {})}
            >
              <Plus size={20} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.courseTabsRow}
          style={styles.courseTabsWrapper}
        >
          {courseTabs.map((tab) => {
            const isActive = tab.id === activeCourse;
            return (
              <Pressable
                key={tab.id}
                style={[
                  styles.courseTab,
                  {
                    backgroundColor: isActive ? colors.background : colors.surfaceVariant,
                    borderColor: isActive ? colors.primary : colors.surfaceVariant,
                    borderTopWidth: isActive ? 2 : 1,
                  },
                ]}
                onPress={() => setActiveCourse(tab.id)}
              >
                <RNText
                  style={[
                    styles.courseTabText,
                    isActive
                      ? { color: colors.primary, fontWeight: '700' }
                      : { color: colors.textSecondary },
                  ]}
                >
                  {tab.label}
                </RNText>
                {tab.count > 0 && (
                  <View
                    style={[
                      styles.courseTabBadge,
                      {
                        backgroundColor: isActive ? colors.primary : colors.background,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <RNText
                      style={[
                        styles.courseTabBadgeText,
                        { color: isActive ? colors.textInverse : colors.textSecondary },
                      ]}
                    >
                      {tab.count}
                    </RNText>
                  </View>
                )}
              </Pressable>
            );
          })}

          <Pressable
            style={[
              styles.courseAddButton,
              {
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.border,
              },
            ]}
            onPress={() => navigation.navigate('SetEditor', {})}
          >
            <Plus size={16} color={colors.textPrimary} />
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Daily Summary Hero Card */}
        <View style={styles.heroCard}>
          <View style={[styles.heroGradient, { backgroundColor: colors.primary }]}>
            {/* Decorative circle */}
            <View style={styles.decorativeCircle} />
            {/* Gradient overlay effect */}
            <View style={styles.gradientOverlay} />

            <View style={styles.heroContent}>
              <View style={styles.heroHeader}>
                <View>
                  <RNText style={styles.heroLabel}>DAILY SUMMARY</RNText>
                  <RNText style={styles.heroTitle}>Ready to learn?</RNText>
                </View>
                <View style={styles.streakBadge}>
                  <Flame size={18} color="#FFFFFF" />
                  <RNText style={styles.streakText}>{todayStats.streak} Days</RNText>
                </View>
              </View>

              <View style={styles.heroStats}>
                <View style={styles.heroStatCard}>
                  <RNText style={styles.heroStatLabel}>Cards Due</RNText>
                  <RNText style={styles.heroStatValue}>{totalDueCards}</RNText>
                </View>
                <View style={styles.heroStatCard}>
                  <RNText style={styles.heroStatLabel}>Today's Progress</RNText>
                  <RNText style={styles.heroStatValue}>{todayProgress}</RNText>
                </View>
              </View>

              <Pressable style={styles.startButton}>
                <Play size={18} color="#6467f2" fill="#6467f2" />
                <RNText style={styles.startButtonText}>Start Learning</RNText>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Your Decks Section */}
        <View style={styles.decksSection}>
          <View style={styles.decksHeader}>
            <RNText style={[styles.decksTitle, { color: colors.textPrimary }]}>Your Decks</RNText>
            <Pressable>
              <RNText style={[styles.viewAllText, { color: colors.primary }]}>View All</RNText>
            </Pressable>
          </View>

          <View style={styles.decksList}>
            {filteredSets.length === 0 ? (
              <View style={styles.emptyState}>
                <BookOpen size={64} color={colors.textSecondary} />
                <RNText style={[styles.emptyTitle, { color: colors.textPrimary }]}>                
                  {sets.length === 0 ? 'No decks yet' : 'No decks in this course'}
                </RNText>
                <RNText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>                
                  {sets.length === 0
                    ? 'Create your first deck to get started'
                    : 'Try another tab or create a new deck'}
                </RNText>
              </View>
            ) : (
              filteredSets.slice(0, 3).map((set) => {
                const progress = getProgress(set);
                const statusColor = getStatusColor(progress);

                return (
                  <View
                    key={set.id}
                    style={[
                      styles.deckCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.deckCardHeader}>
                      <View style={styles.deckCardLeft}>
                        <View
                          style={[
                            styles.deckIconContainer,
                            { backgroundColor: colors.surfaceVariant || colors.border },
                          ]}
                        >
                          <BookOpen size={24} color={colors.textPrimary} />
                        </View>
                        <View style={styles.deckInfo}>
                          <View style={styles.deckTitleRow}>
                            <RNText style={[styles.deckTitle, { color: colors.textPrimary }]}>
                              {set.title}
                            </RNText>
                            {progress === 100 ? (
                              <CheckCircle2 size={12} color={statusColor} fill={statusColor} />
                            ) : progress >= 50 ? (
                              <AlertCircle size={12} color={statusColor} />
                            ) : (
                              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                            )}
                          </View>
                          <RNText style={[styles.deckSubtitle, { color: colors.textSecondary }]}>
                            {set.cardCount} cards • {progress}% Mastered
                          </RNText>
                        </View>
                      </View>
                      <Pressable
                        style={[
                          styles.studyButton,
                          progress === 100
                            ? {
                                backgroundColor: colors.surfaceVariant || colors.border,
                              }
                            : { backgroundColor: colors.primary },
                        ]}
                      >
                        <RNText
                          style={[
                            styles.studyButtonText,
                            progress === 100
                              ? { color: colors.textPrimary }
                              : { color: colors.textInverse },
                          ]}
                        >
                          {progress === 100 ? 'Review' : 'Study'}
                        </RNText>
                      </Pressable>
                    </View>

                    <View style={styles.progressSection}>
                      <View style={styles.progressHeader}>
                        <RNText style={[styles.progressLabel, { color: colors.textSecondary }]}>
                          PROGRESS
                        </RNText>
                        <RNText style={[styles.progressPercent, { color: colors.textSecondary }]}>
                          {progress}%
                        </RNText>
                      </View>
                      <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              backgroundColor: progress === 100 ? colors.success : colors.primary,
                              width: `${progress}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
          },
        ]}
        onPress={() => navigation.navigate('SetEditor', {})}
      >
        <Plus size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: 10,
    paddingBottom: spacing.s,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  logoContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseTabsWrapper: {
    marginTop: spacing.xs,
  },
  courseTabsRow: {
    paddingHorizontal: spacing.s,
    alignItems: 'flex-end',
  },
  courseTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
    marginRight: spacing.s,
    borderWidth: 1,
  },
  courseTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  courseTabBadge: {
    marginLeft: spacing.xs,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
  },
  courseTabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  courseAddButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Hero Card
  heroCard: {
    margin: spacing.m,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  heroGradient: {
    padding: spacing.l,
    position: 'relative',
    overflow: 'hidden',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#8b5cf6',
    opacity: 0.5,
  },
  decorativeCircle: {
    position: 'absolute',
    right: -48,
    top: -48,
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 24,
      },
    }),
  },
  heroContent: {
    position: 'relative',
    zIndex: 10,
    gap: spacing.m,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.m,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  streakText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: spacing.xxs,
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing.m,
    marginVertical: spacing.m,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: spacing.m,
    borderRadius: borderRadius.m,
  },
  heroStatLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: spacing.xs,
  },
  heroStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    backgroundColor: '#FFFFFF',
    paddingVertical: spacing.m,
    borderRadius: borderRadius.xl,
    marginTop: spacing.s,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6467f2',
    marginLeft: spacing.xs,
  },

  // Decks Section
  decksSection: {
    paddingHorizontal: spacing.m,
    gap: spacing.m,
  },
  decksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  decksTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  decksList: {
    gap: spacing.m,
  },
  deckCard: {
    padding: spacing.m,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  deckCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  deckCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    flex: 1,
  },
  deckIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckInfo: {
    flex: 1,
  },
  deckTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  deckTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deckSubtitle: {
    fontSize: 12,
  },
  studyButton: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.m,
  },
  studyButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressSection: {
    gap: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressPercent: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.l,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#6467f2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
});
