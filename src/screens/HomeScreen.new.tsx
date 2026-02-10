/**
 * Home Screen - Новый UI
 * @description Главная страница с современным дизайном
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, useWindowDimensions, TextInput as RNTextInput, Alert, Platform, Modal } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import type { PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useSetsStore, useSettingsStore, useThemeColors, useCardsStore, useCoursesStore } from '@/store';
import { selectSetStats } from '@/store/cardsStore';
import { Text } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import {
  Menu, 
  Search, 
  Plus, 
  Calendar, 
  BookOpen, 
  CheckCircle, 
  ArrowRight, 
  Library,
  Star,
  Lightbulb,
  Upload,
  MoreVertical,
  X,
  MoreHorizontal,
  File,
  Folder,
  FolderOpen,
  Trash2,
  Edit2,
} from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { StreakService, getLocalDateKey } from '@/services/StreakService';
import type { DailyActivity } from '@/services/StreakService';

export function HomeScreen({ navigation }: any) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDarkMode = resolvedTheme === 'dark';
  const headerBackground = isDarkMode ? 'rgba(0, 0, 0, 0)' : 'rgb(255, 255, 255)';
  const backdropColor = isDarkMode ? 'rgba(6, 8, 20, 0.65)' : 'rgba(0, 0, 0, 0.35)';
  const drawerBackground = isDarkMode ? '#15192f' : colors.surface;
  const drawerBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : colors.border;
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchBarHeight, setSearchBarHeight] = useState(0);
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  const [todayBackendCards, setTodayBackendCards] = useState<number | null>(null);
  const [weekActivity, setWeekActivity] = useState<DailyActivity[]>([]);
  const syncStreakFromServer = useSettingsStore((s) => s.syncStreakFromServer);
  const [courseMenuOpen, setCourseMenuOpen] = useState<string | null>(null);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const editInputRef = useRef<RNTextInput>(null);
  const newCourseInputRef = useRef<RNTextInput>(null);
  const editModalInputRef = useRef<RNTextInput>(null);
  const SWIPE_THRESHOLD = 50;
  const SWIPE_VELOCITY = 200;
  const closeStreakModal = useCallback(() => setStreakModalVisible(false), []);
  const formatDays = useCallback((value: number) => {
    const mod100 = value % 100;
    const mod10 = value % 10;
    if (mod100 >= 11 && mod100 <= 14) return `${value} дней`;
    if (mod10 === 1) return `${value} день`;
    if (mod10 >= 2 && mod10 <= 4) return `${value} дня`;
    return `${value} дней`;
  }, []);

  // Fetch backend activity when modal opens
  useEffect(() => {
    let mounted = true;
    if (streakModalVisible) {
      // Загружаем активность за сегодня и за неделю
      Promise.all([
        StreakService.fetchTodayActivity(),
        StreakService.fetchWeekActivity(10),
        StreakService.fetchUserStats(),
      ])
        .then(([activity, week, stats]) => {
          if (mounted) {
            setTodayBackendCards(activity?.cards_studied ?? null);
            setWeekActivity(week);
            if (stats) {
              syncStreakFromServer({
                currentStreak: stats.current_streak,
                longestStreak: stats.longest_streak,
                lastActiveDate: stats.last_active_date,
              });
            }
          }
        })
        .catch(() => {
          if (mounted) setTodayBackendCards(null);
        });
    }
    return () => {
      mounted = false;
    };
  }, [streakModalVisible]);
  
  // Courses store
  const courses = useCoursesStore((s) => s.courses);
  const activeCourseId = useCoursesStore((s) => s.activeCourseId);
  const setActiveCourse = useCoursesStore((s) => s.setActiveCourse);
  const createCourse = useCoursesStore((s) => s.createCourse);
  const renameCourse = useCoursesStore((s) => s.renameCourse);
  const deleteCourse = useCoursesStore((s) => s.deleteCourse);
  const getActiveCourse = useCoursesStore((s) => s.getActiveCourse);
  
  // Sets store
  const allSets = useSetsStore((s) => s.getAllSets());
  const getSetsByCourse = useSetsStore((s) => s.getSetsByCourse);
  const moveSetsFromCourse = useSetsStore((s) => s.moveSetsFromCourse);
  const courseOrder = useMemo(() => [null, ...courses.map((c) => c.id)], [courses]);
  const totalMastered = useMemo(
    () => allSets.reduce((sum, set) => sum + (set.masteredCount || 0), 0),
    [allSets]
  );
  const todayStats = useSettingsStore((s) => s.todayStats);
  const DAILY_GOAL = 10;
  const dailyGoal = DAILY_GOAL;
  const cardsLearned = todayBackendCards ?? todayStats.cardsStudied;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bishkek',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    []
  );
  const computedStreak = useMemo(() => {
    const activeDates = new Set(
      weekActivity.filter((a) => a.cards_studied >= 10).map((a) => a.local_date)
    );
    let streak = 0;
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = dateFormatter.format(date);
      if (activeDates.has(key)) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }, [weekActivity, dateFormatter]);
  const streakValue = Math.max(todayStats.streak, computedStreak);
  const goalProgress = useMemo(() => {
    if (!dailyGoal) return 0;
    return Math.min(100, Math.round((cardsLearned / dailyGoal) * 100));
  }, [dailyGoal, cardsLearned]);
  const streakSupportText = useMemo(() => {
    const remaining = Math.max(dailyGoal - cardsLearned, 0);
    if (goalProgress === 0) {
      return `Главное — не идеальность, а привычка. Открой на минуту, выучи одно слово — и ты уже впереди. Цель: ${dailyGoal}`;
    }
    if (goalProgress <= 10) {
      return `Круто, ты уже начал! Осталось ${remaining} слов — сделай ещё пару и закрепи результат.`;
    }
    return `Осталось совсем немного, чтобы продлить серию. Продолжай в том же духе! Цель: ${dailyGoal}, выучено: ${cardsLearned}`;
  }, [goalProgress, dailyGoal, cardsLearned]);
  
  // Фильтрация наборов по активному курсу
  const filteredSets = useMemo(() => {
    if (activeCourseId === null) {
      return allSets; // "All" - показываем все наборы
    }
    return allSets.filter((set) => set.courseId === activeCourseId);
  }, [allSets, activeCourseId]);

  // Поиск по текущему списку наборов
  const visibleSets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return filteredSets;
    return filteredSets.filter((set) => {
      const title = set.title?.toLowerCase() || '';
      const desc = set.description?.toLowerCase() || '';
      const tags = (set.tags || []).join(' ').toLowerCase();
      return title.includes(query) || desc.includes(query) || tags.includes(query);
    });
  }, [filteredSets, searchQuery]);
  
  // Получаем название активного курса для empty state
  const activeCourseTitle = useMemo(() => {
    if (activeCourseId === null) return null;
    const course = courses.find((c) => c.id === activeCourseId);
    return course?.title || 'this course';
  }, [activeCourseId, courses]);

  const switchCourseByStep = useCallback(
    (step: number) => {
      if (drawerOpen || courseOrder.length === 0) return;
      const currentIndex = Math.max(courseOrder.findIndex((id) => id === activeCourseId), 0);
      const nextIndex = (currentIndex + step + courseOrder.length) % courseOrder.length;
      setActiveCourse(courseOrder[nextIndex]);
    },
    [activeCourseId, courseOrder, drawerOpen, setActiveCourse]
  );

  const handleSwipeStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = event.nativeEvent;
      if (state === State.END) {
        if (Math.abs(translationX) > SWIPE_THRESHOLD && Math.abs(velocityX) > SWIPE_VELOCITY) {
          if (translationX < 0) {
            switchCourseByStep(1); // swipe left -> next course
          } else {
            switchCourseByStep(-1); // swipe right -> previous course
          }
        }
      }
    },
    [SWIPE_THRESHOLD, SWIPE_VELOCITY, switchCourseByStep]
  );
  
  // Фокус на input при начале редактирования
  useEffect(() => {
    if (editingCourseId) {
      const timer = setTimeout(() => {
        editInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [editingCourseId]);
  
  // Фокус на input при создании курса
  useEffect(() => {
    if (isCreatingCourse) {
      const timer = setTimeout(() => {
        newCourseInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCreatingCourse]);
  
  // Вычисляем высоту контента: экран - header - tab bar
  const safeBottomPad = 0; // убираем нижний safe-area/паддинг
  const TAB_BAR_HEIGHT = 46;
  const contentMinHeight = windowHeight - headerHeight - TAB_BAR_HEIGHT;

  // Базовый стиль нижней навигации (должен совпадать с AppNavigator)
  const baseTabBarStyle = useMemo(
    () => ({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingBottom: safeBottomPad,
      paddingTop: 6,
      height: TAB_BAR_HEIGHT,
    }),
    [colors, safeBottomPad, TAB_BAR_HEIGHT]
  );

  // Прячем tab bar, когда открыт боковой drawer
  useEffect(() => {
    const parent = navigation?.getParent?.();
    if (!parent?.setOptions) return;

    parent.setOptions({
      tabBarStyle: drawerOpen
        ? { ...baseTabBarStyle, display: 'none' }
        : baseTabBarStyle,
    });

    return () => {
      parent.setOptions({ tabBarStyle: baseTabBarStyle });
    };
  }, [drawerOpen, navigation, baseTabBarStyle]);
  
  const onHeaderLayout = useCallback((e: any) => {
    setHeaderHeight(e.nativeEvent.layout.height);
  }, []);
  
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const updateSet = useSetsStore((s) => s.updateSet);
  const deleteSet = useSetsStore((s) => s.deleteSet);
  const addSet = useSetsStore((s) => s.addSet);
  const deleteCardsBySet = useCardsStore((s) => s.deleteCardsBySet);

  // Обновляем статистику всех наборов из БД при фокусе на экране
  useFocusEffect(
    React.useCallback(() => {
      allSets.forEach((set) => {
        const stats = selectSetStats(set.id);
        updateSetStats(set.id, {
          cardCount: stats.total,
          newCount: stats.newCount,
          learningCount: stats.learningCount,
          reviewCount: stats.reviewCount,
          masteredCount: stats.masteredCount,
        });
      });
    }, [allSets.length, updateSetStats])
  );

  // Подтягиваем прогресс за сегодня + стрик из бэка при фокусе экрана
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [activity, stats, week] = await Promise.all([
            StreakService.fetchTodayActivity(),
            StreakService.fetchUserStats(),
            StreakService.fetchWeekActivity(10),
          ]);
          if (active) {
            setTodayBackendCards(activity?.cards_studied ?? null);
            setWeekActivity(week);
            if (stats) {
              syncStreakFromServer({
                currentStreak: stats.current_streak,
                longestStreak: stats.longest_streak,
                lastActiveDate: stats.last_active_date,
              });
            }
          }
        } catch {
          if (active) setTodayBackendCards(null);
        }
      })();
      return () => {
        active = false;
      };
    }, [syncStreakFromServer])
  );

  // Вычисляем карточки на сегодня
  const dueCards = filteredSets.reduce((sum, set) => sum + (set.reviewCount || 0) + (set.newCount || 0), 0);
  
  // Подсчет наборов в каждом курсе
  const getCourseStats = useCallback(
    (courseId: string | null) => {
      const sets = courseId === null ? allSets : allSets.filter((s) => s.courseId === courseId);
      const cards = sets.reduce((sum, s) => sum + (s.cardCount || 0), 0);
      const mastered = sets.reduce((sum, s) => sum + (s.masteredCount || 0), 0);
      const percent = cards > 0 ? Math.round((mastered / cards) * 100) : 0;
      return {
        setCount: sets.length,
        cardCount: cards,
        masteredPercent: percent,
      };
    },
    [allSets]
  );
  
  // Обработка создания нового курса
  const handleCreateCourse = useCallback(() => {
    const title = newCourseTitle.trim();
    if (!title) {
      setIsCreatingCourse(false);
      setNewCourseTitle('');
      return;
    }
    
    createCourse(title);
    setIsCreatingCourse(false);
    setNewCourseTitle('');
  }, [newCourseTitle, createCourse]);
  
  // Обработка удаления курса
  const handleDeleteCourse = useCallback((courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    const stats = getCourseStats(courseId);
    const setCount = stats.setCount;

    // Проверяем есть ли наборы в курсе
    if (setCount > 0) {
      const setWord = setCount === 1 ? 'набор' : setCount < 5 ? 'набора' : 'наборов';
      const text = `Невозможно удалить курс "${course?.title}".\n\nВ этом курсе ${setCount} ${setWord}. Сначала удалите все наборы из этого курса.`;
      
      if (Platform.OS === 'web') {
        window.alert(text);
      } else {
        Alert.alert('Удаление невозможно', text, [{ text: 'Понятно' }]);
      }
      setCourseMenuOpen(null);
      return;
    }

    // Если наборов нет - подтверждаем удаление
    const performDelete = () => {
      deleteCourse(courseId);
      setCourseMenuOpen(null);
    };

    const message = `Удалить курс "${course?.title}"?`;

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Удаление курса',
        message,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Удалить', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  }, [courses, getCourseStats, deleteCourse]);

  const saveCourseTitle = useCallback(
    (courseId: string) => {
      const title = editingTitle.trim();
      if (title) {
        renameCourse(courseId, title);
      }
      setEditingCourseId(null);
      setEditingTitle('');
      setIsEditModalVisible(false);
    },
    [editingTitle, renameCourse]
  );

  const cancelCourseEdit = useCallback(() => {
    setEditingCourseId(null);
    setEditingTitle('');
    setIsEditModalVisible(false);
  }, []);

  // Открытие модального окна редактирования
  const openEditModal = useCallback((courseId: string, currentTitle: string) => {
    setEditingCourseId(courseId);
    setEditingTitle(currentTitle);
    setCourseMenuOpen(null);
    setDrawerOpen(false); // Закрываем drawer перед открытием модального окна
    // Небольшая задержка чтобы drawer успел закрыться
    setTimeout(() => {
      setIsEditModalVisible(true);
    }, 100);
  }, []);

  return (
    <PanGestureHandler
      enabled={!drawerOpen}
      onHandlerStateChange={handleSwipeStateChange}
      activeOffsetX={[-20, 20]}
      failOffsetY={[-10, 10]}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
      >
      {/* Header */}
      <View
        onLayout={onHeaderLayout}
        style={[
          styles.header,
          { backgroundColor: headerBackground, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable style={styles.menuButton} onPress={() => setDrawerOpen(true)}>
            <Menu size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        
          <View style={styles.headerCenter}>
          <View style={styles.headerBadges}>
            <Pressable style={styles.badge} onPress={() => setStreakModalVisible(true)}>
              <Ionicons name="flame" size={24} color={isDarkMode ? '#FBBF24' : '#EA580C'} />
              <Text style={[styles.badgeText, { color: isDarkMode ? '#FDE68A' : '#C2410C' }]}>
                {formatDays(streakValue)}
              </Text>
            </Pressable>

            <View style={styles.badge}>
              <Ionicons name="diamond" size={24} color={isDarkMode ? '#A5B4FC' : '#4F46E5'} />
              <Text style={[styles.badgeText, { color: isDarkMode ? '#E0E7FF' : '#312E81' }]}>
                {totalMastered}
              </Text>
            </View>
          </View>
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
        <View
          style={[styles.searchBar, { backgroundColor: colors.surface }]}
          onLayout={(e) => setSearchBarHeight(e.nativeEvent.layout.height)}
        >
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, outlineStyle: 'none' }]}
            placeholder="Поиск по наборам..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      {/* Overlay to close search when tapping outside */}
      {searchVisible && (
        <Pressable
          style={[
            styles.searchOverlay,
            { top: headerHeight + searchBarHeight },
          ]}
          onPress={() => setSearchVisible(false)}
        />
      )}

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { minHeight: contentMinHeight }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {visibleSets.length === 0 ? (
          <View style={[styles.emptyStateModern, { minHeight: contentMinHeight }]}>
            <View style={styles.illustrationWrap}>
              <View style={[styles.illustrationGlow, { backgroundColor: colors.primary + '22' }]} />
              <View style={[styles.illustrationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Library size={56} color={colors.primary} />
              </View>
              <View style={[styles.illustrationBadge, styles.badgeStar, { backgroundColor: '#facc15' }]}>
                <Star size={24} color="#fff" />
              </View>
              <View style={[styles.illustrationBadge, styles.badgePlus, { backgroundColor: colors.primary }]}>
                <Plus size={24} color="#fff" />
              </View>
            </View>

            <View style={styles.emptyTextBlock}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Пока нет наборов
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Создайте первый набор, чтобы начать учиться и упорядочить материалы по курсам.
              </Text>
            </View>

            <View style={styles.emptyActions}>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={() => navigation?.navigate('SetEditor', {})}
              >
                <Plus size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Создать набор</Text>
              </Pressable>

              <View style={[styles.tipCard, { borderColor: colors.border, backgroundColor: colors.primary + '0D' }]}>
                <Lightbulb size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tipTitle, { color: colors.textPrimary }]}>Подсказка</Text>
                  <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                    Объединяйте несколько наборов в курс — так проще учиться по теме или семестру.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Daily Summary Card */}
            <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
              <View style={styles.summaryHeader}>
                <Calendar size={24} color="#FFFFFF" style={{ marginRight: spacing.s }} />
                <Text style={styles.summaryTitle}>Сегодня</Text>
              </View>
              
              <View style={styles.summaryStats}>
                <View style={styles.statRow}>
                  <BookOpen size={20} color="#FFFFFF" style={{ marginRight: spacing.s }} />
                  <Text style={styles.statText}>Карточек на изучение: {dueCards}</Text>
                </View>
                <View style={styles.statRow}>
                  <CheckCircle size={20} color="#FFFFFF" style={{ marginRight: spacing.s }} />
                  <Text style={styles.statText}>Изучено сегодня: {cardsLearned}</Text>
                </View>
              </View>

              <Pressable style={styles.startButton}>
                <Text style={styles.startButtonText}>Начать изучение</Text>
                <ArrowRight size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {activeCourseId === null ? 'Мои наборы' : activeCourseTitle}
              </Text>
              <Pressable>
                <Text style={[styles.viewAllButton, { color: colors.primary }]}>Посмотреть все</Text>
              </Pressable>
            </View>

          <View style={styles.setsList}>
            {visibleSets.map((set) => {
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
                  style={[
                    styles.setCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
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
                        navigation?.navigate('SetEditor', { setId: set.id, autoFocusTitle: true });
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
                    <View
                      style={[
                        styles.progressBar,
                        { backgroundColor: colors.border },
                      ]}
                    >
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
          </>
        )}
      </ScrollView>

      {/* FAB */}
      {allSets.length > 0 && (
        <Pressable 
          style={[styles.fab, styles.fabHidden, { backgroundColor: colors.primary }]}
          onPress={() => navigation?.navigate('SetEditor', {})}
        >
          <Plus size={28} color="#FFFFFF" />
        </Pressable>
      )}

      {/* Courses Drawer - render in Modal so it stays above tab bar on all platforms */}
      <Modal
        visible={drawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCourseMenuOpen(null);
          setEditingCourseId(null);
          setIsCreatingCourse(false);
          setDrawerOpen(false);
        }}
      >
        <View style={styles.modalContainer}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: backdropColor }]}
            onPress={() => {
              setCourseMenuOpen(null);
              setEditingCourseId(null);
              setIsCreatingCourse(false);
              setDrawerOpen(false);
            }}
          />
          <View
            style={[
              styles.drawer,
              {
                backgroundColor: drawerBackground,
                borderColor: drawerBorder,
                width: Math.min(windowWidth * 0.8, 320),
                shadowOpacity: isDarkMode ? 0.35 : 0.2,
              },
            ]}
          >
            {courseMenuOpen && (
              <Pressable
                style={styles.drawerOverlay}
                onPress={() => setCourseMenuOpen(null)}
              />
            )}
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>Courses</Text>
              <Pressable style={styles.drawerIconButton} onPress={() => setDrawerOpen(false)}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.drawerBody}>
              {/* New Course Button or Input */}
              {isCreatingCourse ? (
                <View
                  style={[
                    styles.newCourseInputContainer,
                    { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.primary },
                  ]}
                >
                  <Folder size={18} color={colors.primary} />
                  <TextInput
                    ref={newCourseInputRef}
                    style={[styles.newCourseInput, { color: colors.textPrimary }]}
                    placeholder="Course name..."
                    placeholderTextColor={colors.textSecondary}
                    value={newCourseTitle}
                    onChangeText={setNewCourseTitle}
                    onBlur={handleCreateCourse}
                    onSubmitEditing={handleCreateCourse}
                    autoFocus
                  />
                </View>
              ) : (
                <Pressable
                  style={[
                    styles.newCourseButton,
                    { backgroundColor: colors.primary + '1A', borderColor: colors.primary + '33' },
                  ]}
                  onPress={() => {
                    setCourseMenuOpen(null);
                    setIsCreatingCourse(true);
                  }}
                >
                  <Plus size={18} color={colors.primary} />
                  <Text style={[styles.newCourseText, { color: colors.primary }]}>New course</Text>
                </Pressable>
              )}

              <ScrollView
                style={styles.drawerList}
                contentContainerStyle={styles.drawerListContent}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={() => setCourseMenuOpen(null)}
              >
                {/* "All" item - always shown first */}
                <Pressable
                  style={[
                    styles.courseItem,
                    activeCourseId === null
                      ? { borderLeftColor: colors.primary, backgroundColor: colors.primary + '0D' }
                      : { borderLeftColor: colors.border },
                    { borderColor: colors.border },
                  ]}
                  onPress={() => {
                    setActiveCourse(null);
                    setDrawerOpen(false);
                    setCourseMenuOpen(null);
                  }}
                >
                  <View style={styles.courseItemHeader}>
                    <View style={styles.courseItemLeft}>
                      <Library size={24} color={activeCourseId === null ? colors.primary : colors.textPrimary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.courseTitle, { color: activeCourseId === null ? colors.primary : colors.textPrimary }]}>
                          All
                        </Text>
                        {(() => {
                          const stats = getCourseStats(null);
                          return (
                            <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>
                              {stats.setCount} sets • {stats.cardCount} cards • {stats.masteredPercent}% mastered
                            </Text>
                          );
                        })()}
                      </View>
                    </View>
                  </View>
                </Pressable>

                {/* Course list */}
                {courses.map((course) => {
                  const isActive = activeCourseId === course.id;
                  const isMenuOpen = courseMenuOpen === course.id;
                  const isEditing = editingCourseId === course.id;
                  const stats = getCourseStats(course.id);

                  return (
                    <Pressable
                      key={course.id}
                      style={[
                        styles.courseItem,
                        isActive
                          ? { borderLeftColor: colors.primary, backgroundColor: colors.primary + '0D' }
                          : { borderLeftColor: colors.border },
                        { borderColor: colors.border, position: 'relative' },
                      ]}
                      onPress={() => {
                        if (!isEditing) {
                          setActiveCourse(course.id);
                          setDrawerOpen(false);
                          setCourseMenuOpen(null);
                        }
                      }}
                    >
                      <View style={styles.courseItemHeader}>
                        <View style={styles.courseItemLeft}>
                          {isActive ? (
                            <FolderOpen size={24} color={colors.primary} />
                          ) : (
                            <Folder size={24} color={colors.textPrimary} />
                          )}
                          <View style={{ flex: 1 }}>
                            {isEditing ? (
                              <View style={styles.editRow}>
                                <View
                                  style={[
                                    styles.editCourseInputContainer,
                                    { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.primary },
                                  ]}
                                >
                                  <Folder size={18} color={colors.primary} />
                                  <TextInput
                                    ref={editInputRef}
                                    style={[styles.editCourseInput, { color: colors.textPrimary }]}
                                    placeholder="Course name..."
                                    placeholderTextColor={colors.textSecondary}
                                    value={editingTitle}
                                    onChangeText={setEditingTitle}
                                    autoFocus
                                    selectTextOnFocus
                                    onSubmitEditing={() => saveCourseTitle(course.id)}
                                  />
                                </View>
                                <View style={styles.editActions}>
                                  <Pressable
                                    style={styles.iconCircle}
                                    onPress={() => saveCourseTitle(course.id)}
                                  >
                                    <CheckCircle size={18} color={colors.success} />
                                  </Pressable>
                                  <Pressable
                                    style={styles.iconCircle}
                                    onPress={cancelCourseEdit}
                                  >
                                    <X size={18} color={colors.textSecondary} />
                                  </Pressable>
                                </View>
                              </View>
                            ) : (
                              <Text style={[styles.courseTitle, { color: isActive ? colors.primary : colors.textPrimary }]}>
                                {course.title}
                              </Text>
                            )}
                            <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>
                              {stats.setCount} sets • {stats.cardCount} cards • {stats.masteredPercent}% mastered
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          style={styles.courseMoreButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            setCourseMenuOpen(isMenuOpen ? null : course.id);
                          }}
                        >
                          <MoreHorizontal size={18} color={colors.textSecondary} />
                        </Pressable>
                      </View>

                      {isMenuOpen && (
                        <View
                          style={[
                            styles.courseMenu,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                              shadowColor: colors.textPrimary,
                            },
                          ]}
                        >
                          <Pressable
                            style={({ pressed }) => [
                              styles.courseMenuItem,
                              pressed && { backgroundColor: colors.border },
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              openEditModal(course.id, course.title);
                            }}
                          >
                            <Edit2 size={16} color={colors.textPrimary} style={{ marginRight: spacing.s }} />
                            <Text style={[styles.courseMenuText, { color: colors.textPrimary }]}>Rename</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.courseMenuItem,
                              pressed && { backgroundColor: colors.border },
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDeleteCourse(course.id);
                            }}
                          >
                            <Trash2 size={16} color={colors.error} style={{ marginRight: spacing.s }} />
                            <Text style={[styles.courseMenuText, { color: colors.error }]}>Delete</Text>
                          </Pressable>
                        </View>
                      )}
                    </Pressable>
                  );
                })}

                {courses.length === 0 && (
                  <View style={styles.drawerEmpty}>
                    <Text style={[styles.drawerEmptyText, { color: colors.textSecondary }]}>
                      Create a course to organize your sets
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Course Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelCourseEdit}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={cancelCourseEdit}
        >
          <Pressable
            style={[
              styles.editModalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.textPrimary }]}>
                Rename Course
              </Text>
              <Pressable onPress={cancelCourseEdit}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View
              style={[
                styles.editModalInputContainer,
                { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.primary },
              ]}
            >
              <Folder size={20} color={colors.primary} />
              <TextInput
                ref={editModalInputRef}
                style={[styles.editModalInput, { color: colors.textPrimary }]}
                placeholder="Course name..."
                placeholderTextColor={colors.textSecondary}
                value={editingTitle}
                onChangeText={setEditingTitle}
                onSubmitEditing={() => editingCourseId && saveCourseTitle(editingCourseId)}
                autoFocus
              />
            </View>

            <View style={styles.editModalButtons}>
              <Pressable
                style={[styles.editModalButton, { backgroundColor: colors.border }]}
                onPress={cancelCourseEdit}
              >
                <Text style={[styles.editModalButtonText, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.editModalButton,
                  styles.editModalButtonPrimary,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => editingCourseId && saveCourseTitle(editingCourseId)}
              >
                <Text style={[styles.editModalButtonText, { color: '#FFFFFF' }]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Streak Modal */}
      <Modal
        visible={streakModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeStreakModal}
      >
        <View style={[styles.streakOverlay, { paddingTop: headerHeight + spacing.xl }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeStreakModal} />

          <View
            style={[
              styles.streakCard,
              {
                backgroundColor: isDarkMode ? '#12122b' : '#ffffff',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : colors.border,
                shadowOpacity: isDarkMode ? 0.35 : 0.18,
              },
            ]}
          >
            <Pressable style={styles.streakClose} onPress={closeStreakModal}>
              <Ionicons name="close" size={22} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
            </Pressable>

            {/* Section 1: Header */}
            <View style={styles.streakTop}>
              <View
                style={[
                  styles.streakTopIcon,
                  {
                    backgroundColor: isDarkMode ? 'rgba(234,88,12,0.12)' : '#FFF4E5',
                    borderColor: isDarkMode ? 'rgba(234,88,12,0.2)' : '#FED7AA',
                  },
                ]}
              >
                <Ionicons
                  name="flame"
                  size={42}
                  color={isDarkMode ? '#FBBF24' : '#EA580C'}
                  style={{ textShadowColor: 'rgba(249,115,22,0.35)', textShadowRadius: 10 }}
                />
              </View>
              <View style={styles.streakTopText}>
                <Text style={[styles.streakModeTitle, { color: colors.textPrimary }]}>
                  Ударный режим
                </Text>
                <Text style={[styles.streakModeValue, { color: colors.textPrimary }]}>
                  {formatDays(streakValue)}
                </Text>
              </View>
            </View>

            {/* Week grid */}
            <View style={styles.weekGrid}>
              {(() => {
                const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
                const today = new Date();
                const todayKey = getLocalDateKey();
                
                // Форматтер для получения YYYY-MM-DD в правильном timezone
                const dateFmt = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Bishkek',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                });
                // Определяем день недели из todayKey (надёжнее чем getDay())
                const todayParsed = new Date(todayKey + 'T12:00:00');
                const todayIndex = (todayParsed.getDay() + 6) % 7; // Пн = 0
                
                // Создаём Set дат, когда была активность (из реальных данных БД)
                const activeDates = new Set(
                  weekActivity
                    .filter(a => a.cards_studied >= 10)
                    .map(a => a.local_date)
                );
                
                return weekDays.map((day, idx) => {
                  const isToday = idx === todayIndex;
                  // Вычисляем дату для каждой ячейки
                  const dateForCell = new Date(today);
                  const diff = idx - todayIndex;
                  dateForCell.setDate(today.getDate() + diff);
                  const dayNumber = parseInt(dateFmt.format(dateForCell).split('-')[2], 10);
                  const dateKey = dateFmt.format(dateForCell); // YYYY-MM-DD в local tz
                  const isFuture = dateKey > todayKey;
                  const done = !isFuture && activeDates.has(dateKey);
                  return (
                    <View key={day} style={styles.weekItem}>
                      <Text
                        style={[
                          styles.weekLabel,
                          { color: isToday ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {day.toUpperCase()}
                      </Text>
                      <View
                        style={[
                          styles.weekCircle,
                          done
                            ? {
                                backgroundColor: isDarkMode ? colors.success : '#22c55e',
                                borderColor: 'transparent',
                              }
                            : isToday
                            ? {
                                backgroundColor: 'transparent',
                                borderColor: isDarkMode ? colors.primary : colors.primary,
                              }
                            : {
                                backgroundColor: 'transparent',
                                borderColor: isDarkMode ? 'rgba(255,255,255,0.12)' : colors.border,
                              },
                        ]}
                      >
                        {done ? (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        ) : (
                          <Text
                            style={[
                              styles.weekTodayText,
                              { color: isToday ? colors.primary : colors.textSecondary },
                            ]}
                          >
                            {dayNumber}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>

            {/* Section 3: Progress / goal */}
            <View
              style={[
                styles.goalCard,
                {
                  backgroundColor: 'transparent',
                  borderColor: 'transparent',
                },
              ]}
            >
              <View style={styles.goalHeader}>
                <View>
                  <Text style={[styles.goalLabel, { color: colors.textSecondary }]}>Карточки</Text>
                  <Text style={[styles.goalValue, { color: colors.textPrimary }]}>
                    {cardsLearned}
                    <Text style={{ color: colors.textSecondary }}>
                      /{dailyGoal}
                    </Text>
                  </Text>
                </View>
                <Text style={[styles.goalChip, { color: colors.primary }]}>Дневная цель</Text>
              </View>
              <View
                style={[
                  styles.goalBar,
                  { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : colors.border },
                ]}
              >
                <View
                  style={[
                    styles.goalBarFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${goalProgress}%`,
                    },
                  ]}
                />
              </View>
            </View>

            <Text style={[styles.streakQuote, { color: colors.textSecondary }]}>
              {streakSupportText}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
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
    gap: spacing.s,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    padding: spacing.xs,
    marginRight: spacing.s,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  badgeText: {
    fontSize: 16,
    fontWeight: '700',
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
  searchOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // top задаётся динамически
    backgroundColor: 'transparent',
    zIndex: 5,
  },

  // Content
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  viewAllButton: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty State (modern)
  emptyStateModern: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.l,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  illustrationWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationGlow: {
    position: 'absolute',
    inset: 0,
    borderRadius: 999,
    transform: [{ scale: 1.05 }],
    // @ts-ignore web blur
    filter: 'blur(32px)',
  },
  illustrationCard: {
    width: 140,
    height: 140,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  illustrationBadge: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 8,
  },
  badgeStar: { top: 4, right: 12, transform: [{ rotate: '12deg' }] },
  badgePlus: { bottom: -8, left: 10, transform: [{ rotate: '-12deg' }] },
  emptyTextBlock: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyActions: {
    width: '100%',
    gap: spacing.m,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.m,
    borderRadius: borderRadius.xl,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tipCard: {
    flexDirection: 'row',
    gap: spacing.s,
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xxs,
  },
  tipText: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Sets List
  setsList: {
    flex: 1,
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
  fabHidden: {
    display: 'none',
  },

  // Drawer
  modalContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    // Dimmed overlay under drawer; exact opacity set dynamically per theme
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    zIndex: 30,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    borderRightWidth: 1,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.l,
    paddingBottom: spacing.l,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.l,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  drawerIconButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.s,
  },
  drawerBody: {
    gap: spacing.m,
    flex: 1,
  },
  newCourseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  newCourseText: {
    fontSize: 15,
    fontWeight: '600',
  },
  newCourseInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  newCourseInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
    // @ts-ignore
    outlineStyle: 'none',
  },
  editCourseInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  editCourseInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
    // @ts-ignore
    outlineStyle: 'none',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00000009',
  },
  drawerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
  },
  drawerSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  pillRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  drawerList: {
    flex: 1,
  },
  drawerListContent: {
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  courseItem: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  courseItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flex: 1,
  },
  courseEmoji: {
    fontSize: 22,
  },
  courseTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  courseTitleInput: {
    padding: 0,
    margin: 0,
    borderBottomWidth: 1,
    minWidth: 100,
    // @ts-ignore
    outlineStyle: 'none',
  },
  courseMeta: {
    fontSize: 11,
    fontWeight: '500',
  },
  courseMoreButton: {
    padding: spacing.xs,
  },
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  courseMenu: {
    position: 'absolute',
    top: spacing.s,
    right: spacing.s,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    overflow: 'hidden',
    // @ts-ignore web shadow
    boxShadow: '0px 8px 20px rgba(0,0,0,0.12)',
    elevation: 6,
    zIndex: 10,
  },
  courseMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    minWidth: 140,
    zIndex: 11,
  },
  courseMenuText: {
    fontSize: 14,
    fontWeight: '600',
  },
  drawerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
  drawerEmptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Edit Course Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  editModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.l,
    padding: spacing.xl,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  editModalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1.5,
    marginBottom: spacing.l,
  },
  editModalInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  editModalButton: {
    flex: 1,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalButtonPrimary: {
    // Primary button styles
  },
  editModalButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },

  // Streak modal
  streakOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: spacing.l,
  },
  streakCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.xl,
    padding: spacing.l,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 12,
  },
  streakClose: {
    position: 'absolute',
    top: spacing.s,
    right: spacing.s,
    padding: spacing.xs,
    display: 'none',
  },
  streakTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.l,
  },
  streakTopIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  streakTopText: {
    flex: 1,
    gap: spacing.xs,
  },
  streakModeTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  streakModeValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weekItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weekLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  weekCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  weekTodayText: {
    fontSize: 12,
    fontWeight: '700',
  },
  goalCard: {
    borderWidth: 0,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.s,
  },
  goalLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  goalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  goalChip: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  goalBar: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  goalBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  streakQuote: {
    textAlign: 'center',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginHorizontal: spacing.m,
  },
});

/* Debug colors for layout inspection (disabled)
const debugLayers = StyleSheet.create({
  container: { backgroundColor: '#e8f5ff' },
  header: { backgroundColor: '#ffe5ec' },
  searchBar: { backgroundColor: '#fff8e1' },
  content: { backgroundColor: '#e7ffed' },
  scrollContent: { backgroundColor: '#f5e9ff' },
  summaryCard: { backgroundColor: '#e0f7fa' },
  sectionHeader: { backgroundColor: '#fff0f5' },
  emptyState: { backgroundColor: '#e3f2fd' },
  setsList: { backgroundColor: '#fef3e7' },
  setCard: { backgroundColor: '#f0fff4' },
  progressSection: { backgroundColor: '#fbeff5' },
  progressBar: { backgroundColor: '#ffe0b2' },
  fab: { backgroundColor: '#f6e0ff' },
});
*/
