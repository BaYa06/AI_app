/**
 * Home Screen - Новый UI
 * @description Главная страница с современным дизайном
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, useWindowDimensions, TextInput as RNTextInput, Platform, Clipboard, Share, ActivityIndicator, RefreshControl } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSetsStore, useSettingsStore, useThemeColors, useCardsStore, useCoursesStore, useDiamondStore, useChallengeStore, isSetInCourse } from '@/store';
import type { ChallengeId } from '@/store';
import { selectSetStats } from '@/store/cardsStore';
import { Text, DiamondReward } from '@/components/common';
import type { DiamondRewardRef } from '@/components/common';
import { StudyModeSheet, DEFAULT_STUDY_MODE_GAMES, type StudyMode } from '@/components/study/StudyModeSheet';
import { CoursesDrawer } from '@/components/home/CoursesDrawer';
import { animateDrawerTo, clampTranslateX, resolveDrawerOpen } from '@/components/home/drawerAnimation';
import ReanimatedAnimated, { useSharedValue, withTiming, withSequence, withRepeat, useAnimatedStyle, Easing, withDelay, runOnJS } from 'react-native-reanimated';
import { spacing, borderRadius, heights, iconSize, typography, screenPadding, alpha, getDeckAccentColor } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { pluralize } from '@/utils';
import { Button, Card as SurfaceCard, Badge, Dialog, EmptyState, ListRow, ProgressBar, Sheet, TextField, confirmDialog, toast } from '@/components/ui';
import {
  Menu,
  Search,
  Plus,
  Library,
  Lightbulb,
  MoreVertical,
  X,
  Eye,
  EyeOff,
  BookOpen,
  Folder,
  Edit2,
  ArrowUpDown,
  Check,
  RotateCcw,
  ChevronRight,
  Users,
  Flame,
  Gem,
  Zap,
  Crosshair,
  Clock,
  Play,
  GraduationCap,
  Trophy,
} from 'lucide-react-native';
import { StreakService, getLocalDateKey } from '@/services/StreakService';
import { supabase } from '@/services/supabaseClient';
import { NeonService, type CourseLeaderboard } from '@/services/NeonService';
import { leaderboardSeenKey, type LeaderboardSeen } from '@/screens/CourseLeaderboardScreen';
import { DatabaseService } from '@/services/DatabaseService';
import { BookService } from '@/services/BookService';
import { JoinByCodeModal } from '@/components/JoinByCodeModal';
import type { DailyActivity } from '@/services/StreakService';
import type { Card, CardSet } from '@/types';
import { isCardWaitingReview, isCardFading } from '@/services/SRSService';
import { StorageService, STORAGE_KEYS } from '@/services/StorageService';

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

type SetsSortKey = 'recent' | 'due' | 'progress' | 'newest' | 'alpha' | 'size';

const SETS_SORT_OPTIONS: { key: SetsSortKey; label: string; short: string }[] = [
  { key: 'recent', label: 'Недавно изучал', short: 'Недавние' },
  { key: 'due', label: 'Нужно повторить', short: 'Повторить' },
  { key: 'progress', label: 'Прогресс: меньше → больше', short: 'Прогресс' },
  { key: 'newest', label: 'Новые', short: 'Новые' },
  { key: 'alpha', label: 'По алфавиту', short: 'А–Я' },
  { key: 'size', label: 'Больше карточек', short: 'Размер' },
];

function loadSetsSort(): SetsSortKey {
  try {
    const saved = StorageService.getString(STORAGE_KEYS.HOME_SETS_SORT);
    if (SETS_SORT_OPTIONS.some((o) => o.key === saved)) return saved as SetsSortKey;
  } catch {}
  return 'recent';
}

const byRecent = (a: CardSet, b: CardSet) =>
  (b.lastStudiedAt ?? 0) - (a.lastStudiedAt ?? 0) || b.createdAt - a.createdAt;

const masteredRatio = (s: CardSet) =>
  s.cardCount > 0 ? (s.masteredCount || 0) / s.cardCount : Number.POSITIVE_INFINITY; // пустые — в конец

const SETS_COMPARATORS: Record<SetsSortKey, (a: CardSet, b: CardSet) => number> = {
  recent: byRecent,
  due: (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || byRecent(a, b),
  progress: (a, b) => masteredRatio(a) - masteredRatio(b) || byRecent(a, b),
  newest: (a, b) => b.createdAt - a.createdAt,
  alpha: (a, b) => (a.title || '').localeCompare(b.title || '', 'ru', { sensitivity: 'base', numeric: true }),
  size: (a, b) => (b.cardCount || 0) - (a.cardCount || 0) || byRecent(a, b),
};

/** «Забрать +10» на выполненной мини-игре — мягко пульсирует, пока награду не забрали */
function ClaimButton({ onPress, buttonRef }: { onPress: () => void; buttonRef: (el: View | null) => void }) {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <ReanimatedAnimated.View style={style}>
      <Pressable hitSlop={{ top: spacing.xxs, bottom: spacing.xxs }}
        ref={buttonRef}
        style={[styles.challengeClaimButton, { backgroundColor: colors.onPrimary }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Забрать 10 алмазов"
      >
        <Text variant="label" style={{ color: colors.gameGreen }}>Забрать +10</Text>
        <Gem size={iconSize.xs} color={colors.gameGreen} />
      </Pressable>
    </ReanimatedAnimated.View>
  );
}

/**
 * Карточки для мини-игры (план §3.2): сначала слова, которым пришло время повторения — самые
 * просроченные первыми, потом случайные. Порядок в игре перемешан.
 */
function pickCardsForGame(cards: Card[], count: number): Card[] {
  const now = Date.now();
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const waiting = cards
    .filter((c) => isCardWaitingReview(c, now))
    .sort((a, b) => a.nextReviewDate - b.nextReviewDate);
  const rest = shuffle(cards.filter((c) => !isCardWaitingReview(c, now)));
  return shuffle([...waiting, ...rest].slice(0, count));
}

export function HomeScreen({ navigation }: any) {
  const colors = useThemeColors();
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [setsSort, setSetsSort] = useState<SetsSortKey>(loadSetsSort);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);

  const selectSetsSort = useCallback((key: SetsSortKey) => {
    triggerHaptic('selection');
    setSetsSort(key);
    setSortSheetVisible(false);
    try {
      StorageService.setString(STORAGE_KEYS.HOME_SETS_SORT, key);
    } catch {}
  }, []);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = useMemo(() => Math.min(windowWidth * 0.8, 320), [windowWidth]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  // Заморозки серии в запасе (план §3.5); null — ещё не загружено
  const [streakFreezes, setStreakFreezes] = useState<number | null>(null);
  const [buyingFreeze, setBuyingFreeze] = useState(false);
  // Сразу — сохранённое с прошлого раза; свежее с сервера подменит в useFocusEffect ниже
  const [todayBackendCards, setTodayBackendCards] = useState<number | null>(() => StreakService.cachedTodayActivity()?.cards_studied ?? null);
  const [weekActivity, setWeekActivity] = useState<DailyActivity[]>(() => StreakService.cachedWeekActivity(10) ?? []);
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
  // Размер порции — общая настройка (Профиль → Настройки обучения)
  const studyCardLimit = useSettingsStore((s) => s.settings.studyCardLimit);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const wordLimit: '10' | '20' | '30' | 'all' =
    studyCardLimit === null ? 'all' : studyCardLimit === 10 || studyCardLimit === 30 ? String(studyCardLimit) as '10' | '30' : '20';
  const setWordLimit = useCallback(
    (val: '10' | '20' | '30' | 'all') => {
      updateSettings({ studyCardLimit: val === 'all' ? null : Number(val) });
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );
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
  const [refreshing, setRefreshing] = useState(false);

  // Потянуть вниз — подтянуть изменения в курсах учителя (новые наборы, карточки, юниты)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await DatabaseService.syncStudentCourses();
    } finally {
      setRefreshing(false);
    }
  }, []);
  const inviteBaseUrl = 'https://ai-app-seven-zeta.vercel.app';
  const [setMenuTarget, setSetMenuTarget] = useState<CardSet | null>(null);
  const editInputRef = useRef<RNTextInput>(null);
  const newCourseInputRef = useRef<RNTextInput>(null);
  const editModalInputRef = useRef<RNTextInput>(null);

  // Diamond reward animation
  const diamondRewardRef = useRef<DiamondRewardRef>(null);
  const diamondIconRef = useRef<View>(null);
  const claimBtnRefs = useRef<Partial<Record<ChallengeId, View | null>>>({});
  const [diamondTargetPos, setDiamondTargetPos] = useState<{ x: number; y: number } | null>(null);
  const diamonds = useDiamondStore((s) => s.diamonds);
  const loadRewards = useDiamondStore((s) => s.loadRewards);
  const claimReward = useDiamondStore((s) => s.claimReward);
  const setDiamonds = useDiamondStore((s) => s.setDiamonds);
  const pendingDiamondsRef = useRef<number | null>(null);
  const [claimingReward, setClaimingReward] = useState(false);
  const challengeStatuses = useChallengeStore((s) => s.statuses);
  const claimChallenge = useChallengeStore((s) => s.claimChallenge);
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
      toast.info('Нет наборов — сначала создай набор с карточками');
      return;
    }
    const firstSetId = allSets[0].id;

    const allCards = Object.values(useCardsStore.getState().cards);
    if (allCards.length < 4) {
      toast.info('Мало карточек — добавь хотя бы 4, чтобы играть в челлендж');
      return;
    }

    const selected = pickCardsForGame(allCards, 10);
    const dueCardIds = selected.map((c) => c.id);

    navigation.navigate('MultipleChoice', {
      setId: firstSetId,
      cardLimit: selected.length,
      dueCardIds,
      challengeMode: true,
      timeLimit: 120,
    });
  }, [navigation]);

  // «Забрать +10» — сразу (оптимистично): алмазы летят и прибавляются, сервер подтверждает в фоне.
  // Выдаёт награду только сервер: не подтвердил (нет сети/уже забрано) — откатываем экран.
  const handleChallengeClaim = useCallback((id: ChallengeId) => {
    if (!claimBtnRefs.current[id] || claimingReward) return;
    setClaimingReward(true);
    const balanceBefore = useDiamondStore.getState().diamonds;
    let reverted = false;
    pendingDiamondsRef.current = balanceBefore + 10;
    claimBtnRefs.current[id]?.measureInWindow((x, y, w, h) => {
      diamondRewardRef.current?.collect({ x: x + w / 2, y: y + h / 2 });
    });
    setTimeout(() => {
      if (!reverted) claimChallenge(id);
    }, 900);

    claimReward(id).then((balance) => {
      setClaimingReward(false);
      if (balance === null) {
        reverted = true;
        pendingDiamondsRef.current = null;
        setDiamonds(balanceBefore);
        useChallengeStore.getState().revertClaim(id);
        toast.error('Нет соединения. Награда не получена — попробуй ещё раз, когда появится интернет');
        return;
      }
      // Точный баланс с сервера: если анимация ещё летит — применится по её окончании
      if (pendingDiamondsRef.current !== null) pendingDiamondsRef.current = balance;
      else setDiamonds(balance);
    });
  }, [claimReward, claimingReward, claimChallenge, setDiamonds]);

  const STREAK_FREEZE_PRICE = 50;
  const MAX_STREAK_FREEZES = 2;
  const handleBuyStreakFreeze = useCallback(async () => {
    if (buyingFreeze) return;
    setBuyingFreeze(true);
    const result = await NeonService.buyStreakFreeze();
    setBuyingFreeze(false);
    if (!result) {
      toast.error('Нет соединения. Попробуй ещё раз');
    } else if ('error' in result) {
      toast.info(
        result.error === 'max_freezes'
          ? `Уже максимум: в запасе может быть не больше ${MAX_STREAK_FREEZES} заморозок`
          : `Не хватает алмазов: заморозка стоит ${STREAK_FREEZE_PRICE} — их дают за мини-игры`,
      );
    } else {
      triggerHaptic('notificationSuccess');
      setDiamonds(result.diamonds);
      setStreakFreezes(result.streakFreezes);
    }
  }, [buyingFreeze, setDiamonds]);

  const handleSniperChallenge = useCallback(() => {
    triggerHaptic('selection');
    const allSets = useSetsStore.getState().getAllSets();
    if (allSets.length === 0) {
      toast.info('Нет наборов — сначала создай набор с карточками');
      return;
    }
    const firstSetId = allSets[0].id;

    const allCards = Object.values(useCardsStore.getState().cards);
    if (allCards.length < 4) {
      toast.info('Мало карточек — добавь хотя бы 4');
      return;
    }

    const selected = pickCardsForGame(allCards, 5);
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
      toast.info('Нет наборов — сначала создай набор с карточками');
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
      toast.success('Всё свежо! Нет забытых карточек — ты недавно всё повторил');
      return;
    }
    if (forgottenCards.length < 4) {
      toast.info('Мало карточек — нужно минимум 4 забытых карточки для игры');
      return;
    }

    // Раунд — до 10 забытых карточек (сначала те, что ждут повторения); награда только если все правильные
    const selected = pickCardsForGame(forgottenCards, 10);
    navigation.navigate('MultipleChoice', {
      setId: firstSetId,
      cardLimit: selected.length,
      dueCardIds: selected.map((c) => c.id),
      challengeMode: true,
      forgottenMode: true,
    });
  }, [navigation]);

  const handleDiamondRewardComplete = useCallback(() => {
    if (pendingDiamondsRef.current !== null) {
      setDiamonds(pendingDiamondsRef.current);
      pendingDiamondsRef.current = null;
    }
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
        // Баланс алмазов и забранные сегодня челленджи — из БД
        loadRewards();
      }
    }, [currentUserId, fetchIsTeacher, loadRewards])
  );

  const SWIPE_THRESHOLD = 50;
  const SWIPE_VELOCITY = 200;
  const closeStreakModal = useCallback(() => setStreakModalVisible(false), []);
  const formatDays = useCallback(
    (value: number) => `${value} ${pluralize(value, 'день', 'дня', 'дней')}`,
    [],
  );

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
              setStreakFreezes(stats.streak_freezes);
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
    return `Хорошее начало! Осталось ${remaining} ${pluralize(remaining, 'слово', 'слова', 'слов')} до цели. Продолжай в том же духе!`;
  }, [goalProgress, dailyGoal, cardsLearned]);
  
  // Фильтрация наборов по активному курсу
  const filteredSets = useMemo(() => {
    if (activeCourseId === null) {
      return allSets; // "All" - показываем все наборы
    }
    return allSets.filter((set) => isSetInCourse(set, activeCourseId));
  }, [allSets, activeCourseId]);

  // Слова к повторению в текущем курсе (план §3.1, §3.3): ждут, угасают, будут завтра
  const cardsMap = useCardsStore((s) => s.cards);
  const cardsBySet = useCardsStore((s) => s.cardsBySet);
  const reviewStats = useMemo(() => {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const waiting: Card[] = [];
    const all: Card[] = [];
    const waitingBySet: Record<string, number> = {};
    let fading = 0;
    let tomorrow = 0;
    const seen = new Set<string>();
    for (const set of filteredSets) {
      for (const id of cardsBySet[set.id] || []) {
        const card = cardsMap[id];
        if (!card || seen.has(id)) continue;
        seen.add(id);
        all.push(card);
        if (isCardWaitingReview(card, now)) {
          waiting.push(card);
          waitingBySet[set.id] = (waitingBySet[set.id] || 0) + 1;
          if (isCardFading(card, now)) fading++;
        } else if ((card.learningStep || 0) >= 1 && card.nextReviewDate <= now + DAY_MS) {
          tomorrow++;
        }
      }
    }
    // Сначала самые просроченные
    waiting.sort((a, b) => a.nextReviewDate - b.nextReviewDate);
    return { waiting, all, waitingBySet, fading, tomorrow };
  }, [filteredSets, cardsBySet, cardsMap]);

  // «Повторение дня» (план §3.1): слова курса, которым пришло время, самые просроченные первыми
  const DAILY_REVIEW_MAX = 30;
  const handleDailyReview = useCallback(() => {
    triggerHaptic('selection');
    let queue = reviewStats.waiting.slice(0, DAILY_REVIEW_MAX);
    if (queue.length === 0) return;
    // Тесту нужно хотя бы 4 варианта ответа — добираем карточками курса (ответ раньше срока уровень не меняет)
    if (queue.length < 4) {
      const taken = new Set(queue.map((c) => c.id));
      queue = [...queue, ...pickCardsForGame(reviewStats.all.filter((c) => !taken.has(c.id)), 4 - queue.length)];
    }
    const total = queue.length;
    const rootNav = navigation?.getParent?.() ?? navigation;
    rootNav?.navigate('MultipleChoice', {
      setId: queue[0].setId,
      cardLimit: total,
      dueCardIds: queue.map((c) => c.id),
      questionIndex: 1,
      totalQuestions: total,
      phaseId: `review_${Date.now()}`,
      totalPhaseCards: total,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, reviewStats]);

  // Тизер рейтинга курса (план, этап 4): маленькая кнопка между мини-играми и «Повторением дня»
  const [leaderboard, setLeaderboard] = useState<CourseLeaderboard | null>(null);
  const [lastWeekBoard, setLastWeekBoard] = useState<CourseLeaderboard | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!activeCourseId || isTeacher !== false) {
        setLeaderboard(null);
        setLastWeekBoard(null);
        return;
      }
      let active = true;
      const isMonday = new Date().getDay() === 1;
      // Сразу — сохранённое (тизер виден без ожидания и без сети), свежее подменит
      setLeaderboard(NeonService.cachedLeaderboard(activeCourseId, 'current'));
      if (isMonday) setLastWeekBoard(NeonService.cachedLeaderboard(activeCourseId, 'previous'));
      Promise.all([
        NeonService.loadLeaderboard(activeCourseId, 'current'),
        isMonday ? NeonService.loadLeaderboard(activeCourseId, 'previous') : Promise.resolve(null),
      ]).then(([current, previous]) => {
        if (!active) return;
        if (current) setLeaderboard(current);
        if (previous) setLastWeekBoard(previous);
      });
      return () => { active = false; };
    }, [activeCourseId, isTeacher]),
  );

  const ratingTeaser = useMemo(() => {
    if (!activeCourseId || !leaderboard || !('rows' in leaderboard) || !leaderboard.enabled || !leaderboard.me) return null;
    const seen = StorageService.getObject<LeaderboardSeen>(leaderboardSeenKey(activeCourseId)) || {};
    const word = (n: number) => {
      const m10 = n % 10, m100 = n % 100;
      if (m100 >= 11 && m100 <= 19) return 'очков';
      if (m10 === 1) return 'очко';
      if (m10 >= 2 && m10 <= 4) return 'очка';
      return 'очков';
    };
    // Понедельник: итоги прошлой недели, ещё не просмотренные
    if (lastWeekBoard && 'rows' in lastWeekBoard && lastWeekBoard.frozen && lastWeekBoard.me?.place
        && seen.resultsWeekStart !== lastWeekBoard.weekStart) {
      const mine = lastWeekBoard.rows.find((r) => r.isMe);
      return {
        badge: `#${lastWeekBoard.me.place}`,
        title: 'Итоги недели готовы',
        hint: mine && mine.reward > 0 ? `Твоя награда: +${mine.reward} ${pluralize(mine.reward, 'алмаз', 'алмаза', 'алмазов')}` : 'Посмотри, кто победил',
        dot: true,
        week: 'previous' as const,
      };
    }
    const me = leaderboard.me;
    if (me.hidden) return { badge: '—', title: 'Рейтинг недели', hint: 'Ты скрыт из рейтинга', dot: false, week: 'current' as const };
    if (me.points === 0 || me.place === null) {
      return { badge: '?', title: 'Узнай своё место', hint: 'Первые очки — за повторение слов', dot: false, week: 'current' as const };
    }
    const lastPlace = seen.weekStart === leaderboard.weekStart ? seen.place ?? null : null;
    if (lastPlace && me.place > lastPlace) {
      return { badge: `#${me.place}`, title: 'Тебя обогнали', hint: `Было #${lastPlace} — верни место`, dot: true, week: 'current' as const };
    }
    if (lastPlace && me.place < lastPlace) {
      return { badge: `#${me.place}`, title: `Ты поднялся на ${me.place}-е место`, hint: me.gapToNext != null ? `До ${me.place - 1}-го — ${me.gapToNext} ${word(me.gapToNext)}` : 'Так держать!', dot: true, week: 'current' as const };
    }
    if (me.place === 1) return { badge: '#1', title: 'Ты лидер недели', hint: 'Удержишь до воскресенья?', dot: false, week: 'current' as const };
    return {
      badge: `#${me.place}`,
      title: me.gapToNext != null ? `До ${me.place - 1}-го места — ${me.gapToNext} ${word(me.gapToNext)}` : 'Рейтинг недели',
      hint: 'Повторяй слова вовремя — это +2 за каждое',
      dot: false,
      week: 'current' as const,
    };
  }, [activeCourseId, leaderboard, lastWeekBoard]);


  // Поиск и сортировка по текущему списку наборов
  const visibleSets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const found = !query ? filteredSets : filteredSets.filter((set) => {
      const title = set.title?.toLowerCase() || '';
      const desc = set.description?.toLowerCase() || '';
      const tags = (set.tags || []).join(' ').toLowerCase();
      return title.includes(query) || desc.includes(query) || tags.includes(query);
    });
    return [...found].sort(SETS_COMPARATORS[setsSort]);
  }, [filteredSets, searchQuery, setsSort]);

  const setsSortShortLabel = SETS_SORT_OPTIONS.find((o) => o.key === setsSort)?.short;
  
  // Получаем название активного курса для empty state
  const activeCourseTitle = useMemo(() => {
    if (activeCourseId === null) return null;
    const course = courses.find((c) => c.id === activeCourseId);
    return course?.title || 'этот курс';
  }, [activeCourseId, courses]);

  const openLeaderboard = useCallback((week: 'current' | 'previous') => {
    if (!activeCourseId) return;
    triggerHaptic('selection');
    const rootNav = navigation?.getParent?.() ?? navigation;
    rootNav?.navigate('CourseLeaderboard', { courseId: activeCourseId, courseTitle: activeCourseTitle ?? undefined, week });
  }, [activeCourseId, activeCourseTitle, navigation]);

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

  // Фокус на input при создании курса
  useEffect(() => {
    if (isCreatingCourse) {
      const timer = setTimeout(() => {
        newCourseInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCreatingCourse]);
  
  // Стиль панели вкладок задаёт только AppNavigator (шаг брендбука 1.6). Боковая панель —
  // отдельный Modal поверх всего экрана, прятать панель вкладок под ней не нужно.
  
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
      toast.error('Не удалось изменить видимость набора');
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
      const sets = courseId === null ? allSets : allSets.filter((s) => isSetInCourse(s, courseId));
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

  // Раньше считалось только по 1 / 2–4: выходило «21 наборов», «22 наборов»
  const formatSetWord = useCallback(
    (count: number) => pluralize(count, 'набор', 'набора', 'наборов'),
    [],
  );

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
      return `В курсе "${deleteModalCourse.title}" ${deleteModalStats.setCount} ${setWord}. Перемести наборы в другие курсы или удали их.`;
    }
    return `Удалить курс "${deleteModalCourse.title}"?`;
  }, [deleteModalCourse, deleteModalHasSets, deleteModalStats, formatSetWord]);

  const openInviteModal = useCallback(async (courseId: string) => {
    setCourseMenuOpen(null);
    setInviteCopied(false);
    setInviteToken(null);
    setInviteJoinCode(null);
    setInviteLoading(true);
    // Окно — только после закрытия боковой панели (иначе iOS покажет его под панелью и оно пропадёт)
    runAfterDrawerClosed(() => setInviteModalCourseId(courseId));
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
  }, [runAfterDrawerClosed]);

  const closeInviteModal = useCallback(() => {
    setInviteModalCourseId(null);
    setInviteCopied(false);
    setInviteToken(null);
    setInviteJoinCode(null);
  }, []);

  const handleRegenerateInvite = useCallback(async () => {
    if (!inviteModalCourseId) return;
    const confirmed = await confirmDialog({
      title: 'Обновить код приглашения?',
      message: 'Старые ссылка и код перестанут работать — ученики, у которых они есть, больше не смогут по ним присоединиться.',
      confirmText: 'Обновить',
      destructive: true,
    });
    if (!confirmed) return;
    setInviteRegenerating(true);
    setInviteCopied(false);
    try {
      const result = await NeonService.regenerateCourseInvite(inviteModalCourseId);
      if (result) {
        setInviteToken(result.token);
        setInviteJoinCode(result.joinCode);
      } else {
        toast.error('Не удалось обновить код приглашения');
      }
    } finally {
      setInviteRegenerating(false);
    }
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

  // «Выйти из курса» из боковой панели: как и остальные действия — окно после её закрытия.
  // Раньше окно открывалось сразу, под открытой панелью, и кнопка «не работала».
  const openLeaveModal = useCallback((courseId: string) => {
    setCourseMenuOpen(null);
    runAfterDrawerClosed(() => setLeaveModalCourseId(courseId));
  }, [runAfterDrawerClosed]);

  const handleLeaveCourse = useCallback(async () => {
    if (!leaveModalCourseId) return;
    setLeaveLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) {
        toast.info('Войди в аккаунт, чтобы выйти из курса');
        return;
      }

      const success = await NeonService.leaveStudentCourse(leaveModalCourseId, userId);
      if (success) {
        removeLocalCourse(leaveModalCourseId);
        setLeaveModalCourseId(null);
        // Юнит учебника мог быть открыт и в другом курсе — вернуть его туда после локальной чистки
        BookService.syncOfficialSets().catch(() => {});
      } else {
        toast.error('Не удалось выйти из курса. Попробуй ещё раз');
      }
    } catch {
      toast.error('Не удалось выйти из курса');
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

  // Баннер учителя — вход в курс (ученики, приглашения, тесты, «Учебники курса»). Показывается и
  // когда в курсе ещё нет наборов: иначе в новом пустом курсе до него было не добраться.
  const teacherBanner = (
    <View style={styles.teacherBannerWrap}>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.teacherBanner,
          { backgroundColor: pressed ? colors.primaryPressed : colors.primaryFill },
        ]}
        onPress={() => {
          const ownCourses = courses.filter(c => !c.isStudentCourse);
          const targetCourse = ownCourses.find(c => c.id === activeCourseId) ?? ownCourses[0];

          if (!targetCourse) {
            toast.info('Нет курсов — сначала создай курс, чтобы открыть статистику учителя');
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
          <View style={[styles.teacherBannerIcon, { backgroundColor: alpha(colors.onPrimary, 20) }]}>
            <GraduationCap size={iconSize.s} color={colors.onPrimary} />
          </View>
          <View style={styles.flexShrink}>
            <Text variant="label" style={{ color: colors.onPrimary }}>Режим учителя</Text>
            <Text variant="caption" style={[styles.onFillMuted, { color: colors.onPrimary }]}>
              Ученики, наборы и тесты
            </Text>
          </View>
        </View>
        <View style={[styles.teacherBannerButton, { backgroundColor: colors.onPrimary }]}>
          <Text variant="caption" style={[styles.semibold, { color: colors.primaryFill }]}>Мои курсы →</Text>
        </View>
      </Pressable>
    </View>
  );

  // Карточка ежедневного челленджа: играть → "Забрать" 10 алмазов → "Получено" до завтра
  // Мини-игра: «Играть» → «Выполнено, забрать +10» → «Получено, снова завтра»
  const hoursUntilTomorrow = (() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 3_600_000));
  })();
  const renderChallengeCard = ({ id, title, badge, icon: ChallengeIcon, accent, onPlay }: {
    id: ChallengeId;
    title: string;
    badge: string;
    icon: typeof Zap;
    accent: string;
    onPlay: () => void;
  }) => {
    const status = challengeStatuses[id];
    const onFillSoft = alpha(colors.onPrimary, 20);
    if (status === 'pending') {
      return (
        <Pressable
          key={id}
          style={({ pressed }) => [styles.challengeCard, { backgroundColor: accent }, pressed && styles.challengeCardPressed]}
          onPress={onPlay}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${badge}. Награда 10 алмазов`}
        >
          <View style={styles.challengeTopRow}>
            <View style={[styles.challengeIconCircle, { backgroundColor: onFillSoft }]}>
              <ChallengeIcon size={iconSize.s} color={colors.onPrimary} />
            </View>
            <View style={[styles.challengeBadge, { backgroundColor: onFillSoft }]}>
              <Text variant="caption" style={[styles.semibold, { color: colors.onPrimary }]}>{badge}</Text>
            </View>
          </View>
          <Text style={[styles.challengeTitle, { color: colors.onPrimary }]} numberOfLines={2}>{title}</Text>
          <View style={styles.challengeBottomRow}>
            <View style={[styles.challengeReward, { backgroundColor: onFillSoft }]}>
              <Gem size={iconSize.xs} color={colors.onPrimary} />
              <Text variant="caption" style={[styles.bold, { color: colors.onPrimary }]}>+10</Text>
            </View>
            <View style={[styles.challengePlay, { backgroundColor: colors.onPrimary }]}>
              <Play size={iconSize.xs} color={accent} fill={accent} style={styles.playIconNudge} />
            </View>
          </View>
        </Pressable>
      );
    }
    if (status === 'completed') {
      return (
        <View key={id} style={[styles.challengeCard, { backgroundColor: colors.gameGreen }]}>
          <View style={styles.challengeTopRow}>
            <View style={[styles.challengeIconCircle, { backgroundColor: colors.onPrimary }]}>
              <Check size={iconSize.s} color={colors.gameGreen} />
            </View>
            <View style={[styles.challengeBadge, { backgroundColor: onFillSoft }]}>
              <Text variant="caption" style={[styles.semibold, { color: colors.onPrimary }]}>Выполнено</Text>
            </View>
          </View>
          <Text style={[styles.challengeTitle, { color: colors.onPrimary }]} numberOfLines={2}>{title}</Text>
          <ClaimButton
            buttonRef={(el) => { claimBtnRefs.current[id] = el; }}
            onPress={() => handleChallengeClaim(id)}
          />
        </View>
      );
    }
    return (
      <View
        key={id}
        style={[styles.challengeCard, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
        accessibilityLabel={`${title}: награда получена, снова через ${hoursUntilTomorrow} ч`}
      >
        <View style={styles.challengeTopRow}>
          <View style={[styles.challengeIconCircle, { backgroundColor: alpha(colors.success, 10) }]}>
            <Check size={iconSize.s} color={colors.successText} />
          </View>
          <Text variant="caption" style={[styles.semibold, { color: colors.successText }]}>Получено</Text>
        </View>
        <Text style={[styles.challengeTitle, { color: colors.textSecondary }]} numberOfLines={2}>{title}</Text>
        <View style={styles.challengeBottomRow}>
          <Text variant="caption" style={{ color: colors.textTertiary }}>
            Снова через {hoursUntilTomorrow} ч
          </Text>
        </View>
      </View>
    );
  };

  // Кнопки закрытия окон — одна и та же «тихая» кнопка-иконка
  const closeButton = (onPress: () => void, disabled?: boolean) => (
    <Button
      variant="icon"
      icon={X}
      background="none"
      iconSize={iconSize.s}
      iconColor={colors.textSecondary}
      accessibilityLabel="Закрыть"
      onPress={onPress}
      disabled={disabled}
    />
  );

  const copyToClipboard = (text: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      Clipboard.setString(text);
    }
  };

  const leaveModalCourseTitle = courses.find((c) => c.id === leaveModalCourseId)?.title ?? '';

  return (
    <GestureDetector gesture={rootGesture}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Button variant="icon" icon={Menu} background="none" accessibilityLabel="Курсы" onPress={() => setDrawerOpen(true)} />

        <View style={styles.headerCenter}>
          <Pressable
            style={styles.headerStat}
            onPress={() => setStreakModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`Серия: ${formatDays(streakValue)}`}
          >
            <Flame size={iconSize.m} color={todayGoalReached ? colors.streak : colors.textTertiary} />
            <Text style={[styles.headerStatText, { color: todayGoalReached ? colors.textPrimary : colors.textSecondary }]}>
              {formatDays(streakValue)}
            </Text>
          </Pressable>

          <View
            ref={diamondIconRef}
            style={styles.headerStat}
            accessible
            accessibilityLabel={`Алмазы: ${diamonds}`}
            onLayout={() => {
              diamondIconRef.current?.measureInWindow((x, y, w, h) => {
                setDiamondTargetPos({ x: x + w / 2, y: y + h / 2 });
              });
            }}
          >
            <Gem size={iconSize.m} color={colors.diamond} />
            <ReanimatedAnimated.View style={diamondCountAnimStyle}>
              <Text style={[styles.headerStatText, { color: colors.textPrimary }]}>
                {diamonds}
              </Text>
            </ReanimatedAnimated.View>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Button
            variant="icon"
            icon={Search}
            background="none"
            iconSize={iconSize.s}
            accessibilityLabel="Поиск по наборам"
            onPress={() => setSearchVisible(!searchVisible)}
          />
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: pressed ? colors.primaryPressed : colors.primaryFill },
            ]}
            hitSlop={spacing.xxs}
            accessibilityRole="button"
            accessibilityLabel="Создать набор"
            onPress={() => { triggerHaptic('selection'); navigation?.navigate('SetEditor', {}); }}
          >
            <Plus size={iconSize.s} color={colors.onPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <TextField
            variant="search"
            placeholder="Поиск по наборам..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            // Поиск — исключение из правила «клавиатура не открывается сама»
            autoFocus
            inputStyle={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
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
          <Pressable style={styles.searchOverlay} onPress={() => setSearchVisible(false)} accessibilityLabel="Закрыть поиск" />
        )}

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
        {visibleSets.length === 0 ? (
          <>
          {isTeacher === true && teacherBanner}
          <EmptyState
            icon={Library}
            title="Пока нет наборов"
            description={
              isTeacher
                ? 'Создай первый набор, чтобы начать учиться и упорядочить материалы по курсам.'
                : 'Создай свой набор слов или подключись к курсу учителя — его наборы появятся здесь.'
            }
            action={{ label: 'Создать набор', icon: Plus, onPress: () => navigation?.navigate('SetEditor', {}) }}
            // Новичку — второй путь: не создавать, а подключиться к курсу учителя по коду
            secondaryAction={
              isTeacher !== true
                ? {
                    label: 'Подключиться к курсу',
                    icon: Users,
                    onPress: () => {
                      triggerHaptic('selection');
                      setJoinByCodeVisible(true);
                    },
                  }
                : undefined
            }
          />
          <SurfaceCard style={[styles.tipCard, { backgroundColor: alpha(colors.primary, 10) }]}>
            <Lightbulb size={iconSize.s} color={colors.primary} />
            <View style={styles.flex1}>
              <Text variant="label" style={[styles.tipTitle, { color: colors.textPrimary }]}>Подсказка</Text>
              <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                {isTeacher
                  ? 'Курс пустой? Через «Режим учителя» выше можно пригласить учеников и подключить учебник — наборы для этого не нужны.'
                  : 'Объединяй несколько наборов в курс — так проще учиться по теме или семестру.'}
              </Text>
            </View>
          </SurfaceCard>
          </>
        ) : (
          <>
            {isTeacher === null ? null : isTeacher ? (
              teacherBanner
            ) : (
              /* Challenges Section */
              <View style={styles.challengesSection}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.challengesScrollContent}
                  snapToInterval={CHALLENGE_CARD_WIDTH + spacing.s}
                  decelerationRate="fast"
                >
                  {renderChallengeCard({
                    id: 'quick_round',
                    title: 'Быстрый раунд',
                    badge: '2 минуты',
                    icon: Zap,
                    accent: colors.gameViolet,
                    onPlay: handleQuickRound,
                  })}
                  {renderChallengeCard({
                    id: 'sniper',
                    title: 'Снайпер',
                    badge: '5 подряд',
                    icon: Crosshair,
                    accent: colors.gameRose,
                    onPlay: handleSniperChallenge,
                  })}
                  {renderChallengeCard({
                    id: 'forgotten',
                    title: 'Вспомни забытое',
                    badge: '7+ дней',
                    icon: Clock,
                    accent: colors.gameTeal,
                    onPlay: handleForgottenChallenge,
                  })}
                </ScrollView>

                {ratingTeaser && (
                  <SurfaceCard
                    onPress={() => openLeaderboard(ratingTeaser.week)}
                    padding="s"
                    style={styles.ratingTeaser}
                    accessibilityLabel={`${ratingTeaser.title}. ${ratingTeaser.hint}`}
                  >
                    <View style={[styles.ratingTeaserIcon, { backgroundColor: alpha(colors.star, 20) }]}>
                      <Trophy size={iconSize.s} color={colors.warningText} />
                      {ratingTeaser.dot && (
                        <View style={[styles.ratingTeaserDot, { backgroundColor: colors.error, borderColor: colors.surface }]} />
                      )}
                    </View>
                    <View style={styles.flex1}>
                      <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]} numberOfLines={1}>
                        {ratingTeaser.title}
                      </Text>
                      <Text variant="caption" style={{ color: colors.textSecondary }} numberOfLines={1}>
                        {ratingTeaser.hint}
                      </Text>
                    </View>
                    <Text variant="h3" style={[styles.bold, { color: colors.primary }]}>{ratingTeaser.badge}</Text>
                    <ChevronRight size={iconSize.xs} color={colors.textTertiary} />
                  </SurfaceCard>
                )}

                <View style={styles.reviewActions}>
                  {reviewStats.waiting.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.dailyReviewButton,
                        { backgroundColor: pressed ? colors.primaryPressed : colors.primaryFill },
                      ]}
                      onPress={handleDailyReview}
                    >
                      <Text style={[typography.button, styles.noLetterSpacing, { color: colors.onPrimary }]}>
                        Повторение дня · {Math.min(reviewStats.waiting.length, DAILY_REVIEW_MAX)} слов · ~{Math.max(1, Math.round(Math.min(reviewStats.waiting.length, DAILY_REVIEW_MAX) / 4))} мин
                      </Text>
                      {(reviewStats.fading > 0 || reviewStats.waiting.length > DAILY_REVIEW_MAX) && (
                        <Text variant="bodySmall" style={[styles.onFillMuted, { color: colors.onPrimary }]}>
                          {[
                            reviewStats.fading > 0 ? `${reviewStats.fading} начинают забываться` : null,
                            reviewStats.waiting.length > DAILY_REVIEW_MAX ? `всего ждут ${reviewStats.waiting.length}` : null,
                          ].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <>
                      {reviewStats.all.some((c) => (c.learningStep || 0) >= 1) && (
                        <Text variant="bodySmall" align="center" style={[styles.reviewDoneText, { color: colors.textSecondary }]}>
                          Всё повторено ✓{reviewStats.tomorrow > 0 ? ` · завтра ${reviewStats.tomorrow}` : ''}
                        </Text>
                      )}
                      <Button title="Учить все карточки" fullWidth onPress={() => setShowStudyModeModal(true)} />
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text variant="h3" style={[styles.flexShrink, { color: colors.textPrimary }]} numberOfLines={1}>
                {activeCourseId === null ? 'Мои наборы' : activeCourseTitle}
              </Text>
              <Pressable
                onPress={() => setSortSheetVisible(true)}
                hitSlop={spacing.s}
                accessibilityRole="button"
                accessibilityLabel={`Сортировка: ${setsSortShortLabel}`}
                style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
              >
                <ArrowUpDown size={iconSize.xs} color={colors.primary} />
                <Text variant="label" style={{ color: colors.primary }}>
                  {setsSortShortLabel}
                </Text>
              </Pressable>
            </View>

          <View style={styles.setsList}>
            {visibleSets.map((set, index) => {
              const progress = set.cardCount > 0 ? Math.round(((set.masteredCount || 0) / set.cardCount) * 100) : 0;
              const accentColor = getDeckAccentColor(set.id || index);
              // Низкий прогресс — не «ошибка»: хвалим за прогресс, не ругаем (брендбук, раздел 1)
              const getStatusColor = () => {
                if (progress >= 60) return colors.success;
                if (progress >= 10) return colors.warning;
                return colors.primary;
              };

              // Дата создания набора
              const getDateDisplay = () => {
                const date = new Date(set.createdAt);
                const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
                return {
                  month: months[date.getMonth()],
                  day: date.getDate().toString()
                };
              };
              const dateDisplay = getDateDisplay();
              const waitingCount = reviewStats.waitingBySet[set.id] || 0;

              return (
                <StaggerCard key={set.id} index={index}>
                <SurfaceCard
                  onPress={() => { triggerHaptic('selection'); navigation?.navigate('SetDetail', { setId: set.id }); }}
                  accessibilityLabel={`${set.title}, ${set.cardCount} ${pluralize(set.cardCount, 'карточка', 'карточки', 'карточек')}, выучено ${progress}%`}
                >
                  {/* Header with icon, title, status dot, and button */}
                  <View style={styles.setCardHeader}>
                    <View style={styles.setCardLeft}>
                      {/* Date Icon */}
                      <View style={[styles.dateIcon, { backgroundColor: accentColor }]}>
                        <Text variant="caption" style={[styles.dateMonth, { color: colors.onPrimary }]}>{dateDisplay.month}</Text>
                        <Text variant="bodyLarge" style={[styles.dateDay, { color: colors.onPrimary }]}>{dateDisplay.day}</Text>
                      </View>

                      {/* Title and Stats */}
                      <View style={styles.flex1}>
                        <View style={styles.titleRow}>
                          <Text variant="body" style={[styles.setTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {set.title}
                          </Text>
                          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                        </View>
                        <Text variant="caption" style={{ color: colors.textSecondary }}>
                          {set.cardCount} {pluralize(set.cardCount, 'карточка', 'карточки', 'карточек')} • {progress}% выучено
                        </Text>
                        {set.isHiddenFromStudents && set.courseId && isTeacher && (
                          <Badge label="Скрыто" tone="neutral" icon={EyeOff} style={styles.setBadge} />
                        )}
                        {set.isOfficial && (
                          <Badge label="По учебнику" tone="primary" icon={BookOpen} style={styles.setBadge} />
                        )}
                        {waitingCount > 0 && (
                          <Badge label={`${waitingCount} ждут повторения`} tone="warning" icon={RotateCcw} style={styles.setBadge} />
                        )}
                      </View>
                    </View>

                    {/* More Menu */}
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
                          navigation?.navigate('SetEditor', { setId: set.id, autoFocusTitle: true });
                        }
                      }}
                    />
                  </View>

                  {/* Progress Section */}
                  <View style={styles.progressSection}>
                    <View style={styles.progressHeader}>
                      <Text variant="caption" style={[styles.semibold, { color: colors.textSecondary }]}>Прогресс</Text>
                      <Text variant="caption" style={[styles.semibold, { color: colors.textSecondary }]}>{progress}%</Text>
                    </View>
                    <ProgressBar progress={progress} color={getStatusColor()} animated={false} />
                  </View>
                </SurfaceCard>
                </StaggerCard>
              );
            })}
          </View>
          </>
        )}
        </ScrollView>
      </View>

      <CoursesDrawer
        mounted={drawerMounted}
        translateX={drawerTranslateX}
        drawerWidth={drawerWidth}
        onGestureSettled={handleDrawerGestureSettled}
        colors={colors}
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
        onOpenLeaveModal={openLeaveModal}
        onBackdropPress={handleDrawerBackdropPress}
        onRequestClose={handleDrawerRequestClose}
      />

      {/* Edit Course Modal */}
      <Dialog
        visible={isEditModalVisible}
        onClose={cancelCourseEdit}
        title="Переименовать курс"
        headerRight={closeButton(cancelCourseEdit)}
        footer={
          <View style={styles.dialogButtons}>
            <Button variant="quiet" tone="secondary" title="Отмена" onPress={cancelCourseEdit} style={styles.flex1} />
            <Button
              title="Сохранить"
              onPress={() => editingCourseId && saveCourseTitle(editingCourseId)}
              style={styles.flex1}
            />
          </View>
        }
      >
        <TextField
          ref={editModalInputRef}
          icon={Folder}
          placeholder="Название курса..."
          value={editingTitle}
          onChangeText={setEditingTitle}
          onSubmitEditing={() => editingCourseId && saveCourseTitle(editingCourseId)}
          inputStyle={Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : undefined}
        />
      </Dialog>

      {/* Delete Course Modal */}
      <Dialog
        visible={deleteModalCourseId !== null}
        onClose={closeDeleteModal}
        title="Удаление курса"
        headerRight={closeButton(closeDeleteModal)}
        footer={
          <View style={styles.dialogButtons}>
            <Button variant="quiet" tone="secondary" title="Отмена" onPress={closeDeleteModal} style={styles.flex1} />
            <Button
              variant="danger"
              filled
              title="Удалить"
              onPress={confirmDeleteCourse}
              disabled={deleteModalHasSets}
              style={styles.flex1}
            />
          </View>
        }
      >
        <Text variant="body" style={{ color: colors.textPrimary }}>
          {deleteModalMessage}
        </Text>
        {deleteModalHasSets && (
          <Text variant="bodySmall" style={[styles.semibold, styles.dialogNote, { color: colors.warningText }]}>
            Удаление недоступно: сначала перемести наборы.
          </Text>
        )}
      </Dialog>

      {/* Leave Course Modal */}
      <Dialog
        visible={leaveModalCourseId !== null}
        onClose={() => !leaveLoading && setLeaveModalCourseId(null)}
        title="Выйти из курса?"
        headerRight={closeButton(() => setLeaveModalCourseId(null), leaveLoading)}
        footer={
          <View style={styles.dialogButtons}>
            <Button
              variant="quiet"
              tone="secondary"
              title="Отмена"
              onPress={() => setLeaveModalCourseId(null)}
              disabled={leaveLoading}
              style={styles.flex1}
            />
            <Button
              variant="danger"
              filled
              title="Выйти"
              onPress={handleLeaveCourse}
              loading={leaveLoading}
              style={styles.flex1}
            />
          </View>
        }
      >
        <Text variant="body" style={{ color: colors.textPrimary }}>
          {`Ты покинешь курс "${leaveModalCourseTitle}" и потеряешь доступ ко всем его материалам.`}
        </Text>
      </Dialog>

      {/* Invite Students Modal */}
      <Dialog
        visible={inviteModalCourseId !== null}
        onClose={closeInviteModal}
        title="Пригласить учеников"
        headerRight={closeButton(closeInviteModal)}
      >
        <Text variant="bodySmall" style={[styles.inviteDescription, { color: colors.textSecondary }]}>
          Поделись ссылкой или кодом — ученики смогут присоединиться к курсу.
        </Text>

        {inviteLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.inviteSpinner} />
        ) : inviteToken ? (
          <>
            {/* Код курса */}
            {inviteJoinCode && (
              <View style={styles.inviteCodeBlock}>
                <Text variant="label" style={[styles.inviteCodeLabel, { color: colors.textSecondary }]}>
                  Код курса
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Код курса ${inviteJoinCode.split('').join(' ')}. Нажми, чтобы скопировать`}
                  style={[
                    styles.inviteBox,
                    styles.inviteCodeBox,
                    { backgroundColor: colors.surfaceMuted, borderColor: alpha(colors.primary, 40) },
                  ]}
                  onPress={() => copyToClipboard(inviteJoinCode)}
                >
                  <Text variant="h1" style={[styles.inviteCode, { color: colors.primary }]}>
                    {inviteJoinCode}
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable accessibilityRole="button" accessibilityHint="Удерживай, чтобы скопировать ссылку"
              style={[styles.inviteBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              onLongPress={() => {
                copyToClipboard(`${inviteBaseUrl}/join/${inviteToken}`);
                setInviteCopied(true);
              }}
            >
              <Text variant="label" style={{ color: colors.primary }} numberOfLines={1} selectable>
                {`${inviteBaseUrl}/join/${inviteToken}`}
              </Text>
            </Pressable>

            <View style={styles.dialogButtons}>
              <Button
                title={inviteCopied ? 'Скопировано' : 'Копировать'}
                icon={inviteCopied ? Check : undefined}
                onPress={() => {
                  copyToClipboard(`${inviteBaseUrl}/join/${inviteToken}`);
                  setInviteCopied(true);
                }}
                style={styles.flex1}
              />
              <Button
                variant="secondary"
                title="Поделиться"
                onPress={async () => {
                  try {
                    await Share.share({ message: `${inviteBaseUrl}/join/${inviteToken}` });
                  } catch {}
                }}
                style={styles.flex1}
              />
            </View>

            <Button
              variant="quiet"
              tone="secondary"
              title="Обновить код приглашения"
              onPress={handleRegenerateInvite}
              loading={inviteRegenerating}
              fullWidth
              style={styles.inviteRegenerate}
            />
          </>
        ) : (
          <Text variant="bodySmall" style={{ color: colors.errorText }}>
            Не удалось создать ссылку
          </Text>
        )}
      </Dialog>

      {/* Sort Sheet */}
      <Sheet visible={sortSheetVisible} onClose={() => setSortSheetVisible(false)} title="Сортировка">
        {SETS_SORT_OPTIONS.map((option) => {
          const selected = option.key === setsSort;
          return (
            <Pressable
              key={option.key}
              onPress={() => selectSetsSort(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.sortOption,
                pressed && { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <Text
                variant="body"
                style={[{ color: selected ? colors.primary : colors.textPrimary }, selected && styles.semibold]}
              >
                {option.label}
              </Text>
              {selected && <Check size={iconSize.s} color={colors.primary} />}
            </Pressable>
          );
        })}
      </Sheet>

      {/* Join by Code Modal */}
      <JoinByCodeModal
        visible={joinByCodeVisible}
        userId={currentUserId}
        onAccepted={(courseId, courseTitle) => {
          setJoinByCodeVisible(false);
          // Курс сразу в список, наборы курса — тихой синхронизацией (без мигания экрана)
          const { courses } = useCoursesStore.getState();
          if (!courses.some((c) => c.id === courseId)) {
            useCoursesStore.setState({
              courses: [...courses, { id: courseId, title: courseTitle, createdAt: Date.now(), isStudentCourse: true }],
            });
          }
          DatabaseService.syncStudentCourses();
          setActiveCourse(courseId);
          setDrawerOpen(false);
        }}
        onDismiss={() => setJoinByCodeVisible(false)}
      />

      {/* Streak Modal */}
      <Dialog visible={streakModalVisible} onClose={closeStreakModal} placement="top" style={styles.streakCard}>
        {/* Section 1: Header */}
        <View style={styles.streakTop}>
          <View
            style={[
              styles.streakTopIcon,
              todayGoalReached
                ? { backgroundColor: alpha(colors.streak, 10), borderColor: alpha(colors.streak, 40) }
                : { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ]}
          >
            <Flame size={iconSize.l} color={todayGoalReached ? colors.streak : colors.textTertiary} />
          </View>
          <View style={styles.streakTopText}>
            <Text variant="overline" style={{ color: colors.textSecondary }}>
              Ударный режим
            </Text>
            <Text variant="h2" style={{ color: colors.textPrimary }}>
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
                  <Text variant="overline" style={{ color: isToday ? colors.primary : colors.textSecondary }}>
                    {day}
                  </Text>
                  <View
                    accessible
                    accessibilityLabel={`${day}, ${dayNumber}: ${done ? 'цель выполнена' : isToday ? 'сегодня' : 'нет занятий'}`}
                    style={[
                      styles.weekCircle,
                      done
                        ? { backgroundColor: colors.success, borderColor: colors.success }
                        : { borderColor: isToday ? colors.primary : colors.border },
                    ]}
                  >
                    {done ? (
                      <Check size={iconSize.xs} color={colors.onPrimary} strokeWidth={3} />
                    ) : (
                      <Text variant="caption" style={[styles.bold, { color: isToday ? colors.primary : colors.textSecondary }]}>
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
        <View style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <View>
              <Text variant="overline" style={{ color: colors.textSecondary }}>Карточки</Text>
              <Text variant="h3" style={[styles.bold, { color: colors.textPrimary }]}>
                {cardsLearned}
                <Text variant="h3" style={{ color: colors.textSecondary }}>
                  /{dailyGoal}
                </Text>
              </Text>
            </View>
            <Text variant="overline" style={{ color: colors.primary }}>Дневная цель</Text>
          </View>
          <ProgressBar progress={goalProgress} accessibilityLabel="Дневная цель" />
        </View>

        <Text variant="bodySmall" align="center" style={{ color: colors.textSecondary }}>
          {streakSupportText}
        </Text>

        {streakFreezes !== null && (
          <View style={[styles.freezeRow, { borderColor: colors.border }]}>
            <View style={styles.flex1}>
              <Text variant="body" style={[styles.semibold, { color: colors.textPrimary }]}>
                Заморозка серии: {streakFreezes} из {MAX_STREAK_FREEZES}
              </Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                Спасёт серию, если пропустишь один день
              </Text>
            </View>
            {streakFreezes < MAX_STREAK_FREEZES && (
              <Button
                size="s"
                icon={Gem}
                title={String(STREAK_FREEZE_PRICE)}
                accessibilityLabel={`Купить заморозку за ${STREAK_FREEZE_PRICE} алмазов`}
                onPress={handleBuyStreakFreeze}
                loading={buyingFreeze}
              />
            )}
          </View>
        )}
      </Dialog>

      <StudyModeSheet
        visible={showStudyModeModal}
        onClose={() => setShowStudyModeModal(false)}
        subtitle={`${activeCourseTitle ? activeCourseTitle : 'Все наборы'} • ${dueCards} ${pluralize(dueCards, 'карточка', 'карточки', 'карточек')}`}
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
      <Sheet visible={!!setMenuTarget} onClose={() => setSetMenuTarget(null)}>
        <ListRow
          icon={Edit2}
          iconColor={colors.textPrimary}
          title="Редактировать"
          chevron={false}
          onPress={() => {
            if (setMenuTarget) {
              navigation?.navigate('SetEditor', { setId: setMenuTarget.id, autoFocusTitle: true });
              setSetMenuTarget(null);
            }
          }}
          style={styles.sheetRow}
        />
        {setMenuTarget?.courseId && isTeacher && (
          <ListRow
            icon={setMenuTarget.isHiddenFromStudents ? Eye : EyeOff}
            iconColor={setMenuTarget.isHiddenFromStudents ? colors.primary : colors.textSecondary}
            title={setMenuTarget.isHiddenFromStudents ? 'Показать ученикам' : 'Скрыть от учеников'}
            chevron={false}
            onPress={() => setMenuTarget && handleToggleSetHidden(setMenuTarget)}
            style={styles.sheetRow}
          />
        )}
      </Sheet>
      <DiamondReward
        ref={diamondRewardRef}
        targetPosition={diamondTargetPos}
        onComplete={handleDiamondRewardComplete}
      />
    </View>
    </GestureDetector>
  );
}

const CHALLENGE_CARD_WIDTH = 136;
const CHALLENGE_CARD_HEIGHT = 168;
const ADD_BUTTON_SIZE = 36;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
  },
  flex1: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
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
  // Второстепенный текст на цветной заливке
  onFillMuted: {
    opacity: 0.85,
  },
  pressed: {
    opacity: 0.85,
  },

  // Header
  header: {
    height: heights.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: heights.touch,
    paddingHorizontal: spacing.xs,
  },
  headerStatText: {
    ...typography.button,
    fontWeight: '700',
    letterSpacing: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingRight: spacing.xs,
  },
  addButton: {
    width: ADD_BUTTON_SIZE,
    height: ADD_BUTTON_SIZE,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchBar: {
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.s,
  },
  body: {
    flex: 1,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },

  // Content
  content: {
    flex: 1,
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
  challengesScrollContent: {
    paddingHorizontal: screenPadding,
    gap: spacing.s,
  },
  challengeCard: {
    width: CHALLENGE_CARD_WIDTH,
    height: CHALLENGE_CARD_HEIGHT,
    borderRadius: borderRadius.l,
    padding: spacing.s,
    justifyContent: 'space-between',
  },
  challengeCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  challengeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  challengeBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs / 2,
    borderRadius: borderRadius.full,
  },
  challengeBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  challengeReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  challengePlay: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Треугольник «play» визуально смещён влево — выравниваем по центру круга
  playIconNudge: {
    marginLeft: spacing.xxs / 2,
  },
  challengeClaimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    minHeight: 36,
    borderRadius: borderRadius.full,
  },
  ratingTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginHorizontal: screenPadding,
    marginTop: spacing.l,
    minHeight: 56,
  },
  ratingTeaserIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingTeaserDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  reviewActions: {
    paddingHorizontal: screenPadding,
    marginTop: spacing.l,
  },
  dailyReviewButton: {
    minHeight: heights.button,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewDoneText: {
    marginBottom: spacing.s,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: 1,
  },

  // Teacher Mode Banner
  teacherBannerWrap: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },
  teacherBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  teacherBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flexShrink: 1,
  },
  teacherBannerIcon: {
    padding: spacing.xs,
    borderRadius: borderRadius.m,
  },
  teacherBannerButton: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: screenPadding,
    marginTop: spacing.l,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: heights.listRow,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },

  // Empty State
  tipCard: {
    flexDirection: 'row',
    gap: spacing.s,
    marginHorizontal: screenPadding,
    alignItems: 'flex-start',
  },
  tipTitle: {
    marginBottom: spacing.xxs,
  },

  // Sets List
  setsList: {
    flex: 1,
    padding: screenPadding,
    gap: spacing.s,
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
    gap: spacing.s,
  },
  dateIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateMonth: {
    fontWeight: '600',
    opacity: 0.85,
  },
  dateDay: {
    fontWeight: '700',
    lineHeight: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  setTitle: {
    fontWeight: '600',
    flexShrink: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  setBadge: {
    marginTop: spacing.xxs,
  },

  // Progress Section
  progressSection: {
    marginTop: spacing.s,
    gap: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // Sheets
  sheetRow: {
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },

  // Dialogs
  dialogButtons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  dialogNote: {
    marginTop: spacing.s,
  },
  inviteDescription: {
    marginBottom: spacing.m,
  },
  inviteSpinner: {
    marginVertical: spacing.m,
  },
  inviteCodeBlock: {
    marginBottom: spacing.m,
  },
  inviteCodeLabel: {
    marginBottom: spacing.xs,
  },
  inviteBox: {
    borderRadius: borderRadius.m,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  inviteCodeBox: {
    alignItems: 'center',
    marginBottom: 0,
  },
  inviteCode: {
    letterSpacing: 8,
  },
  inviteRegenerate: {
    marginTop: spacing.s,
  },

  // Streak modal
  streakCard: {
    maxWidth: 360,
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
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  streakTopText: {
    flex: 1,
    gap: spacing.xxs,
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  weekItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  weekCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  goalCard: {
    padding: spacing.m,
    marginBottom: spacing.xs,
    gap: spacing.s,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
});
