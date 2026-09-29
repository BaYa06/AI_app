/**
 * Home Screen - Новый UI
 * @description Главная страница с современным дизайном
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, useWindowDimensions, TextInput as RNTextInput, Modal, Platform, Alert, Clipboard, Share, ActivityIndicator, RefreshControl } from 'react-native';
import { showMessage } from '@/utils/dialogs';
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
  BookOpen,
  File,
  Folder,
  Edit2,
  Timer,
  ArrowUpDown,
  Check,
  RotateCcw,
  ChevronRight,
  Users,
} from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
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
      <Pressable ref={buttonRef} style={styles.challengeClaimButton} onPress={onPress} accessibilityRole="button" accessibilityLabel="Забрать 10 алмазов">
        <Text style={styles.challengeClaimText}>Забрать +10</Text>
        <Ionicons name="diamond" size={13} color="#059669" />
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
      Alert.alert('Нет наборов', 'Сначала создай набор с карточками');
      return;
    }
    const firstSetId = allSets[0].id;

    const allCards = Object.values(useCardsStore.getState().cards);
    if (allCards.length < 4) {
      Alert.alert('Мало карточек', 'Добавь хотя бы 4 карточки чтобы играть в челлендж');
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
        Alert.alert('Нет соединения', 'Награда не получена — попробуй ещё раз, когда появится интернет.');
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
      Alert.alert('Нет соединения', 'Попробуй ещё раз.');
    } else if ('error' in result) {
      Alert.alert(
        result.error === 'max_freezes' ? 'Уже максимум' : 'Не хватает алмазов',
        result.error === 'max_freezes'
          ? `В запасе может быть не больше ${MAX_STREAK_FREEZES} заморозок.`
          : `Заморозка стоит ${STREAK_FREEZE_PRICE} алмазов — их дают за мини-игры.`,
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
      Alert.alert('Нет наборов', 'Сначала создай набор с карточками');
      return;
    }
    const firstSetId = allSets[0].id;

    const allCards = Object.values(useCardsStore.getState().cards);
    if (allCards.length < 4) {
      Alert.alert('Мало карточек', 'Добавь хотя бы 4 карточки');
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
    return `Хорошее начало! Осталось ${remaining} слов до цели. Продолжай в том же духе!`;
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
        hint: mine && mine.reward > 0 ? `Твоя награда: +${mine.reward} алмазов` : 'Посмотри, кто победил',
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
    return course?.title || 'this course';
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
        Alert.alert('Нужно войти', 'Войдите в аккаунт, чтобы выйти из курса.');
        return;
      }

      const success = await NeonService.leaveStudentCourse(leaveModalCourseId, userId);
      if (success) {
        removeLocalCourse(leaveModalCourseId);
        setLeaveModalCourseId(null);
        // Юнит учебника мог быть открыт и в другом курсе — вернуть его туда после локальной чистки
        BookService.syncOfficialSets().catch(() => {});
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

  // Баннер учителя — вход в курс (ученики, приглашения, тесты, «Учебники курса»). Показывается и
  // когда в курсе ещё нет наборов: иначе в новом пустом курсе до него было не добраться.
  const teacherBanner = (
    <View style={{ paddingHorizontal: spacing.m, paddingTop: spacing.m, paddingBottom: spacing.s }}>
      <Pressable
        style={styles.teacherBanner}
        onPress={() => {
          const ownCourses = courses.filter(c => !c.isStudentCourse);
          const targetCourse = ownCourses.find(c => c.id === activeCourseId) ?? ownCourses[0];

          if (!targetCourse) {
            showMessage('Нет курсов', 'Сначала создайте курс, чтобы открыть статистику учителя.');
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
  );

  // Карточка ежедневного челленджа: играть → "Забрать" 10 алмазов → "Получено" до завтра
  // Мини-игра: «Играть» → «Выполнено, забрать +10» → «Получено, снова завтра»
  const hoursUntilTomorrow = (() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 3_600_000));
  })();
  const renderChallengeCard = ({ id, title, badge, icon, accent, onPlay }: {
    id: ChallengeId;
    title: string;
    badge: string;
    icon: React.ReactNode;
    accent: string;
    onPlay: () => void;
  }) => {
    const status = challengeStatuses[id];
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
            <View style={styles.challengeIconCircle}>{icon}</View>
            <View style={styles.challengeBadge}>
              <Text style={styles.challengeBadgeText}>{badge}</Text>
            </View>
          </View>
          <Text style={styles.challengeTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.challengeBottomRow}>
            <View style={styles.challengeReward}>
              <Ionicons name="diamond" size={12} color="#FFFFFF" />
              <Text style={styles.challengeRewardText}>+10</Text>
            </View>
            <View style={styles.challengePlay}>
              <Ionicons name="play" size={14} color={accent} style={{ marginLeft: 2 }} />
            </View>
          </View>
        </Pressable>
      );
    }
    if (status === 'completed') {
      return (
        <View key={id} style={[styles.challengeCard, styles.challengeCardCompleted]}>
          <View style={styles.challengeTopRow}>
            <View style={[styles.challengeIconCircle, { backgroundColor: '#FFFFFF' }]}>
              <Ionicons name="checkmark" size={20} color="#059669" />
            </View>
            <View style={styles.challengeBadge}>
              <Text style={styles.challengeBadgeText}>Выполнено</Text>
            </View>
          </View>
          <Text style={styles.challengeTitle} numberOfLines={2}>{title}</Text>
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
          <View style={[styles.challengeIconCircle, { backgroundColor: colors.success + '22' }]}>
            <Ionicons name="checkmark" size={20} color={colors.success} />
          </View>
          <Text style={[styles.challengeDoneLabel, { color: colors.success }]}>Получено</Text>
        </View>
        <Text style={[styles.challengeTitle, { color: colors.textSecondary }]} numberOfLines={2}>{title}</Text>
        <View style={styles.challengeBottomRow}>
          <Text style={[styles.challengeAgainText, { color: colors.textTertiary }]}>
            Снова через {hoursUntilTomorrow} ч
          </Text>
        </View>
      </View>
    );
  };

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
                  {diamonds}
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
                {isTeacher
                  ? 'Создайте первый набор, чтобы начать учиться и упорядочить материалы по курсам.'
                  : 'Создайте свой набор слов или подключитесь к курсу учителя — его наборы появятся здесь.'}
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

              {/* Новичку — второй путь: не создавать, а подключиться к курсу учителя по коду */}
              {isTeacher !== true && (
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => {
                    triggerHaptic('selection');
                    setJoinByCodeVisible(true);
                  }}
                >
                  <Users size={20} color={colors.primary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                    Подключиться к курсу
                  </Text>
                </Pressable>
              )}


              <View style={[styles.tipCard, { borderColor: colors.border, backgroundColor: colors.primary + '0D' }]}>
                <Lightbulb size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tipTitle, { color: colors.textPrimary }]}>Подсказка</Text>
                  <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                    {isTeacher
                      ? 'Курс пустой? Через Teacher Mode выше можно пригласить учеников и подключить учебник — наборы для этого не нужны.'
                      : 'Объединяйте несколько наборов в курс — так проще учиться по теме или семестру.'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
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
                  snapToInterval={136 + 12}
                  decelerationRate="fast"
                >
                  {renderChallengeCard({
                    id: 'quick_round',
                    title: 'Быстрый раунд',
                    badge: '2 минуты',
                    icon: <Ionicons name="flash" size={18} color="#FFFFFF" />,
                    accent: '#7C3AED',
                    onPlay: handleQuickRound,
                  })}
                  {renderChallengeCard({
                    id: 'sniper',
                    title: 'Снайпер',
                    badge: '5 подряд',
                    icon: <Ionicons name="locate" size={18} color="#FFFFFF" />,
                    accent: '#BE123C',
                    onPlay: handleSniperChallenge,
                  })}
                  {renderChallengeCard({
                    id: 'forgotten',
                    title: 'Вспомни забытое',
                    badge: '7+ дней',
                    icon: <Ionicons name="time" size={18} color="#FFFFFF" />,
                    accent: '#0E7490',
                    onPlay: handleForgottenChallenge,
                  })}
                </ScrollView>

                {ratingTeaser && (
                  <Pressable
                    onPress={() => openLeaderboard(ratingTeaser.week)}
                    style={[styles.ratingTeaser, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    accessibilityLabel={`${ratingTeaser.title}. ${ratingTeaser.hint}`}
                  >
                    <View style={styles.ratingTeaserIcon}>
                      <Ionicons name="trophy" size={18} color="#B45309" />
                      {ratingTeaser.dot && <View style={[styles.ratingTeaserDot, { borderColor: colors.surface }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ratingTeaserTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {ratingTeaser.title}
                      </Text>
                      <Text style={[styles.ratingTeaserHint, { color: colors.textSecondary }]} numberOfLines={1}>
                        {ratingTeaser.hint}
                      </Text>
                    </View>
                    <Text style={[styles.ratingTeaserBadge, { color: colors.primary }]}>{ratingTeaser.badge}</Text>
                    <ChevronRight size={18} color={colors.textTertiary} />
                  </Pressable>
                )}

                <View style={styles.allChallengesButtonContainer}>
                  {reviewStats.waiting.length > 0 ? (
                    <>
                      <Pressable style={[styles.allChallengesButton, styles.dailyReviewButton]} onPress={handleDailyReview}>
                        <Text style={styles.dailyReviewTitle}>
                          Повторение дня · {Math.min(reviewStats.waiting.length, DAILY_REVIEW_MAX)} слов · ~{Math.max(1, Math.round(Math.min(reviewStats.waiting.length, DAILY_REVIEW_MAX) / 4))} мин
                        </Text>
                        {(reviewStats.fading > 0 || reviewStats.waiting.length > DAILY_REVIEW_MAX) && (
                          <Text style={styles.dailyReviewSubtitle}>
                            {[
                              reviewStats.fading > 0 ? `${reviewStats.fading} начинают забываться` : null,
                              reviewStats.waiting.length > DAILY_REVIEW_MAX ? `всего ждут ${reviewStats.waiting.length}` : null,
                            ].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </Pressable>
                      {/* «Учить все карточки» — только когда повторение дня закончено: сначала старые слова */}
                    </>
                  ) : (
                    <>
                      {reviewStats.all.some((c) => (c.learningStep || 0) >= 1) && (
                        <Text style={[styles.reviewDoneText, { color: colors.textSecondary }]}>
                          Всё повторено ✓{reviewStats.tomorrow > 0 ? ` · завтра ${reviewStats.tomorrow}` : ''}
                        </Text>
                      )}
                      <Pressable style={styles.allChallengesButton} onPress={() => setShowStudyModeModal(true)}>
                        <Text style={styles.allChallengesButtonText}>Учить все карточки</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {activeCourseId === null ? 'Мои наборы' : activeCourseTitle}
              </Text>
              <Pressable
                onPress={() => setSortSheetVisible(true)}
                hitSlop={8}
                style={({ pressed }) => [styles.sortButton, pressed && { opacity: 0.6 }]}
              >
                <ArrowUpDown size={16} color={colors.primary} />
                <Text style={[styles.viewAllButton, { color: colors.primary }]}>
                  {setsSortShortLabel}
                </Text>
              </Pressable>
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
                        {set.isOfficial && (
                          <View style={styles.hiddenBadge}>
                            <BookOpen size={12} color={colors.primary} />
                            <Text style={[styles.hiddenBadgeText, { color: colors.primary }]}>
                              По учебнику
                            </Text>
                          </View>
                        )}
                        {(reviewStats.waitingBySet[set.id] || 0) > 0 && (
                          <View style={styles.hiddenBadge}>
                            <RotateCcw size={12} color={colors.warning} />
                            <Text style={[styles.hiddenBadgeText, { color: colors.warning }]}>
                              {reviewStats.waitingBySet[set.id]} ждут повторения
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
        onOpenLeaveModal={openLeaveModal}
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
              { backgroundColor: modalSurface, borderColor: modalBorder },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.textPrimary }]}>
                Переименовать курс
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
                placeholder="Название курса..."
                placeholderTextColor={colors.textSecondary}
                value={editingTitle}
                onChangeText={setEditingTitle}
                onSubmitEditing={() => editingCourseId && saveCourseTitle(editingCourseId)}
              />
            </View>

            <View style={styles.editModalButtons}>
              <Pressable
                style={[styles.editModalButton, { backgroundColor: colors.border }]}
                onPress={cancelCourseEdit}
              >
                <Text style={[styles.editModalButtonText, { color: colors.textSecondary }]}>
                  Отмена
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
                  Сохранить
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
              { backgroundColor: modalSurface, borderColor: modalBorder },
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
            style={[styles.editModalContent, { backgroundColor: modalSurface, borderColor: modalBorder }]}
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

      {/* Sort Sheet */}
      <Modal
        visible={sortSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortSheetVisible(false)}
      >
        <Pressable
          style={[styles.sortSheetBackdrop, { backgroundColor: modalOverlayBg }]}
          onPress={() => setSortSheetVisible(false)}
        >
          {/* В тёмной теме colors.surface полупрозрачный (rgba 0.05) — окно просвечивало,
              текст сливался с экраном. Берём непрозрачный фон модалок, как у меню набора. */}
          <Pressable
            style={[
              styles.sortSheet,
              {
                backgroundColor: modalSurface,
                borderColor: modalBorder,
                paddingBottom: insets.bottom + spacing.m,
              },
            ]}
          >
            <View style={[styles.sortSheetHandle, { backgroundColor: modalHandleColor }]} />
            <Text style={[styles.sortSheetTitle, { color: colors.textPrimary }]}>Сортировка</Text>
            {SETS_SORT_OPTIONS.map((option) => {
              const selected = option.key === setsSort;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => selectSetsSort(option.key)}
                  style={({ pressed }) => [
                    styles.sortOption,
                    pressed && { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : colors.border + '55' },
                  ]}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      { color: selected ? colors.primary : colors.textPrimary },
                      selected && { fontWeight: '700' },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected && <Check size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

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

            {streakFreezes !== null && (
              <View style={[styles.freezeRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.freezeTitle, { color: colors.textPrimary }]}>
                    Заморозка серии: {streakFreezes} из {MAX_STREAK_FREEZES}
                  </Text>
                  <Text style={[styles.freezeHint, { color: colors.textSecondary }]}>
                    Спасёт серию, если пропустишь один день
                  </Text>
                </View>
                {streakFreezes < MAX_STREAK_FREEZES && (
                  <Pressable
                    onPress={handleBuyStreakFreeze}
                    disabled={buyingFreeze}
                    style={[styles.freezeButton, { backgroundColor: colors.primary, opacity: buyingFreeze ? 0.6 : 1 }]}
                  >
                    <Ionicons name="diamond" size={14} color="#FFFFFF" />
                    <Text style={styles.freezeButtonText}>{STREAK_FREEZE_PRICE}</Text>
                  </Pressable>
                )}
              </View>
            )}
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
    height: 168,
    borderRadius: 22,
    padding: 14,
    justifyContent: 'space-between',
  },
  challengeCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  challengeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  challengeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  challengeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
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
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  challengeRewardText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  challengePlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeCardCompleted: {
    backgroundColor: '#059669',
  },
  challengeDoneLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  challengeAgainText: {
    fontSize: 12,
    fontWeight: '600',
  },
  challengeClaimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    minHeight: 34,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  challengeClaimText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  allChallengesButtonContainer: {
    paddingHorizontal: spacing.m,
    marginTop: spacing.l,
  },
  ratingTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.m,
    marginTop: spacing.l,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  ratingTeaserIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingTeaserDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
  },
  ratingTeaserTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  ratingTeaserHint: {
    fontSize: 12,
    marginTop: 1,
  },
  ratingTeaserBadge: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: 1,
  },
  freezeTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  freezeHint: {
    fontSize: 12,
    marginTop: 2,
  },
  freezeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  freezeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dailyReviewButton: {
    height: undefined,
    minHeight: 56,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    flexDirection: 'column',
  },
  dailyReviewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dailyReviewSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  reviewDoneText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.s,
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
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sortSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: spacing.s,
    paddingHorizontal: spacing.m,
  },
  sortSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.m,
  },
  sortSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.s,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },
  sortOptionText: {
    fontSize: 16,
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
  secondaryButton: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.m - 1.5,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
  },
  secondaryButtonText: {
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
