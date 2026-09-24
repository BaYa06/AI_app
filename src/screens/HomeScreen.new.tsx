/**
 * Home Screen - Новый UI
 * @description Главная страница с современным дизайном
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, useWindowDimensions, TextInput as RNTextInput, Modal, Platform, Alert, Clipboard, Share, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSetsStore, useSettingsStore, useThemeColors, useCardsStore, useCoursesStore, useDiamondStore, useChallengeStore } from '@/store';
import { selectSetStats } from '@/store/cardsStore';
import { Text, DiamondReward } from '@/components/common';
import type { DiamondRewardRef } from '@/components/common';
import { StudyModeSheet, DEFAULT_STUDY_MODE_GAMES, type StudyMode } from '@/components/study/StudyModeSheet';
import { CoursesDrawer } from '@/components/home/CoursesDrawer';
import { animateDrawerTo, clampTranslateX, resolveDrawerOpen } from '@/components/home/drawerAnimation';
import ReanimatedAnimated, { useSharedValue, withTiming, withSequence, useAnimatedStyle, Easing, withDelay, runOnJS } from 'react-native-reanimated';
import { spacing, borderRadius, getDeckAccentColor } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import {
  Menu,
  Search,
  Plus,
  Calendar,
  ArrowRight,
  Library,
  Star,
  Lightbulb,
  Upload,
  MoreVertical,
  X,
  Eye,
  EyeOff,
  File,
  Folder,
  Edit2,
  Sunrise,
  Timer,
} from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { StreakService, getLocalDateKey } from '@/services/StreakService';
import { supabase } from '@/services/supabaseClient';
import { NeonService } from '@/services/NeonService';
import { DatabaseService } from '@/services/DatabaseService';
import { JoinByCodeModal } from '@/components/JoinByCodeModal';
import type { DailyActivity } from '@/services/StreakService';
import type { CardSet } from '@/types';

const StaggerCard = React.memo(function StaggerCard({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);

  useEffect(() => {
    const delay = Math.min(index, 7) * 70;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 300 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <ReanimatedAnimated.View style={animStyle}>{children}</ReanimatedAnimated.View>;
});

export function HomeScreen({ navigation }: any) {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const isDarkMode = resolvedTheme === 'dark';
  const headerBackground = isDarkMode ? 'rgba(0, 0, 0, 0)' : 'rgb(255, 255, 255)';
  const backdropColor = isDarkMode ? 'rgba(6, 8, 20, 0.65)' : 'rgba(0, 0, 0, 0.35)';
  const modalSurface = isDarkMode ? 'rgb(32, 34, 44)' : colors.surface;
  const modalBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : colors.border;
  const modalTextPrimary = isDarkMode ? '#F8FAFC' : colors.textPrimary;
  const modalTextSecondary = isDarkMode ? '#A8B3C1' : colors.textSecondary;
  const modalHandleColor = isDarkMode ? '#4b5563' : '#cbd5e1';
  const modalOverlayBg = isDarkMode ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.5)';
  const drawerBackground = isDarkMode ? '#15192f' : colors.surface;
  const drawerBorder = isDarkMode ? 'rgba(255,255,255,0.08)' : colors.border;
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = useMemo(() => Math.min(windowWidth * 0.8, 320), [windowWidth]);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const [deleteModalCourseId, setDeleteModalCourseId] = useState<string | null>(null);
  const [leaveModalCourseId, setLeaveModalCourseId] = useState<string | null>(null);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showStudyModeModal, setShowStudyModeModal] = useState(false);
  const [wordLimit, setWordLimit] = useState<'10' | '20' | '30' | 'all'>('10');
  const [onlyHard, setOnlyHard] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(true);
  const isTeacher = useSettingsStore((s) => s.isTeacher);
  const fetchIsTeacher = useSettingsStore((s) => s.fetchIsTeacher);
  const [inviteModalCourseId, setInviteModalCourseId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteJoinCode, setInviteJoinCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteRegenerating, setInviteRegenerating] = useState(false);
  const [joinByCodeVisible, setJoinByCodeVisible] = useState(false);
  const inviteBaseUrl = 'https://ai-app-seven-zeta.vercel.app';
  const [setMenuTarget, setSetMenuTarget] = useState<CardSet | null>(null);
  const editInputRef = useRef<RNTextInput>(null);
  const newCourseInputRef = useRef<RNTextInput>(null);
  const editModalInputRef = useRef<RNTextInput>(null);

  // Diamond reward animation
  const diamondRewardRef = useRef<DiamondRewardRef>(null);
  const diamondIconRef = useRef<View>(null);
  const claimBtnRef = useRef<View>(null);
  const [diamondTargetPos, setDiamondTargetPos] = useState<{ x: number; y: number } | null>(null);
  const diamonds = useDiamondStore((s) => s.diamonds);
  const addDiamonds = useDiamondStore((s) => s.addDiamonds);
  const quickRoundStatus = useChallengeStore((s) => s.quickRoundStatus);
  const claimQuickRound = useChallengeStore((s) => s.claimQuickRound);
  const diamondCountScale = useSharedValue(1);
  const diamondCountAnimStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: diamondCountScale.value }],
    };
  });

  const handleQuickRound = useCallback(() => {
    triggerHaptic('selection');
    const allSets = useSetsStore.getState().getAllSets();
    if (allSets.length === 0) {
      Alert.alert('Нет наборов', 'Сначала создай набор с карточками');
      return;
    }
    const firstSetId = allSets[0].id;

    const allCards = Object.values(useCardsStore.getState().cards);
    if (allCards.length < 4) {
      Alert.alert('Мало карточек', 'Добавь хотя бы 4 карточки чтобы играть в челлендж');
      return;
    }

    // Fisher-Yates shuffle
    const shuffled = [...allCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const selected = shuffled.slice(0, 10);
    const dueCardIds = selected.map((c) => c.id);

    navigation.navigate('MultipleChoice', {
      setId: firstSetId,
      cardLimit: selected.length,
      dueCardIds,
      challengeMode: true,
      timeLimit: 120,
    });
  }, [navigation]);

  const handleQuickRoundClaim = useCallback(() => {
    if (!claimBtnRef.current) return;
    claimBtnRef.current.measureInWindow((x, y, w, h) => {
      diamondRewardRef.current?.collect({ x: x + w / 2, y: y + h / 2 });
    });
    setTimeout(() => {
      claimQuickRound();
    }, 900);
  }, [claimQuickRound]);

  const handleSniperChallenge = useCallback(() => {
    triggerHaptic('selection');
    const allSets = useSetsStore.getState().getAllSets();
    if (allSets.length === 0) {
      Alert.alert('Нет наборов', 'Сначала создай набор с карточками');
      return;
    }
    const firstSetId = allSets[0].id;

    const allCards = Object.values(useCardsStore.getState().cards);
    if (allCards.length < 4) {
      Alert.alert('Мало карточек', 'Добавь хотя бы 4 карточки');
      return;
    }

    const shuffled = [...allCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const selected = shuffled.slice(0, 5);
    navigation.navigate('MultipleChoice', {
      setId: firstSetId,
      cardLimit: selected.length,
      dueCardIds: selected.map((c) => c.id),
      challengeMode: true,
      sniperMode: true,
    });
  }, [navigation]);

  const handleForgottenChallenge = useCallback(() => {
    triggerHaptic('selection');
    const allSets = useSetsStore.getState().getAllSets();
    if (allSets.length === 0) {
      Alert.alert('Нет наборов', 'Сначала создай набор с карточками');
      return;
    }
    const firstSetId = allSets[0].id;

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    const forgottenCards = Object.values(useCardsStore.getState().cards).filter((card) => {
      const raw = (card as any).lastReviewed ?? card.updatedAt ?? 0;
      const ms = typeof raw === 'string' ? new Date(raw).getTime() : Number(raw);
      return (now - ms) >= SEVEN_DAYS;
    });

    if (forgottenCards.length === 0) {
      Alert.alert('Всё свежо! \uD83C\uDF89', 'Нет забытых карточек — ты недавно всё повторил');
      return;
    }
    if (forgottenCards.length < 4) {
      Alert.alert('Мало карточек', 'Нужно минимум 4 забытых карточки для игры');
      return;
    }

    const shuffled = [...forgottenCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const selected = shuffled.slice(0, 3);
    navigation.navigate('MultipleChoice', {
      setId: firstSetId,
      cardLimit: selected.length,
      dueCardIds: selected.map((c) => c.id),
      challengeMode: true,
      forgottenMode: true,
    });
  }, [navigation]);

  const handleDiamondRewardComplete = useCallback(() => {
    addDiamonds(10);
    diamondCountScale.value = withSequence(
      withTiming(1.3, { duration: 150, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 150, easing: Easing.inOut(Easing.quad) }),
    );
  }, []);

  // Drawer slide — translateX это единственный источник правды для позиции панели.
  // Пишется либо жестом напрямую на UI-потоке (edge-swipe открытия здесь, drag-to-close
  // внутри CoursesDrawer), либо этим эффектом при программном открытии/закрытии (таб по
  // гамбургеру, крестик, тап по подложке, выбор курса и т.д. — все они просто меняют
  // drawerOpen как раньше, эффект ниже лишь переводит это в пружинную анимацию).
  const drawerTranslateX = useSharedValue(-drawerWidth);
  const drawerGestureStartX = useSharedValue(-drawerWidth);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const isGestureDrivenDrawerChange = useRef(false);

  const handleDrawerGestureSettled = useCallback((open: boolean) => {
    isGestureDrivenDrawerChange.current = true;
    setDrawerOpen(open);
    if (!open) setDrawerMounted(false);
  }, []);

  useEffect(() => {
    if (isGestureDrivenDrawerChange.current) {
      // Уже анимировано и доведено самим жестом — эффекту делать нечего.
      isGestureDrivenDrawerChange.current = false;
      return;
    }
    if (drawerOpen) {
      setDrawerMounted(true);
      animateDrawerTo(drawerTranslateX, true, drawerWidth, () => {});
    } else {
      animateDrawerTo(drawerTranslateX, false, drawerWidth, (open) => {
        if (!open) setDrawerMounted(false);
      });
    }
  }, [drawerOpen, drawerWidth, drawerTranslateX]);

  // Шторка — это отдельный <Modal>. Если открыть другой Modal, пока она ещё закрывается,
  // iOS презентует его поверх шторки, а при её размонтировании новое окно пропадает вместе
  // с ней, оставляя невидимый слой, который глотает все нажатия. Поэтому окна, открываемые
  // из шторки, показываем только после её полного размонтирования.
  const afterDrawerClosedRef = useRef<(() => void) | null>(null);
  const runAfterDrawerClosed = useCallback((fn: () => void) => {
    if (!drawerMounted) {
      fn();
      return;
    }
    afterDrawerClosedRef.current = fn;
    setDrawerOpen(false);
  }, [drawerMounted]);

  useEffect(() => {
    if (drawerMounted || !afterDrawerClosedRef.current) return;
    const fn = afterDrawerClosedRef.current;
    afterDrawerClosedRef.current = null;
    // Кадр запаса, чтобы iOS успел закончить dismiss контроллера шторки
    const t = setTimeout(fn, 50);
    return () => clearTimeout(t);
  }, [drawerMounted]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? null);
    });
  }, []);

  // Перезагружаем isTeacher при каждом возврате на Home, а не один раз за сессию —
  // роль могла поменяться (например, вручную в БД) пока приложение было свёрнуто.
  useFocusEffect(
    useCallback(() => {
      if (currentUserId) {
        fetchIsTeacher(currentUserId);
      }
    }, [currentUserId, fetchIsTeacher])
  );

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

  // Sets store
  const allSets = useSetsStore((s) => s.getAllSets());
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
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
  const todayGoalReached = cardsLearned >= DAILY_GOAL;
  const goalProgress = useMemo(() => {
    if (!dailyGoal) return 0;
    return Math.min(100, Math.round((cardsLearned / dailyGoal) * 100));
  }, [dailyGoal, cardsLearned]);
  const streakSupportText = useMemo(() => {
    const remaining = Math.max(dailyGoal - cardsLearned, 0);
    if (goalProgress >= 10) {
      return `Отлично! Цель на сегодня выполнена — ${cardsLearned} из ${dailyGoal}. Серия продлена!`;
    }
    if (goalProgress === 0) {
      return `Главное — не идеальность, а привычка. Открой на минуту, выучи одно слово — и ты уже впереди. Цель: ${dailyGoal}`;
    }
    if (remaining <= 3) {
      return `Осталось всего ${remaining} — ты почти у цели! Ещё чуть-чуть и серия продлена.`;
    }
    return `Хорошее начало! Осталось ${remaining} слов до цели. Продолжай в том же духе!`;
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

  // Свайп по всему экрану влево/вправо — переключение курса (не связано с drawer).
  // Отключается, пока открыт drawer, и уступает приоритет edgeOpenGesture у левого края
  // экрана (см. Gesture.Exclusive ниже) — иначе свайп вправо от самого края одновременно
  // и открывал бы панель, и листал курс.
  const courseSwitchGesture = Gesture.Pan()
    .enabled(!drawerOpen)
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD && Math.abs(e.velocityX) > SWIPE_VELOCITY) {
        if (e.translationX < 0) {
          runOnJS(switchCourseByStep)(1); // swipe left -> next course
        } else {
          runOnJS(switchCourseByStep)(-1); // swipe right -> previous course
        }
      }
    });

  // Edge-swipe открытия drawer: жест ловится только у левых ~20px экрана (hitSlop),
  // работает с любого места по вертикали. translateX двигается 1:1 с пальцем на UI-потоке —
  // ни одного React re-render за время перетаскивания.
  const EDGE_WIDTH = 20;
  const edgeOpenGesture = Gesture.Pan()
    .enabled(!drawerOpen)
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(10)
    .failOffsetY([-15, 15])
    .onBegin(() => {
      drawerGestureStartX.value = drawerTranslateX.value;
      runOnJS(setDrawerMounted)(true);
    })
    .onUpdate((e) => {
      drawerTranslateX.value = clampTranslateX(drawerGestureStartX.value + e.translationX, drawerWidth);
    })
    .onEnd((e) => {
      const open = resolveDrawerOpen(drawerTranslateX.value, e.velocityX, drawerWidth);
      animateDrawerTo(drawerTranslateX, open, drawerWidth, handleDrawerGestureSettled);
    });

  const rootGesture = Gesture.Exclusive(edgeOpenGesture, courseSwitchGesture);

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
  
  const safeBottomPad = 0; // убираем нижний safe-area/паддинг
  const TAB_BAR_HEIGHT = 46;

  // Базовый стиль нижней навигации (должен совпадать с AppNavigator)
  const baseTabBarStyle = useMemo(
    () => ({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingBottom: safeBottomPad,
      paddingTop: 6,
      height: TAB_BAR_HEIGHT,
      marginBottom: 20,
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
  
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const updateSet = useSetsStore((s) => s.updateSet);
  const deleteSet = useSetsStore((s) => s.deleteSet);
  const addSet = useSetsStore((s) => s.addSet);
  const deleteCardsBySet = useCardsStore((s) => s.deleteCardsBySet);

  const handleToggleSetHidden = useCallback(async (set: CardSet) => {
    const newHidden = !set.isHiddenFromStudents;
    updateSet(set.id, { isHiddenFromStudents: newHidden });
    setSetMenuTarget(null);
    try {
      await NeonService.toggleSetHiddenFromStudents(set.id, newHidden);
    } catch {
      updateSet(set.id, { isHiddenFromStudents: !newHidden });
      Alert.alert('Ошибка', 'Не удалось изменить видимость набора');
    }
  }, [updateSet]);

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

  // Вычисляем карточки на сегодня (reviewCount и newCount — одно и то же значение dueCount)
  const dueCards = filteredSets.reduce((sum, set) => sum + (set.reviewCount || 0), 0);
  
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

  const formatSetWord = useCallback((count: number) => {
    if (count === 1) return 'набор';
    if (count >= 2 && count <= 4) return 'набора';
    return 'наборов';
  }, []);

  // Colбэки для CoursesDrawer — логика 1:1 перенесена из прежних инлайн-обработчиков,
  // трогать поведение не нужно, меняется только то, что оно теперь живёт в пропсах.
  const handleToggleCourseMenu = useCallback((id: string) => {
    setCourseMenuOpen((prev) => (prev === id ? null : id));
  }, []);

  const handleDismissCourseMenu = useCallback(() => setCourseMenuOpen(null), []);

  const handleSelectCourse = useCallback(
    (id: string | null) => {
      setActiveCourse(id);
      setDrawerOpen(false);
      setCourseMenuOpen(null);
    },
    [setActiveCourse]
  );

  const handleStartCreatingCourse = useCallback(() => {
    setCourseMenuOpen(null);
    setIsCreatingCourse(true);
  }, []);

  const handleJoinByCodePress = useCallback(() => {
    setCourseMenuOpen(null);
    runAfterDrawerClosed(() => setJoinByCodeVisible(true));
  }, [runAfterDrawerClosed]);

  const handleDrawerBackdropPress = useCallback(() => {
    if (courseMenuOpen) {
      setCourseMenuOpen(null);
    } else {
      setCourseMenuOpen(null);
      setEditingCourseId(null);
      setIsCreatingCourse(false);
      setDrawerOpen(false);
    }
  }, [courseMenuOpen]);

  const handleDrawerRequestClose = useCallback(() => {
    setCourseMenuOpen(null);
    setEditingCourseId(null);
    setIsCreatingCourse(false);
    setDrawerOpen(false);
  }, []);

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

  const deleteModalCourse = useMemo(
    () => courses.find((c) => c.id === deleteModalCourseId) || null,
    [courses, deleteModalCourseId]
  );

  const deleteModalStats = useMemo(
    () => (deleteModalCourseId ? getCourseStats(deleteModalCourseId) : null),
    [deleteModalCourseId, getCourseStats]
  );

  const deleteModalHasSets = deleteModalStats ? deleteModalStats.setCount > 0 : false;

  const deleteModalMessage = useMemo(() => {
    if (!deleteModalCourse || !deleteModalStats) return '';
    if (deleteModalHasSets) {
      const setWord = formatSetWord(deleteModalStats.setCount);
      return `В курсе "${deleteModalCourse.title}" ${deleteModalStats.setCount} ${setWord}. Переместите наборы в другие курсы или удалите их.`;
    }
    return `Удалить курс "${deleteModalCourse.title}"?`;
  }, [deleteModalCourse, deleteModalHasSets, deleteModalStats, formatSetWord]);

  const openInviteModal = useCallback(async (courseId: string) => {
    setCourseMenuOpen(null);
    setInviteCopied(false);
    setInviteToken(null);
    setInviteJoinCode(null);
    setInviteModalCourseId(courseId);
    setInviteLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) {
        const result = await NeonService.createCourseInvite(courseId, userId);
        setInviteToken(result?.token ?? null);
        setInviteJoinCode(result?.joinCode ?? null);
      }
    } catch (error) {
      console.error('Failed to create invite:', error);
    } finally {
      setInviteLoading(false);
    }
  }, []);

  const closeInviteModal = useCallback(() => {
    setInviteModalCourseId(null);
    setInviteCopied(false);
    setInviteToken(null);
    setInviteJoinCode(null);
  }, []);

  const handleRegenerateInvite = useCallback(() => {
    if (!inviteModalCourseId) return;
    Alert.alert(
      'Обновить код приглашения?',
      'Старые ссылка и код перестанут работать — ученики, у которых они есть, больше не смогут по ним присоединиться.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Обновить',
          style: 'destructive',
          onPress: async () => {
            setInviteRegenerating(true);
            setInviteCopied(false);
            try {
              const result = await NeonService.regenerateCourseInvite(inviteModalCourseId);
              if (result) {
                setInviteToken(result.token);
                setInviteJoinCode(result.joinCode);
              } else {
                Alert.alert('Ошибка', 'Не удалось обновить код приглашения');
              }
            } finally {
              setInviteRegenerating(false);
            }
          },
        },
      ]
    );
  }, [inviteModalCourseId]);

  // Обработка удаления курса через модальное окно
  const openDeleteModal = useCallback((courseId: string) => {
    setCourseMenuOpen(null);
    runAfterDrawerClosed(() => setDeleteModalCourseId(courseId));
  }, [runAfterDrawerClosed]);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalCourseId(null);
  }, []);

  const confirmDeleteCourse = useCallback(() => {
    if (!deleteModalCourseId) return;
    const stats = getCourseStats(deleteModalCourseId);
    if (stats.setCount > 0) return;

    deleteCourse(deleteModalCourseId);
    setDeleteModalCourseId(null);
  }, [deleteModalCourseId, deleteCourse, getCourseStats]);

  const removeLocalCourse = useCoursesStore((s) => s.removeLocalCourse);

  const handleLeaveCourse = useCallback(async () => {
    if (!leaveModalCourseId) return;
    setLeaveLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return;

      const success = await NeonService.leaveStudentCourse(leaveModalCourseId, userId);
      if (success) {
        removeLocalCourse(leaveModalCourseId);
        setLeaveModalCourseId(null);
      } else {
        Alert.alert('Ошибка', 'Не удалось выйти из курса. Попробуйте ещё раз.');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось выйти из курса.');
    } finally {
      setLeaveLoading(false);
    }
  }, [leaveModalCourseId, removeLocalCourse]);

  const handleStartStudyMode = useCallback((mode: 'classic' | 'match' | 'multipleChoice' | 'wordBuilder' | 'audio') => {
    setShowStudyModeModal(false);

    // Collect cards across ALL sets in the active course — due-only when "Только «Не запомнил»"
    // is on, otherwise every card in the course (mirrors SetDetailScreen's getShuffledDueCardIds)
    const now = Date.now();
    const state = useCardsStore.getState();
    const allCardIds: string[] = [];
    for (const set of filteredSets) {
      const cardIds = state.cardsBySet[set.id] || [];
      for (const id of cardIds) {
        const card = state.cards[id];
        if (card && (!onlyHard || card.nextReviewDate <= now)) {
          allCardIds.push(id);
        }
      }
    }

    if (allCardIds.length === 0) return;

    // Shuffle all cards — pass ALL to dueCardIds, use cardLimit for batch size
    const shuffled = [...allCardIds].sort(() => Math.random() - 0.5);
    const dueCardIds = shuffled;
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);

    // Use the first card's setId for backward compatibility (results screen, etc.)
    const firstCard = state.cards[dueCardIds[0]];
    const setId = firstCard?.setId || filteredSets[0]?.id;
    if (!setId) return;

    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalCards = dueCardIds.length;
    const rootNav = navigation?.getParent?.() ?? navigation;

    switch (mode) {
      case 'classic':
        rootNav?.navigate('Study', { setId, mode: 'classic', studyAll: true, onlyHard, cardLimit: limit, dueCardIds, phaseId, totalPhaseCards: totalCards, studiedInPhase: 0, phaseOffset: 0 });
        break;
      case 'match':
        rootNav?.navigate('Match', { setId, cardLimit: limit, dueCardIds, phaseId, totalPhaseCards: totalCards, studiedInPhase: 0, phaseOffset: 0 });
        break;
      case 'multipleChoice':
        rootNav?.navigate('MultipleChoice', { setId, cardLimit: limit, dueCardIds, questionIndex: 1, totalQuestions: totalCards, phaseId, totalPhaseCards: totalCards, studiedInPhase: 0, phaseOffset: 0 });
        break;
      case 'wordBuilder':
        rootNav?.navigate('WordBuilder', { setId, cardLimit: limit, dueCardIds, phaseId, totalPhaseCards: totalCards, studiedInPhase: 0, phaseOffset: 0 });
        break;
      case 'audio':
        rootNav?.navigate('AudioLearning', { setId, cardLimit: limit, dueCardIds, phaseId, totalPhaseCards: totalCards, studiedInPhase: 0, phaseOffset: 0 });
        break;
    }
  }, [filteredSets, navigation, wordLimit, onlyHard]);

  // Fill in the Blank требует одного конкретного набора (setId), а Home агрегирует карточки
  // сразу по всем наборам курса — поэтому этот режим здесь не предлагается (см. games ниже).
  const handleSelectStudyMode = useCallback(
    (mode: StudyMode) => {
      if (mode === 'contextFill') return;
      handleStartStudyMode(mode);
    },
    [handleStartStudyMode]
  );

  const homeStudyModeGames = useMemo(
    () => DEFAULT_STUDY_MODE_GAMES.filter((game) => game.mode !== 'contextFill'),
    []
  );

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
    runAfterDrawerClosed(() => setIsEditModalVisible(true));
  }, [runAfterDrawerClosed]);

  return (
    <GestureDetector gesture={rootGesture}>
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
        ]}
      >
      {/* Header */}
      <View
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
              <Ionicons name="flame" size={24} color={todayGoalReached ? (isDarkMode ? '#FBBF24' : '#EA580C') : (isDarkMode ? '#6B7280' : '#9CA3AF')} />
              <Text style={[styles.badgeText, { color: todayGoalReached ? (isDarkMode ? '#FDE68A' : '#C2410C') : (isDarkMode ? '#9CA3AF' : '#6B7280') }]}>
                {formatDays(streakValue)}
              </Text>
            </Pressable>

            <View
              ref={diamondIconRef}
              style={styles.badge}
              onLayout={() => {
                diamondIconRef.current?.measureInWindow((x, y, w, h) => {
                  setDiamondTargetPos({ x: x + w / 2, y: y + h / 2 });
                });
              }}
            >
              <Ionicons name="diamond" size={24} color={isDarkMode ? '#A5B4FC' : '#4F46E5'} />
              <ReanimatedAnimated.View style={diamondCountAnimStyle}>
                <Text style={[styles.badgeText, { color: isDarkMode ? '#E0E7FF' : '#312E81' }]}>
                  {totalMastered + diamonds}
                </Text>
              </ReanimatedAnimated.View>
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
            style={styles.addButton}
            onPress={() => { triggerHaptic('selection'); navigation?.navigate('SetEditor', {}); }}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      {searchVisible && (
        <View style={[styles.searchBar, { backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
            placeholder="Поиск по наборам..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      {/*
        Обёртка занимает всё оставшееся место под header/searchBar через обычный flex —
        оверлей закрытия поиска покрывает именно и только эту область (StyleSheet.absoluteFillObject
        относительно неё), без ручного вычисления пиксельных отступов через onLayout/useState
        (это раньше вызывало заметный "прыжок" контента после первого измерения).
      */}
      <View style={styles.body}>
        {/* Overlay to close search when tapping outside */}
        {searchVisible && (
          <Pressable style={styles.searchOverlay} onPress={() => setSearchVisible(false)} />
        )}

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
        {visibleSets.length === 0 ? (
          <View style={styles.emptyStateModern}>
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
            {isTeacher === null ? null : isTeacher ? (
              /* Teacher Mode Banner */
              <View style={{ paddingHorizontal: spacing.m, paddingTop: spacing.m, paddingBottom: spacing.s }}>
                <Pressable
                  style={styles.teacherBanner}
                  onPress={() => {
                    const ownCourses = courses.filter(c => !c.isStudentCourse);
                    const targetCourse = ownCourses.find(c => c.id === activeCourseId) ?? ownCourses[0];

                    if (!targetCourse) {
                      Alert.alert('Нет курсов', 'Сначала создайте курс, чтобы открыть статистику учителя.');
                      return;
                    }

                    const rootNav = navigation?.getParent?.() ?? navigation;
                    rootNav?.navigate('TeacherCourseStats', {
                      courseId: targetCourse.id,
                      courseTitle: targetCourse.title || 'Курс',
                    });
                  }}
                >
                  <View style={styles.teacherBannerLeft}>
                    <View style={styles.teacherBannerIcon}>
                      <Ionicons name="school-outline" size={22} color="#FFFFFF" />
                    </View>
                    <View>
                      <Text style={styles.teacherBannerTitle}>Teacher Mode</Text>
                      <Text style={styles.teacherBannerSubtitle}>Manage students & sets</Text>
                    </View>
                  </View>
                  <View style={styles.teacherBannerButton}>
                    <Text style={styles.teacherBannerButtonText}>My Classes →</Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              /* Challenges Section */
              <View style={styles.challengesSection}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.challengesScrollContent}
                  snapToInterval={136 + 12}
                  decelerationRate="fast"
                >
                  {/* Challenge 1 — Быстрый раунд */}
                  {quickRoundStatus === 'pending' ? (
                    <Pressable style={[styles.challengeCard, { backgroundColor: '#7C3AED' }]} onPress={handleQuickRound}>
                      <Text style={styles.challengeTitle}>Быстрый раунд ⚡</Text>
                      <View style={styles.challengeBadge}>
                        <Text style={styles.challengeBadgeText}>Новинка ⚡</Text>
                      </View>
                      <View style={styles.challengeProgressContainer}>
                        <View style={styles.challengeRingWrapper}>
                          <Svg width={64} height={64} style={{ transform: [{ rotate: '-90deg' }] }}>
                            <SvgCircle cx={32} cy={32} r={28} stroke="rgba(255,255,255,0.2)" strokeWidth={4} fill="transparent" />
                            <SvgCircle cx={32} cy={32} r={28} stroke="#FFFFFF" strokeWidth={4} fill="transparent" strokeDasharray={175.9} strokeDashoffset={175.9} strokeLinecap="round" />
                          </Svg>
                          <View style={styles.challengeIconOverlay}>
                            <Sunrise size={28} color="#FFFFFF" />
                          </View>
                        </View>
                        <Text style={styles.challengeProgressText}>0 из 3</Text>
                      </View>
                    </Pressable>
                  ) : quickRoundStatus === 'completed' ? (
                    <View style={[styles.challengeCard, styles.challengeCardCompleted]}>
                      <Text style={styles.challengeTitle}>Быстрый раунд ⚡</Text>
                      <View style={styles.challengeBadgeCompleted}>
                        <Text style={styles.challengeBadgeTextCompleted}>Выполнено ✓</Text>
                      </View>
                      <View style={styles.challengeProgressContainer}>
                        <View style={styles.challengeRingWrapper}>
                          <Svg width={64} height={64} style={{ transform: [{ rotate: '-90deg' }] }}>
                            <SvgCircle cx={32} cy={32} r={28} stroke="rgba(255,255,255,0.15)" strokeWidth={4} fill="transparent" />
                            <SvgCircle cx={32} cy={32} r={28} stroke="#FFFFFF" strokeWidth={4} fill="transparent" strokeDasharray={175.9} strokeDashoffset={0} strokeLinecap="round" />
                          </Svg>
                          <View style={styles.challengeIconOverlay}>
                            <Ionicons name="checkmark-circle" size={32} color="#FFFFFF" />
                          </View>
                        </View>
                      </View>
                      <Pressable ref={claimBtnRef} style={styles.challengeClaimButton} onPress={handleQuickRoundClaim}>
                        <Text style={styles.challengeClaimText}>Забрать</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={[styles.challengeCard, styles.challengeCardClaimed]}>
                      <Text style={[styles.challengeTitle, { opacity: 0.5 }]}>Быстрый раунд ⚡</Text>
                      <View style={styles.challengeBadgeClaimed}>
                        <Text style={styles.challengeBadgeTextClaimed}>Получено ✓</Text>
                      </View>
                      <View style={styles.challengeProgressContainer}>
                        <View style={styles.challengeRingWrapper}>
                          <Svg width={64} height={64} style={{ transform: [{ rotate: '-90deg' }] }}>
                            <SvgCircle cx={32} cy={32} r={28} stroke="rgba(255,255,255,0.1)" strokeWidth={4} fill="transparent" />
                            <SvgCircle cx={32} cy={32} r={28} stroke="rgba(255,255,255,0.35)" strokeWidth={4} fill="transparent" strokeDasharray={175.9} strokeDashoffset={0} strokeLinecap="round" />
                          </Svg>
                          <View style={styles.challengeIconOverlay}>
                            <Ionicons name="checkmark-circle" size={32} color="rgba(255,255,255,0.4)" />
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Challenge 2 — Снайпер */}
                  <Pressable style={[styles.challengeCard, { backgroundColor: '#7C3AED' }]} onPress={handleSniperChallenge}>
                    <Text style={styles.challengeTitle}>Снайпер 🎯</Text>
                    <View style={styles.challengeBadge}>
                      <Text style={styles.challengeBadgeText}>5 подряд</Text>
                    </View>
                    <View style={styles.challengeProgressContainer}>
                      <View style={styles.challengeRingWrapper}>
                        <Svg width={64} height={64} style={{ transform: [{ rotate: '-90deg' }] }}>
                          <SvgCircle cx={32} cy={32} r={28} stroke="rgba(255,255,255,0.2)" strokeWidth={4} fill="transparent" />
                          <SvgCircle cx={32} cy={32} r={28} stroke="#FFFFFF" strokeWidth={4} fill="transparent" strokeDasharray={175.9} strokeDashoffset={175.9} strokeLinecap="round" />
                        </Svg>
                        <View style={styles.challengeIconOverlay}>
                          <Ionicons name="flame-outline" size={28} color="#FFFFFF" />
                        </View>
                      </View>
                    </View>
                  </Pressable>

                  {/* Challenge 3 — Вспомни забытое */}
                  <Pressable style={[styles.challengeCard, { backgroundColor: '#7C3AED' }]} onPress={handleForgottenChallenge}>
                    <Text style={styles.challengeTitle}>Вспомни забытое 🧠</Text>
                    <View style={styles.challengeBadge}>
                      <Text style={styles.challengeBadgeText}>7+ дней</Text>
                    </View>
                    <View style={styles.challengeProgressContainer}>
                      <View style={styles.challengeRingWrapper}>
                        <Svg width={64} height={64} style={{ transform: [{ rotate: '-90deg' }] }}>
                          <SvgCircle cx={32} cy={32} r={28} stroke="rgba(255,255,255,0.2)" strokeWidth={4} fill="transparent" />
                          <SvgCircle cx={32} cy={32} r={28} stroke="#FFFFFF" strokeWidth={4} fill="transparent" strokeDasharray={175.9} strokeDashoffset={175.9} strokeLinecap="round" />
                        </Svg>
                        <View style={styles.challengeIconOverlay}>
                          <Ionicons name="time-outline" size={28} color="#FFFFFF" />
                        </View>
                      </View>
                    </View>
                  </Pressable>
                </ScrollView>

                <View style={styles.allChallengesButtonContainer}>
                  <Pressable style={styles.allChallengesButton} onPress={() => setShowStudyModeModal(true)}>
                    <Text style={styles.allChallengesButtonText}>Учить все карточки</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {activeCourseId === null ? 'Мои наборы' : activeCourseTitle}
              </Text>
              {!isTeacher && (
                <Pressable onPress={() => navigation.navigate('TestJoin')}>
                  <Text style={[styles.viewAllButton, { color: colors.primary }]}>
                    Подключиться к тесту
                  </Text>
                </Pressable>
              )}
            </View>

          <View style={styles.setsList}>
            {visibleSets.map((set, index) => {
              const progress = set.cardCount > 0 ? Math.round(((set.masteredCount || 0) / set.cardCount) * 100) : 0;
              const accentColor = getDeckAccentColor(set.id || index);
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
                <StaggerCard key={set.id} index={index}>
                <Pressable
                  style={[
                    styles.setCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  onPress={() => { triggerHaptic('selection'); navigation?.navigate('SetDetail', { setId: set.id }); }}
                >
                  {/* Header with icon, title, status dot, and button */}
                  <View style={styles.setCardHeader}>
                    <View style={styles.setCardLeft}>
                      {/* Date Icon */}
                      <View style={[styles.dateIcon, { backgroundColor: accentColor }]}>
                        <Text style={[styles.dateMonth, { color: 'rgba(255,255,255,0.8)' }]}>{dateDisplay.month}</Text>
                        <Text style={[styles.dateDay, { color: '#FFFFFF' }]}>{dateDisplay.day}</Text>
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
                        {set.isHiddenFromStudents && set.courseId && isTeacher && (
                          <View style={styles.hiddenBadge}>
                            <EyeOff size={12} color={colors.textSecondary} />
                            <Text style={[styles.hiddenBadgeText, { color: colors.textSecondary }]}>
                              Скрыто
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* More Menu */}
                    <Pressable
                      style={styles.moreButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (set.courseId && isTeacher) {
                          setSetMenuTarget(set);
                        } else {
                          navigation?.navigate('SetEditor', { setId: set.id, autoFocusTitle: true });
                        }
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
                            backgroundColor: getStatusColor(),
                            width: `${progress}%`
                          }
                        ]}
                      />
                    </View>
                  </View>
                </Pressable>
                </StaggerCard>
              );
            })}
          </View>
          </>
        )}
        </ScrollView>
      </View>

      {/* FAB */}
      {allSets.length > 0 && (
        <Pressable 
          style={[styles.fab, styles.fabHidden, { backgroundColor: colors.primary }]}
          onPress={() => { triggerHaptic('selection'); navigation?.navigate('SetEditor', {}); }}
        >
          <Plus size={28} color="#FFFFFF" />
        </Pressable>
      )}

      <CoursesDrawer
        mounted={drawerMounted}
        translateX={drawerTranslateX}
        drawerWidth={drawerWidth}
        onGestureSettled={handleDrawerGestureSettled}
        colors={colors}
        isDarkMode={isDarkMode}
        drawerBackground={drawerBackground}
        drawerBorder={drawerBorder}
        backdropColor={backdropColor}
        insets={insets}
        courses={courses}
        activeCourseId={activeCourseId}
        isTeacher={isTeacher}
        getCourseStats={getCourseStats}
        courseMenuOpen={courseMenuOpen}
        onToggleCourseMenu={handleToggleCourseMenu}
        onDismissCourseMenu={handleDismissCourseMenu}
        editingCourseId={editingCourseId}
        editingTitle={editingTitle}
        onChangeEditingTitle={setEditingTitle}
        onSaveEditingTitle={saveCourseTitle}
        onCancelEditingTitle={cancelCourseEdit}
        editInputRef={editInputRef}
        isCreatingCourse={isCreatingCourse}
        newCourseTitle={newCourseTitle}
        onChangeNewCourseTitle={setNewCourseTitle}
        onStartCreatingCourse={handleStartCreatingCourse}
        onSubmitNewCourse={handleCreateCourse}
        newCourseInputRef={newCourseInputRef}
        onSelectCourse={handleSelectCourse}
        onJoinByCode={handleJoinByCodePress}
        onOpenInvite={openInviteModal}
        onOpenEditModal={openEditModal}
        onOpenDeleteModal={openDeleteModal}
        onOpenLeaveModal={setLeaveModalCourseId}
        onBackdropPress={handleDrawerBackdropPress}
        onRequestClose={handleDrawerRequestClose}
      />

      {/* Edit Course Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelCourseEdit}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: modalOverlayBg }]}
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
                { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.border },
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

      {/* Delete Course Modal */}
      <Modal
        visible={deleteModalCourseId !== null}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <Pressable style={[styles.modalOverlay, { backgroundColor: modalOverlayBg }]} onPress={closeDeleteModal}>
          <Pressable
            style={[
              styles.editModalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.textPrimary }]}>
                Удаление курса
              </Text>
              <Pressable onPress={closeDeleteModal}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.deleteModalMessage, { color: colors.textPrimary }]}>
              {deleteModalMessage}
            </Text>
            {deleteModalHasSets && (
              <Text style={[styles.deleteModalWarning, { color: colors.warning }]}>
                Удаление недоступно: сначала переместите наборы.
              </Text>
            )}

            <View style={styles.editModalButtons}>
              <Pressable
                style={[styles.editModalButton, { backgroundColor: colors.border }]}
                onPress={closeDeleteModal}
              >
                <Text style={[styles.editModalButtonText, { color: colors.textSecondary }]}>
                  Отмена
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.editModalButton,
                  styles.deleteModalButton,
                  deleteModalHasSets
                    ? { backgroundColor: colors.border }
                    : { backgroundColor: colors.error },
                ]}
                onPress={confirmDeleteCourse}
                disabled={deleteModalHasSets}
              >
                <Text
                  style={[
                    styles.editModalButtonText,
                    deleteModalHasSets
                      ? { color: colors.textSecondary }
                      : { color: '#FFFFFF' },
                  ]}
                >
                  Удалить
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Leave Course Modal */}
      <Modal
        visible={leaveModalCourseId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveModalCourseId(null)}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: modalOverlayBg }]}
          onPress={() => !leaveLoading && setLeaveModalCourseId(null)}
        >
          <Pressable
            style={[styles.editModalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.textPrimary }]}>
                Выйти из курса?
              </Text>
              <Pressable onPress={() => setLeaveModalCourseId(null)} disabled={leaveLoading}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.deleteModalMessage, { color: colors.textPrimary }]}>
              {(() => {
                const c = courses.find(c => c.id === leaveModalCourseId);
                return `Вы покинете курс "${c?.title ?? ''}" и потеряете доступ ко всем его материалам.`;
              })()}
            </Text>

            <View style={styles.editModalButtons}>
              <Pressable
                style={[styles.editModalButton, { backgroundColor: colors.border }]}
                onPress={() => setLeaveModalCourseId(null)}
                disabled={leaveLoading}
              >
                <Text style={[styles.editModalButtonText, { color: colors.textSecondary }]}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.editModalButton, { backgroundColor: colors.error }]}
                onPress={handleLeaveCourse}
                disabled={leaveLoading}
              >
                {leaveLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.editModalButtonText, { color: '#FFFFFF' }]}>Выйти</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Invite Students Modal */}
      <Modal
        visible={inviteModalCourseId !== null}
        transparent
        animationType="fade"
        onRequestClose={closeInviteModal}
      >
        <Pressable style={[styles.modalOverlay, { backgroundColor: modalOverlayBg }]} onPress={closeInviteModal}>
          <Pressable
            style={[
              styles.editModalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.textPrimary }]}>Пригласить учеников</Text>
              <Pressable onPress={closeInviteModal}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.inviteDescription, { color: colors.textSecondary }]}>
              Поделитесь ссылкой или кодом — ученики смогут присоединиться к курсу.
            </Text>

            {inviteLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.m }} />
            ) : inviteToken ? (
              <>
                {/* Код курса */}
                {inviteJoinCode && (
                  <View style={{ marginBottom: spacing.m }}>
                    <Text style={[styles.inviteDescription, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                      Код курса
                    </Text>
                    <Pressable
                      style={[
                        styles.inviteLinkBox,
                        { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.primary + '55', alignItems: 'center' },
                      ]}
                      onPress={() => {
                        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(inviteJoinCode);
                        } else {
                          Clipboard.setString(inviteJoinCode);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 8, color: colors.primary }}>
                        {inviteJoinCode}
                      </Text>
                    </Pressable>
                  </View>
                )}

                <Pressable
                  style={[
                    styles.inviteLinkBox,
                    { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.border },
                  ]}
                  onLongPress={() => {
                    const link = `${inviteBaseUrl}/join/${inviteToken}`;
                    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(link);
                    } else {
                      Clipboard.setString(link);
                    }
                    setInviteCopied(true);
                  }}
                >
                  <Text
                    style={[styles.inviteLinkText, { color: colors.primary }]}
                    numberOfLines={1}
                    selectable
                  >
                    {`${inviteBaseUrl}/join/${inviteToken}`}
                  </Text>
                </Pressable>

                <View style={{ flexDirection: 'row', gap: spacing.s, width: '100%' }}>
                  <Pressable
                    style={[
                      styles.editModalButton,
                      styles.editModalButtonPrimary,
                      inviteCopied
                        ? { backgroundColor: colors.success ?? '#10B981', flex: 1 }
                        : { backgroundColor: colors.primary, flex: 1 },
                    ]}
                    onPress={() => {
                      const link = `${inviteBaseUrl}/join/${inviteToken}`;
                      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(link);
                      } else {
                        Clipboard.setString(link);
                      }
                      setInviteCopied(true);
                    }}
                  >
                    <Text style={[styles.editModalButtonText, { color: '#FFFFFF' }]}>
                      {inviteCopied ? '✓ Скопировано' : 'Копировать'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.editModalButton,
                      styles.editModalButtonPrimary,
                      { backgroundColor: colors.primary, flex: 1 },
                    ]}
                    onPress={async () => {
                      const link = `${inviteBaseUrl}/join/${inviteToken}`;
                      try {
                        await Share.share({ message: link });
                      } catch {}
                    }}
                  >
                    <Text style={[styles.editModalButtonText, { color: '#FFFFFF' }]}>
                      Поделиться
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.editModalButton, { backgroundColor: 'transparent', marginTop: spacing.s }]}
                  onPress={handleRegenerateInvite}
                  disabled={inviteRegenerating}
                >
                  {inviteRegenerating ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Text style={[styles.editModalButtonText, { color: colors.textSecondary }]}>
                      Обновить код приглашения
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={[styles.inviteDescription, { color: colors.error || '#EF4444' }]}>
                Не удалось создать ссылку
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Join by Code Modal */}
      <JoinByCodeModal
        visible={joinByCodeVisible}
        userId={currentUserId}
        onAccepted={(courseId, courseTitle) => {
          setJoinByCodeVisible(false);
          useCoursesStore.getState().courses.push({
            id: courseId,
            title: courseTitle,
            createdAt: Date.now(),
            isStudentCourse: true,
          });
          if (currentUserId) {
            DatabaseService.reloadRemoteDataForUser(currentUserId);
          }
          setActiveCourse(courseId);
          setDrawerOpen(false);
        }}
        onDismiss={() => setJoinByCodeVisible(false)}
      />

      {/* Streak Modal */}
      <Modal
        visible={streakModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeStreakModal}
      >
        <View style={[styles.streakOverlay, { paddingTop: insets.top + spacing.xl }]}>
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
                    backgroundColor: todayGoalReached
                      ? (isDarkMode ? 'rgba(234,88,12,0.12)' : '#FFF4E5')
                      : (isDarkMode ? 'rgba(107,114,128,0.12)' : '#F3F4F6'),
                    borderColor: todayGoalReached
                      ? (isDarkMode ? 'rgba(234,88,12,0.2)' : '#FED7AA')
                      : (isDarkMode ? 'rgba(107,114,128,0.2)' : '#D1D5DB'),
                  },
                ]}
              >
                <Ionicons
                  name="flame"
                  size={42}
                  color={todayGoalReached ? (isDarkMode ? '#FBBF24' : '#EA580C') : (isDarkMode ? '#6B7280' : '#9CA3AF')}
                  style={todayGoalReached ? { textShadowColor: 'rgba(249,115,22,0.35)', textShadowRadius: 10 } : undefined}
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
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

      <StudyModeSheet
        visible={showStudyModeModal}
        onClose={() => setShowStudyModeModal(false)}
        subtitle={`${activeCourseTitle ? activeCourseTitle : 'Все наборы'} • ${dueCards} карточек`}
        onSelectMode={handleSelectStudyMode}
        games={homeStudyModeGames}
        settings={{
          onlyHard,
          onToggleOnlyHard: () => setOnlyHard((v) => !v),
          showMnemonic,
          onToggleShowMnemonic: () => setShowMnemonic((v) => !v),
          wordLimit,
          onSelectWordLimit: setWordLimit,
        }}
      />
      {/* Set Action Sheet */}
      <Modal
        visible={!!setMenuTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setSetMenuTarget(null)}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: modalOverlayBg }]}
          onPress={() => setSetMenuTarget(null)}
        >
          <View
            style={[
              styles.setActionSheet,
              { backgroundColor: modalSurface, borderColor: modalBorder },
            ]}
          >
            <View style={[styles.setActionSheetHandle, { backgroundColor: modalHandleColor }]} />
            <Pressable
              style={({ pressed }) => [styles.sheetAction, pressed && { opacity: 0.7 }]}
              onPress={() => {
                if (setMenuTarget) {
                  navigation?.navigate('SetEditor', { setId: setMenuTarget.id, autoFocusTitle: true });
                  setSetMenuTarget(null);
                }
              }}
            >
              <Edit2 size={18} color={modalTextPrimary} />
              <Text style={{ color: modalTextPrimary, marginLeft: 8 }}>Редактировать</Text>
            </Pressable>
            {setMenuTarget?.courseId && isTeacher && (
              <Pressable
                style={({ pressed }) => [styles.sheetAction, pressed && { opacity: 0.7 }]}
                onPress={() => setMenuTarget && handleToggleSetHidden(setMenuTarget)}
              >
                {setMenuTarget.isHiddenFromStudents ? (
                  <Eye size={18} color={colors.primary} />
                ) : (
                  <EyeOff size={18} color={modalTextSecondary} />
                )}
                <Text style={{ color: setMenuTarget.isHiddenFromStudents ? colors.primary : modalTextPrimary, marginLeft: 8 }}>
                  {setMenuTarget.isHiddenFromStudents ? 'Показать ученикам' : 'Скрыть от учеников'}
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
      <DiamondReward
        ref={diamondRewardRef}
        targetPosition={diamondTargetPos}
        onComplete={handleDiamondRewardComplete}
      />
    </View>
    </GestureDetector>
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
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgb(52, 56, 255)',
    alignItems: 'center',
    justifyContent: 'center',
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
  body: {
    flex: 1,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
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

  // Challenges Section
  challengesSection: {
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },
  challengesSectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: spacing.m,
    marginBottom: spacing.m,
  },
  challengesScrollContent: {
    paddingHorizontal: spacing.m,
    gap: 12,
  },
  challengeCard: {
    width: 136,
    height: 200,
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 17,
  },
  challengeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  challengeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  challengeProgressContainer: {
    alignItems: 'center',
  },
  challengeRingWrapper: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeIconOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeProgressText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
    marginTop: 4,
  },
  challengeCardClaimed: {
    backgroundColor: '#9CA3AF',
    opacity: 0.7,
  },
  challengeBadgeClaimed: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  challengeBadgeTextClaimed: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  challengeCardCompleted: {
    backgroundColor: '#059669',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  challengeBadgeCompleted: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  challengeBadgeTextCompleted: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  challengeClaimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  challengeClaimText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7C3AED',
  },
  allChallengesButtonContainer: {
    paddingHorizontal: spacing.m,
    marginTop: spacing.l,
  },
  allChallengesButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
  },
  allChallengesButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Teacher Mode Banner
  teacherBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgb(52, 56, 255)',
    shadowColor: '#1317ec',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  teacherBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teacherBannerIcon: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 8,
    borderRadius: 10,
  },
  teacherBannerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  teacherBannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  teacherBannerButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  teacherBannerButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgb(52, 56, 255)',
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

  // Hidden Badge
  hiddenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  hiddenBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Set Action Sheet
  setActionSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.m,
    paddingBottom: 40,
    paddingTop: spacing.s,
  },
  setActionSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.m,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.s,
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
    ...Platform.select({ web: { outlineStyle: 'none' } }),
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
  inviteDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.m,
  },
  inviteLinkBox: {
    borderRadius: borderRadius.m,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    marginBottom: spacing.l,
  },
  inviteLinkText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  deleteModalMessage: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: spacing.m,
  },
  deleteModalWarning: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.m,
  },
  deleteModalButton: {
    borderWidth: 0,
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

  // Study Mode Sheet (1:1 from SetDetailScreen)
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
