/**
 * Home Screen - Новый UI
 * @description Главная страница с современным дизайном
 */
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSetsStore, useSettingsStore, useThemeColors } from '@/store';
import { selectSetStats } from '@/store/cardsStore';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import { 
  Menu, 
  Search, 
  Plus, 
  Calendar, 
  Flame, 
  BookOpen, 
  CheckCircle, 
  ArrowRight, 
  Library, 
  Upload,
  MoreVertical,
} from 'lucide-react-native';

export function HomeScreen({ navigation }: any) {
  const colors = useThemeColors();
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const todayStats = useSettingsStore((s) => s.todayStats);
  const sets = useSetsStore((s) => s.getAllSets());
  const updateSetStats = useSetsStore((s) => s.updateSetStats);

  // Обновляем статистику всех наборов из БД при фокусе на экране
  useFocusEffect(
    React.useCallback(() => {
      sets.forEach((set) => {
        const stats = selectSetStats(set.id);
        updateSetStats(set.id, {
          cardCount: stats.total,
          newCount: stats.newCount,
          learningCount: stats.learningCount,
          reviewCount: stats.reviewCount,
          masteredCount: stats.masteredCount,
        });
      });
    }, [sets.length, updateSetStats])
  );

  // Вычисляем карточки на сегодня
  const dueCards = sets.reduce((sum, set) => sum + (set.reviewCount || 0) + (set.newCount || 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.menuButton}>
            <Menu size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Flashcards</Text>
        </View>
        
        <View style={styles.headerRight}>
          <Pressable 
            style={styles.iconButton}
            onPress={() => setSearchVisible(!searchVisible)}
          >
            <Search size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable 
            style={styles.iconButton}
            onPress={() => navigation?.navigate('SetEditor', {})}
          >
            <Plus size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      {searchVisible && (
        <View style={[styles.searchBar, { backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Поиск по наборам..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Daily Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
          <View style={styles.summaryHeader}>
            <Calendar size={24} color="#FFFFFF" style={{ marginRight: spacing.s }} />
            <Text style={styles.summaryTitle}>Сегодня</Text>
          </View>
          
          <View style={styles.summaryStats}>
            <View style={styles.statRow}>
              <Flame size={20} color="#FFFFFF" style={{ marginRight: spacing.s }} />
              <Text style={styles.statText}>Streak: {todayStats.streak} дней</Text>
            </View>
            <View style={styles.statRow}>
              <BookOpen size={20} color="#FFFFFF" style={{ marginRight: spacing.s }} />
              <Text style={styles.statText}>Карточек на изучение: {dueCards}</Text>
            </View>
            <View style={styles.statRow}>
              <CheckCircle size={20} color="#FFFFFF" style={{ marginRight: spacing.s }} />
              <Text style={styles.statText}>Изучено сегодня: {todayStats.cardsStudied}</Text>
            </View>
          </View>

          <Pressable style={styles.startButton}>
            <Text style={styles.startButtonText}>Начать изучение</Text>
            <ArrowRight size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Мои наборы</Text>
          <Pressable>
            <Text style={[styles.viewAllButton, { color: colors.primary }]}>Посмотреть все</Text>
          </Pressable>
        </View>

        {/* Card Sets List */}
        {sets.length === 0 ? (
          <View style={styles.emptyState}>
            <Library size={64} color={colors.textSecondary} style={{ marginBottom: spacing.l }} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Создайте свой первый набор{'\n'}карточек!
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Начните изучать новые темы с{'\n'}помощью интервальных повторений
            </Text>
            <Pressable 
              style={[styles.createButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation?.navigate('SetEditor', {})}
            >
              <Text style={styles.createButtonText}>Создать набор</Text>
            </Pressable>
            <Text style={[styles.emptyOr, { color: colors.textSecondary }]}>или</Text>
            <Pressable style={[styles.importButton, { borderColor: colors.border }]}>
              <Upload size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
              <Text style={[styles.importButtonText, { color: colors.primary }]}>
                Импортировать из файла
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.setsList}>
            {sets.map((set) => {
              const progress = set.cardCount > 0 ? Math.round((set.masteredCount / set.cardCount) * 100) : 0;
              const getStatusColor = () => {
                if (progress === 100) return colors.success;
                if (progress >= 60) return colors.success;
                if (progress >= 10) return colors.warning;
                return colors.error;
              };
              
              // Дата создания набора
              const getDateDisplay = () => {
                const date = new Date(set.createdAt);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return {
                  month: months[date.getMonth()],
                  day: date.getDate().toString()
                };
              };
              const dateDisplay = getDateDisplay();

              return (
                <Pressable
                  key={set.id}
                  style={[styles.setCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => navigation?.navigate('SetDetail', { setId: set.id })}
                >
                  {/* Header with icon, title, status dot, and button */}
                  <View style={styles.setCardHeader}>
                    <View style={styles.setCardLeft}>
                      {/* Date Icon */}
                      <View style={[styles.dateIcon, { backgroundColor: colors.border }]}>
                        <Text style={[styles.dateMonth, { color: colors.textSecondary }]}>{dateDisplay.month}</Text>
                        <Text style={[styles.dateDay, { color: colors.textPrimary }]}>{dateDisplay.day}</Text>
                      </View>
                      
                      {/* Title and Stats */}
                      <View style={styles.setCardInfo}>
                        <View style={styles.titleRow}>
                          <Text style={[styles.setTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {set.title}
                          </Text>
                          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                        </View>
                        <Text style={[styles.setCardCount, { color: colors.textSecondary }]}>
                          {set.cardCount} cards • {progress}% Mastered
                        </Text>
                      </View>
                    </View>

                    {/* More Menu */}
                    <Pressable 
                      style={styles.moreButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        // TODO: Open menu with options
                      }}
                    >
                      <MoreVertical size={20} color={colors.textSecondary} />
                    </Pressable>
                  </View>

                  {/* Progress Section */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressHeader}>
                      <Text style={[styles.progressLabel, { color: colors.textTertiary }]}>PROGRESS</Text>
                      <Text style={[styles.progressPercentage, { color: colors.textTertiary }]}>{progress}%</Text>
                    </View>
                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { 
                            backgroundColor: progress === 100 ? colors.success : colors.primary,
                            width: `${progress}%` 
                          }
                        ]} 
                      />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      {sets.length > 0 && (
        <Pressable 
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => navigation?.navigate('SetEditor', {})}
        >
          <Plus size={28} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    padding: spacing.xs,
    marginRight: spacing.s,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    padding: spacing.xs,
  },

  // Search
  searchBar: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },
  searchInput: {
    fontSize: 16,
    padding: spacing.s,
  },

  // Content
  content: {
    flex: 1,
  },

  // Summary Card
  summaryCard: {
    margin: spacing.m,
    padding: spacing.l,
    borderRadius: borderRadius.l,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
  },

  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summaryStats: {
    marginBottom: spacing.l,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.s,
  },

  statText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  startButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: spacing.m,
    borderRadius: borderRadius.m,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    marginBottom: spacing.m,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  viewAllButton: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.l,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.m,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  createButton: {
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.m,
    marginBottom: spacing.m,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyOr: {
    fontSize: 14,
    marginBottom: spacing.m,
  },
  importButton: {
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Sets List
  setsList: {
    padding: spacing.m,
    gap: 0,
  },
  setCard: {
    padding: 14,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 16,
  },

  // Card Header
  setCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.s,
  },
  dateIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    lineHeight: 12,
  },
  dateDay: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  setCardInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  setTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  setCardCount: {
    fontSize: 12,
    fontWeight: '400',
  },

  // Progress Section
  progressSection: {
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressPercentage: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },

  // More Button
  moreButton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: spacing.l,
    bottom: spacing.xxl,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    // @ts-ignore - boxShadow для web
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },

});
