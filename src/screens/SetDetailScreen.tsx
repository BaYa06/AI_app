/**
 * Set Detail Screen
 * @description Экран детали набора карточек
 */
import { isCardLearned, isCardWaitingReview } from '@/services/SRSService';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { View, FlatList, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Modal, Dimensions } from 'react-native';
import { triggerHaptic } from '@/utils/haptic';
import { BlurView } from '@/utils/BlurView';
import { useSetsStore, useCardsStore, useThemeColors, selectSetStats, useSettingsStore, useCoursesStore, isSetInCourse } from '@/store';
import { Container, Text, Loading } from '@/components/common';
import { StudyModeSheet, type StudyMode } from '@/components/study/StudyModeSheet';
import { spacing, borderRadius, iconSize, alpha, config } from '@/constants';
import { EmptyState, ProgressBar, toast } from '@/components/ui';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';
import { DatabaseService, LibraryService, Analytics, NeonService, BookService } from '@/services';
import { confirmAction } from '@/utils/dialogs';
import { supabase } from '@/services/supabaseClient';
import { LIBRARY_CATEGORIES } from '@/constants/library';
import {
  ArrowLeft,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Edit3,
  Check,
  Circle,
  Camera,
  Globe,
  X,
  BookOpen,
  Layers,
} from 'lucide-react-native';
import { describeError } from '@/utils/userErrors';
import { pluralize } from '@/utils';

type Props = RootStackScreenProps<'SetDetail'>;
type Filter = 'all' | 'mastered' | 'unmastered';
const EXPORT_BUTTON_HEIGHT = 42;

export function SetDetailScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const userSettings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const set = useSetsStore((s) => s.getSet(setId));
  const updateSetStats = useSetsStore((s) => s.updateSetStats);
  const decrementCardCount = useSetsStore((s) => s.decrementCardCount);
  const cards = useCardsStore((s) => s.getCardsBySet(setId), shallow);
  const addCard = useCardsStore((s) => s.addCard);
  const deleteCard = useCardsStore((s) => s.deleteCard);

  const isReadOnly = set?.isReadOnly === true;

  const [filter, setFilter] = useState<Filter>('all');
  // Набора нет на телефоне — например, открыт по пушу «новый набор в курсе», а курс ещё не обновился
  // (plan/push_notifications.md, 3.5): подтягиваем наборы курсов; не нашёлся за 8 с — «Набор не найден»
  const [setMissing, setSetMissing] = useState(false);
  const [search, setSearch] = useState('');
  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newExample, setNewExample] = useState('');
  const [newMnemonic, setNewMnemonic] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showStudySheet, setShowStudySheet] = useState(false);
  const [onlyHard, setOnlyHard] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(true);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [wordLimit, setWordLimit] = useState<'10' | '20' | '30' | 'all'>(() => {
    const limit = userSettings.studyCardLimit;
    if (limit === null) return 'all';
    if (limit === 10 || limit === 30) return String(limit) as '10' | '30';
    return '20';
  });


  // Publish states
  const [isPublished, setIsPublished] = useState(false);
  const [librarySetId, setLibrarySetId] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishDescription, setPublishDescription] = useState('');
  const [publishCategory, setPublishCategory] = useState('');
  const [publishTags, setPublishTags] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // Расчет статистики
  const stats = useMemo(() => {
    if (!set) return { progress: 0, dueCount: 0 };
    const progress = set.cardCount > 0 
      ? Math.round((set.masteredCount / set.cardCount) * 100) 
      : 0;
    const dueCount = set.reviewCount;
    return { progress, dueCount };
  }, [set]);

  // Окна и листы — токены: в тёмной теме surface теперь сплошной (брендбук, 2.3)
  const backdropColor = colors.overlay;
  const modalSurface = colors.surface;
  const modalBorder = colors.border;
  const modalTextPrimary = colors.textPrimary;
  const modalTextSecondary = colors.textSecondary;
  const modalPlaceholder = colors.textTertiary;
  const modalInputBg = colors.surface;

  const filteredCards = useMemo(() => {
    const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
    const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';
    const query = search.trim().toLowerCase();

    return cards
      .filter((card) => {
        // выученные = уровень «знаю» и выше (шаг ≥ 3)
        if (filter === 'mastered') return isCardLearned(card);
        if (filter === 'unmastered') return !isCardLearned(card);
        return true;
      })
      .filter((card) => {
        if (!query) return true;
        const front = getFront(card).toLowerCase();
        const back = getBack(card).toLowerCase();
        return front.includes(query) || back.includes(query);
      });
  }, [cards, filter, search]);

  // Синхронизация выбранного лимита с сохраненными настройками (поддержка загрузки)
  useEffect(() => {
    const limit = userSettings.studyCardLimit;
    const next = limit === null ? 'all' : (limit === 10 || limit === 30 ? String(limit) : '20');
    setWordLimit((prev) => (prev === next ? prev : next as '10' | '20' | '30' | 'all'));
  }, [userSettings.studyCardLimit]);

  // Analytics: set_viewed
  useEffect(() => {
    if (set) {
      Analytics.setViewed(setId, cards.length, stats.progress);
    }
  }, [setId]);

  // Check if set is published
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        const result = await LibraryService.checkPublished(setId, session.user.id);
        setIsPublished(result.isPublished);
        setLibrarySetId(result.librarySetId || null);
      } catch {}
    })();
  }, [setId]);

  // Обработчики
  const getShuffledDueCardIds = useCallback(() => {
    const now = Date.now();
    const dueCards = onlyHard
      ? cards.filter(c => c.nextReviewDate <= now).map(c => c.id)
      : cards.map(c => c.id);
    return [...dueCards].sort(() => Math.random() - 0.5);
  }, [onlyHard, cards]);

  const handleStartStudy = useCallback(() => {
    // "Учить всё" — запускаем тренировку по выбранному количеству карточек
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);

    // Создаем новую фазу при каждом запуске
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const shuffled = getShuffledDueCardIds();
    const cardCount = limit ?? shuffled.length;

    Analytics.studyModeSelected('flashcard', cardCount);
    Analytics.studySessionStart({
      setId,
      mode: 'flashcard',
      cardCount,
      isReview: onlyHard,
      phaseId,
    });

    navigation.navigate('Study', {
      setId,
      mode: 'classic',
      studyAll: true,
      cardLimit: limit,
      onlyHard,
      dueCardIds: shuffled,
      phaseId,
      totalPhaseCards: shuffled.length,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, onlyHard, getShuffledDueCardIds]);

  const handleStartMatch = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);

    // Создаем новую фазу при каждом запуске
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const shuffled = getShuffledDueCardIds();
    const cardCount = limit ?? shuffled.length;

    Analytics.studyModeSelected('match', cardCount);
    Analytics.studySessionStart({
      setId,
      mode: 'match',
      cardCount,
      isReview: false,
      phaseId,
    });

    navigation.navigate('Match', {
      setId,
      cardLimit: limit,
      dueCardIds: shuffled,
      phaseId,
      totalPhaseCards: shuffled.length,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, getShuffledDueCardIds]);

  const handleStartMultipleChoice = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);

    // Создаем новую фазу при каждом запуске
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const shuffled = getShuffledDueCardIds();
    const cardCount = limit ?? shuffled.length;

    Analytics.studyModeSelected('quiz', cardCount);
    Analytics.studySessionStart({
      setId,
      mode: 'quiz',
      cardCount,
      isReview: false,
      phaseId,
    });

    navigation.navigate('MultipleChoice', {
      setId,
      cardLimit: limit,
      dueCardIds: shuffled,
      questionIndex: 1,
      totalQuestions: limit ?? shuffled.length,
      phaseId,
      totalPhaseCards: shuffled.length,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, getShuffledDueCardIds]);

  const handleStartContextFill = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);
    navigation.navigate('ContextFill', {
      setId,
      cardLimit: limit,
    });
  }, [navigation, setId, wordLimit]);

  const handleStartWordBuilder = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);

    // Новая фаза
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const shuffled = getShuffledDueCardIds();

    navigation.navigate('WordBuilder', {
      setId,
      cardLimit: limit,
      dueCardIds: shuffled,
      phaseId,
      totalPhaseCards: shuffled.length,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, getShuffledDueCardIds]);

  const handleStartAudio = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);

    // Новая фаза
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const shuffled = getShuffledDueCardIds();

    navigation.navigate('AudioLearning', {
      setId,
      cardLimit: limit,
      dueCardIds: shuffled,
      phaseId,
      totalPhaseCards: shuffled.length,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, getShuffledDueCardIds]);

  const handleSelectStudyMode = useCallback(
    (mode: StudyMode) => {
      switch (mode) {
        case 'classic': handleStartStudy(); break;
        case 'match': handleStartMatch(); break;
        case 'multipleChoice': handleStartMultipleChoice(); break;
        case 'wordBuilder': handleStartWordBuilder(); break;
        case 'audio': handleStartAudio(); break;
        case 'contextFill': handleStartContextFill(); break;
      }
    },
    [handleStartStudy, handleStartMatch, handleStartMultipleChoice, handleStartWordBuilder, handleStartAudio, handleStartContextFill]
  );

  const handleSelectWordLimit = useCallback(
    (val: '10' | '20' | '30' | 'all') => {
      setWordLimit(val);
      const limit = val === 'all' ? null : Number(val);
      updateSettings({ studyCardLimit: limit });
      DatabaseService.saveSettings();
    },
    [updateSettings]
  );

  const openAddCardSheet = useCallback(() => {
    setNewFront('');
    setNewBack('');
    setShowAddCard(true);
  }, []);


  const handleEditCard = useCallback(
    (cardId: string) => {
      navigation.navigate('CardEditor', { setId, cardId });
    },
    [navigation, setId]
  );

  const handleDeleteCard = useCallback(() => {
    if (!actionCardId) return;
    deleteCard(actionCardId);
    decrementCardCount(setId);
    const statsSnapshot = selectSetStats(setId);
    updateSetStats(setId, {
      cardCount: statsSnapshot.total,
      newCount: statsSnapshot.newCount,
      learningCount: statsSnapshot.learningCount,
      reviewCount: statsSnapshot.reviewCount,
      masteredCount: statsSnapshot.masteredCount,
    });
    setActionCardId(null);
  }, [actionCardId, deleteCard, decrementCardCount, setId, updateSetStats]);

  const handleCreateCard = useCallback(() => {
    const front = newFront.trim();
    const back = newBack.trim();
    const example = newExample.trim();
    const mnemonic = newMnemonic.trim();
    if (!front || !back) return;
    setIsAdding(true);
    try {
      addCard({ 
        setId, 
        frontText: front, 
        backText: back, 
        example: example || undefined,
        mnemonic: mnemonic || undefined,
      });
      const statsSnapshot = selectSetStats(setId);
      updateSetStats(setId, {
        cardCount: statsSnapshot.total,
        newCount: statsSnapshot.newCount,
        learningCount: statsSnapshot.learningCount,
        reviewCount: statsSnapshot.reviewCount,
        masteredCount: statsSnapshot.masteredCount,
      });
      setShowAddCard(false);
      setNewFront('');
      setNewBack('');
      setNewExample('');
      setNewMnemonic('');
    } finally {
      setIsAdding(false);
    }
  }, [addCard, newFront, newBack, newExample, newMnemonic, setId, updateSetStats]);

  const handleEditSet = useCallback(() => {
    navigation.navigate('SetEditor', { setId });
  }, [navigation, setId]);

  const isTeacher = useSettingsStore((s) => s.isTeacher) === true;

  // Копия официального набора (юнит учебника) в обычный свой набор — его можно редактировать,
  // но обновления учебника в копию уже не попадут, а прогресс начинается заново.
  const handleForkOfficialSet = useCallback(async () => {
    const ok = await confirmAction(
      'Сделать копию себе?',
      'Официальный набор нельзя менять. Копию можно редактировать, но обновления учебника в неё не попадут, а прогресс учеников начнётся заново.',
      'Сделать копию',
    );
    if (!ok) return;
    const result = await BookService.forkSet(setId);
    if (!result.ok) {
      toast.error(`Не удалось сделать копию. ${describeError(result.error, 'Попробуй ещё раз.')}`);
      return;
    }
    const { newSetId } = result.data;
    const { data: { session } } = await supabase.auth.getSession();
    const [ownSets, newCards] = await Promise.all([
      NeonService.loadSets(session?.user?.id),
      NeonService.loadCardsBySet(newSetId),
    ]);
    const newSet = ownSets.find((x) => x.id === newSetId);
    if (!newSet) {
      toast.success('Копия создана — она появится в твоих наборах после обновления');
      return;
    }
    useSetsStore.getState().mergeSets([newSet]);
    useCardsStore.getState().replaceSetCards(newSetId, newCards);
    navigation.replace('SetDetail', { setId: newSetId });
  }, [navigation, setId]);

  // Разминка перед уроком (план §3.4): слова из других наборов этого курса, которым пришло время
  const activeCourseId = useCoursesStore((s) => s.activeCourseId);
  const allCardsMap = useCardsStore((s) => s.cards);
  const allCardsBySet = useCardsStore((s) => s.cardsBySet);
  const warmup = useMemo(() => {
    if (!set) return { waiting: [] as Card[], pool: [] as Card[] };
    const courseId = activeCourseId && isSetInCourse(set, activeCourseId) ? activeCourseId : set.courseId;
    if (!courseId) return { waiting: [] as Card[], pool: [] as Card[] };
    const now = Date.now();
    const waiting: Card[] = [];
    const pool: Card[] = [];
    for (const other of useSetsStore.getState().getAllSets()) {
      if (other.id === set.id || !isSetInCourse(other, courseId)) continue;
      for (const id of allCardsBySet[other.id] || []) {
        const card = allCardsMap[id];
        if (!card) continue;
        pool.push(card);
        if (isCardWaitingReview(card, now)) waiting.push(card);
      }
    }
    waiting.sort((a, b) => a.nextReviewDate - b.nextReviewDate);
    return { waiting: waiting.slice(0, 10), pool };
  }, [set, activeCourseId, allCardsMap, allCardsBySet]);

  const handleWarmup = useCallback(() => {
    triggerHaptic('selection');
    let queue = warmup.waiting;
    if (queue.length === 0) return;
    // Тесту нужно хотя бы 4 варианта ответа — добираем карточками из прошлых уроков
    if (queue.length < 4) {
      const taken = new Set(queue.map((c) => c.id));
      queue = [...queue, ...warmup.pool.filter((c) => !taken.has(c.id)).slice(0, 4 - queue.length)];
    }
    navigation.navigate('MultipleChoice', {
      setId: queue[0].setId,
      cardLimit: queue.length,
      dueCardIds: queue.map((c) => c.id),
      questionIndex: 1,
      totalQuestions: queue.length,
      phaseId: `warmup_${Date.now()}`,
      totalPhaseCards: queue.length,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, warmup]);

  const handleSetMenu = useCallback(() => {
    if (set?.isOfficial && isTeacher) {
      handleForkOfficialSet();
      return;
    }
    handleEditSet();
  }, [handleEditSet, handleForkOfficialSet, isTeacher, set?.isOfficial]);

  const handlePublish = useCallback(async () => {
    if (!publishCategory) {
      toast.info('Выбери категорию');
      return;
    }
    setIsPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        toast.error('Нужно войти в аккаунт');
        return;
      }
      const tags = publishTags.split(',').map(t => t.trim()).filter(Boolean);
      const result = await LibraryService.publishSet(session.user.id, {
        setId,
        description: publishDescription.trim() || undefined,
        category: publishCategory,
        tags: tags.length > 0 ? tags : undefined,
      });
      setIsPublished(true);
      setLibrarySetId(result.librarySetId);
      setShowPublishModal(false);
      toast.success('Набор опубликован в библиотеке');
    } catch (e: any) {
      toast.error(describeError(e, 'Не удалось опубликовать'));
    } finally {
      setIsPublishing(false);
    }
  }, [setId, publishDescription, publishCategory, publishTags]);

  // Рендер карточки в списке
  const renderCard = useCallback(
    ({ item }: { item: Card }) => (
      <Pressable
        accessibilityRole="button"
        // Вложенные кнопки (изменить, меню) VoiceOver внутри доступного родителя не видит —
        // отдаём их действиями карточки (жест вверх/вниз)
        accessibilityLabel={`${item.frontText ?? (item as any).front}. ${item.backText ?? (item as any).back}${isCardLearned(item) ? '. Выучена' : ''}`}
        accessibilityActions={[
          { name: 'longpress', label: 'Посмотреть' },
          ...(isReadOnly ? [] : [{ name: 'edit', label: 'Изменить' }, { name: 'menu', label: 'Действия' }]),
        ]}
        onAccessibilityAction={(e) => {
          const action = e.nativeEvent.actionName;
          if (action === 'longpress') setPreviewCard(item);
          else if (action === 'edit') handleEditCard(item.id);
          else if (action === 'menu') setActionCardId(item.id);
        }}
        onLongPress={() => {
          triggerHaptic('selection');
          setPreviewCard(item);
        }}
        delayLongPress={300}
        style={[
          styles.cardItem,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.cardTopRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  isCardLearned(item)
                    ? alpha(colors.success, 10)
                    : colors.surfaceMuted,
                borderColor:
                  isCardLearned(item)
                    ? alpha(colors.success, 40)
                    : colors.border,
              },
            ]}
          >
            {isCardLearned(item) ? (
              <Check size={iconSize.xs} color={colors.successText} strokeWidth={2.5} />
            ) : (
              <Circle size={14} color={colors.textTertiary} strokeWidth={2} />
            )}
          </View>

          {!isReadOnly && (
            <Pressable
              onPress={() => handleEditCard(item.id)}
              hitSlop={8}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Изменить карточку"
            >
              <Edit3 size={iconSize.s} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <Text variant="h3" style={[styles.cardFront, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.frontText ?? (item as any).front}
        </Text>
        <Text
          variant="bodySmall"
          color="secondary"
          numberOfLines={2}
          style={styles.cardBack}
        >
          {item.backText ?? (item as any).back}
        </Text>

        {!isReadOnly && (
          <Pressable
            hitSlop={8}
            style={styles.menuButton}
            onPress={() => setActionCardId(item.id)}
            accessibilityRole="button"
            accessibilityLabel="Действия с карточкой"
          >
            <MoreHorizontal size={iconSize.s} color={colors.textTertiary} />
          </Pressable>
        )}
      </Pressable>
    ),
    [colors, handleEditCard, isReadOnly]
  );

  const keyExtractor = useCallback((item: Card) => item.id, []);

  // Рендер хедера
  const ListHeader = useMemo(
    () => (
      <View style={styles.header}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={styles.topIcon}
            accessibilityRole="button"
            accessibilityLabel="Назад"
          >
            <ArrowLeft size={iconSize.m} color={colors.textPrimary} />
          </Pressable>
          <Text
            variant="body"
            style={[styles.topTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {set?.title || 'Набор'}
          </Text>
          <Pressable
            onPress={handleSetMenu}
            hitSlop={10}
            style={styles.topIcon}
            accessibilityRole="button"
            accessibilityLabel="Действия с набором"
          >
            <MoreHorizontal size={iconSize.m} color={colors.textPrimary} />
          </Pressable>
        </View>

        {set?.isOfficial && (
          <View style={[styles.officialBadge, { backgroundColor: alpha(colors.primary, 10) }]}>
            <BookOpen size={14} color={colors.primary} />
            <Text style={[styles.officialBadgeText, { color: colors.primary }]} numberOfLines={1}>
              По учебнику{set.bookTitle ? ` · ${set.bookTitle}` : ''}
            </Text>
          </View>
        )}

        {warmup.waiting.length > 0 && (
          <Pressable accessibilityRole="button"
            onPress={handleWarmup}
            style={[styles.warmupBanner, { backgroundColor: alpha(colors.warning, 10), borderColor: alpha(colors.warning, 40) }]}
          >
            {/* Компактно, в одну строку: баннер не должен отодвигать прогресс и карточки */}
            <Text style={[styles.warmupTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              Разминка · {warmup.waiting.length} слов из прошлых уроков
              <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>
                {' '}· ~{Math.max(1, Math.round(warmup.waiting.length / 4))} мин
              </Text>
            </Text>
            <Text style={[styles.warmupAction, { color: colors.warning }]}>Начать</Text>
          </Pressable>
        )}

        <View style={styles.progressBlock}>
          <ProgressBar progress={stats.progress} accessibilityLabel="Прогресс набора" />
        </View>

        <View style={styles.segmented}>
          <FilterPill
            label="Все"
            active={filter === 'all'}
            onPress={() => setFilter('all')}
            colors={colors}
          />
          <FilterPill
            label="Запомнил"
            active={filter === 'mastered'}
            onPress={() => setFilter('mastered')}
            colors={colors}
          />
          <FilterPill
            label="Не запомнил"
            active={filter === 'unmastered'}
            onPress={() => setFilter('unmastered')}
            colors={colors}
          />
        </View>

        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Search size={18} color={colors.textTertiary} style={{ marginRight: spacing.xs }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск по словам…"
              placeholderTextColor={colors.textTertiary}
              style={[styles.searchInput, { color: colors.textPrimary }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
            />
          </View>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Фильтр"
            style={[
              styles.sortButton,
              { backgroundColor: colors.surface, borderColor: colors.border, display: 'none' },
            ]}
          >
            <SlidersHorizontal size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.cardsHeader}>
          <Text variant="h3" style={{ color: colors.textPrimary }}>
            Карточки ({filteredCards.length})
          </Text>
          {/* «+ Добавить» здесь убран — он дублировал «Добавить карточку» в нижней панели */}
          {!isReadOnly && (
            <Pressable accessibilityRole="button"
              accessibilityLabel="Создать карточки из фото или файла"
              onPress={() => { triggerHaptic('selection'); navigation.navigate('ImportFiles', { setId }); }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}
            >
              <Camera size={iconSize.xs} color={colors.primary} />
              <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '700' }}>
                Из фото
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    ),
    [set, stats, colors, filteredCards.length, navigation, openAddCardSheet, handleSetMenu, filter, search, setId, warmup, handleWarmup]
  );

  // Пустой список
  const ListEmpty = useMemo(
    () => (
      isReadOnly ? (
        <EmptyState icon={Layers} compact title="Учитель пока не добавил карточки" />
      ) : (
        // Самый удобный момент попробовать фото — набор только что создан и пуст
        <EmptyState
          icon={Camera}
          compact
          title="Пока нет карточек"
          description="Сфотографируй страницу учебника — карточки появятся сами"
          action={{ label: 'Из фото или файла', onPress: () => navigation.navigate('ImportFiles', { setId }) }}
          secondaryAction={{ label: 'Добавить вручную', onPress: openAddCardSheet }}
        />
      )
    ),
    [openAddCardSheet, isReadOnly, navigation, setId]
  );

  if (!set) {
    return <MissingSet missing={setMissing} onMissing={setSetMissing} onBack={() => navigation.goBack()} />;
  }

  return (
    <Container padded={false} edges={['top', 'bottom']}>
      <FlatList
        data={filteredCards}
        renderItem={renderCard}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        numColumns={2}
        columnWrapperStyle={styles.columns}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={8}
        updateCellsBatchingPeriod={50}
      />

      <View
        style={[
          styles.bottomBar,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Pressable accessibilityRole="button"
          onPress={() => { triggerHaptic('selection'); openAddCardSheet(); }}
          style={[styles.secondaryAction, { borderColor: colors.border }]}
        >
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            Добавить карточку
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button"
          onPress={() => { triggerHaptic('selection'); setShowStudySheet(true); }}
          style={[styles.primaryAction, { backgroundColor: colors.primaryFill }]}
        >
          <Text variant="body" style={{ color: colors.onPrimary, fontWeight: '700' }}>
            Учить всё
          </Text>
          <Text variant="caption" style={{ color: colors.onPrimary, opacity: 0.85 }}>
            Будет включено: {filteredCards.length || set.cardCount}
          </Text>
        </Pressable>
      </View>

      {actionCardId && (
        <View style={[styles.sheetWrapper, { zIndex: 25 }]} pointerEvents="box-none">
          <Pressable
            style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
            onPress={() => setActionCardId(null)}
          />
          <View
            style={[
              styles.sheet,
              { backgroundColor: modalSurface, borderColor: modalBorder },
            ]}
          >
            <Pressable accessibilityRole="button" style={styles.sheetAction} onPress={handleDeleteCard}>
              <Text variant="body" style={{ color: colors.error, fontWeight: '700' }}>
                Удалить
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.sheetAction} onPress={() => setActionCardId(null)}>
              <Text variant="body" style={{ color: modalTextPrimary, fontWeight: '700' }}>
                Отмена
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {showAddCard && (
        <KeyboardAvoidingView
          style={[styles.sheetWrapper, { zIndex: 30 }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Pressable
            style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
            onPress={() => setShowAddCard(false)}
          />
          <View
            style={[
              styles.addSheet,
              { backgroundColor: modalSurface, borderColor: modalBorder, maxHeight: '85%' },
            ]}
          >
            <View style={styles.addSheetHeader}>
              <Text variant="h3" style={{ color: modalTextPrimary }}>
                Новая карточка
              </Text>
              <Pressable accessibilityRole="button"
                onPress={() => { setShowAddCard(false); navigation.navigate('ImportFiles', { setId }); }}
                style={[styles.exportButton, { backgroundColor: colors.primaryFill }]}
              >
                <Camera size={iconSize.xs} color={colors.onPrimary} />
                <Text variant="bodySmall" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                  Из фото или файла
                </Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.m, paddingBottom: spacing.s }}
            >
              <View style={styles.addField}>
                <Text variant="label" color="primary" style={styles.fieldLabel}>
                  Иностранное слово
                </Text>
                <TextInput
                  value={newFront}
                  onChangeText={setNewFront}
                  maxLength={config.limits.maxCardFrontLength}
                  placeholder="Например: scharf"
                  placeholderTextColor={modalPlaceholder}
                  style={[
                    styles.addInput,
                    {
                      color: modalTextPrimary,
                      borderColor: modalBorder,
                      backgroundColor: modalInputBg,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                    }
                  ]}
                />
              </View>

              <View style={styles.addField}>
                <Text variant="label" color="primary" style={styles.fieldLabel}>
                  Перевод
                </Text>
                <TextInput
                  value={newBack}
                  onChangeText={setNewBack}
                  maxLength={config.limits.maxCardBackLength}
                  placeholder="Например: острый"
                  placeholderTextColor={modalPlaceholder}
                  style={[
                    styles.addInput,
                    {
                      color: modalTextPrimary,
                      borderColor: modalBorder,
                      backgroundColor: modalInputBg,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                    }
                  ]}
                />
              </View>

              <View style={styles.addField}>
                <Text variant="label" color="primary" style={styles.fieldLabel}>
                  Пример
                </Text>
                <TextInput
                  value={newExample}
                  onChangeText={setNewExample}
                  maxLength={config.limits.maxCardExampleLength}
                  placeholder="Например: Der scharfe Pfeffer..."
                  placeholderTextColor={modalPlaceholder}
                  style={[
                    styles.addInput,
                    {
                      color: modalTextPrimary,
                      borderColor: modalBorder,
                      backgroundColor: modalInputBg,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                    }
                  ]}
                  multiline
                />
              </View>

              <View style={styles.addField}>
                <Text variant="label" color="primary" style={styles.fieldLabel}>
                  Мнемоника
                </Text>
                <TextInput
                  value={newMnemonic}
                  onChangeText={setNewMnemonic}
                  placeholder="Своя ассоциация для запоминания"
                  placeholderTextColor={modalPlaceholder}
                  style={[
                    styles.addInput,
                    {
                      color: modalTextPrimary,
                      borderColor: modalBorder,
                      backgroundColor: modalInputBg,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                    }
                  ]}
                  multiline
                />
              </View>
            </ScrollView>

            <View style={styles.addActions}>
              <Pressable accessibilityRole="button" style={[styles.secondaryAction, { borderColor: modalBorder }]} onPress={() => setShowAddCard(false)}>
                <Text variant="body" style={{ color: modalTextSecondary, fontWeight: '700' }}>
                  Отмена
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                style={[
                  styles.primaryAction,
                  {
                    backgroundColor: newFront.trim() && newBack.trim() && !isAdding
                      ? colors.primaryFill
                      : modalBorder,
                  },
                ]}
                disabled={!newFront.trim() || !newBack.trim() || isAdding}
                onPress={handleCreateCard}
              >
                <Text
                  variant="body"
                  style={{ color: colors.onPrimary, fontWeight: '700' }}
                >
                  Сохранить
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <StudyModeSheet
        visible={showStudySheet}
        onClose={() => setShowStudySheet(false)}
        subtitle={`Набор: ${set?.title || 'Набор'} • ${set?.cardCount || 0} ${pluralize(set?.cardCount || 0, 'слово', 'слова', 'слов')}`}
        onSelectMode={handleSelectStudyMode}
        settings={{
          onlyHard,
          onToggleOnlyHard: () => setOnlyHard((v) => !v),
          showMnemonic,
          onToggleShowMnemonic: () => setShowMnemonic((v) => !v),
          wordLimit,
          onSelectWordLimit: handleSelectWordLimit,
        }}
      />

      {showPublishModal && (
        <View style={[styles.importOverlay, { backgroundColor: backdropColor }]} pointerEvents="box-none">
          <Pressable
            style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
            onPress={() => !isPublishing && setShowPublishModal(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%', maxWidth: 480, alignItems: 'center' }}
          >
            <View
              style={[
                styles.importCard,
                { backgroundColor: modalSurface, borderColor: modalBorder },
              ]}
            >
              <View style={styles.importTopBar}>
                <Pressable
                  onPress={() => !isPublishing && setShowPublishModal(false)}
                  hitSlop={10}
                  style={styles.topIcon}
                  accessibilityRole="button"
                  accessibilityLabel="Закрыть"
                >
                  <X size={iconSize.m} color={modalTextPrimary} />
                </Pressable>
                <Text variant="body" style={[styles.importTitle, { color: modalTextPrimary }]}>
                  Опубликовать в библиотеке
                </Text>
                <View style={styles.topIcon} />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.m, paddingBottom: spacing.s }}>
                <View style={styles.addField}>
                  <Text variant="label" color="primary" style={styles.fieldLabel}>
                    Описание (необязательно)
                  </Text>
                  <TextInput
                    value={publishDescription}
                    onChangeText={setPublishDescription}
                    placeholder="Расскажи о наборе..."
                    placeholderTextColor={modalPlaceholder}
                    maxLength={500}
                    multiline
                    style={[
                      styles.addInput,
                      {
                        color: modalTextPrimary,
                        borderColor: modalBorder,
                        backgroundColor: modalInputBg,
                        minHeight: 80,
                        textAlignVertical: 'top',
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                      },
                    ]}
                  />
                  <Text variant="caption" color="secondary" style={{ alignSelf: 'flex-end' }}>
                    {publishDescription.length}/500
                  </Text>
                </View>

                <View style={styles.addField}>
                  <Text variant="label" color="primary" style={styles.fieldLabel}>
                    Категория *
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {LIBRARY_CATEGORIES.map((cat) => (
                      <Pressable accessibilityRole="button" accessibilityState={{ selected: publishCategory === cat.key }}
                        key={cat.key}
                        onPress={() => setPublishCategory(cat.key)}
                        style={[
                          styles.wordChip,
                          {
                            backgroundColor: publishCategory === cat.key ? colors.primaryFill : 'transparent',
                            borderColor: publishCategory === cat.key ? colors.primaryFill : modalBorder,
                          },
                        ]}
                      >
                        <Text
                          variant="caption"
                          style={{
                            color: publishCategory === cat.key ? colors.onPrimary : modalTextSecondary,
                            fontWeight: '700',
                          }}
                        >
                          {cat.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.addField}>
                  <Text variant="label" color="primary" style={styles.fieldLabel}>
                    Теги (через запятую)
                  </Text>
                  <TextInput
                    value={publishTags}
                    onChangeText={setPublishTags}
                    placeholder="например: A1, начинающим, еда"
                    placeholderTextColor={modalPlaceholder}
                    style={[
                      styles.addInput,
                      {
                        color: modalTextPrimary,
                        borderColor: modalBorder,
                        backgroundColor: modalInputBg,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                      },
                    ]}
                  />
                </View>
              </ScrollView>

              <View style={styles.addActions}>
                <Pressable accessibilityRole="button"
                  style={[styles.secondaryAction, { borderColor: modalBorder }]}
                  onPress={() => !isPublishing && setShowPublishModal(false)}
                >
                  <Text variant="body" style={{ color: modalTextSecondary, fontWeight: '700' }}>
                    Отмена
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  style={[
                    styles.primaryAction,
                    {
                      backgroundColor: publishCategory && !isPublishing ? colors.primaryFill : modalBorder,
                      flexDirection: 'row',
                      gap: spacing.xs,
                    },
                  ]}
                  disabled={!publishCategory || isPublishing}
                  onPress={handlePublish}
                >
                  {isPublishing ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <Globe size={18} color={colors.onPrimary} />
                      <Text variant="body" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                        Опубликовать
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* Card Preview Modal */}
      <Modal
        visible={previewCard !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewCard(null)}
      >
        <Pressable accessibilityRole="button"
          style={[styles.previewOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => setPreviewCard(null)}
          accessibilityLabel="Закрыть"
        >
          {Platform.OS === 'web' ? (
            <View
              style={[
                styles.previewCard,
                {
                  backgroundColor: alpha(colors.surface, 40),
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.previewFrontSection}>
                <Text
                  style={[styles.previewFrontText, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  allowFontScaling={false}
                >
                  {previewCard?.frontText ?? (previewCard as any)?.front}
                </Text>
              </View>
              <View style={[styles.previewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.previewBackSection}>
                <Text
                  style={[styles.previewBackText, { color: colors.textSecondary }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  allowFontScaling={false}
                >
                  {previewCard?.backText ?? (previewCard as any)?.back}
                </Text>
                {previewCard?.example ? (
                  <Text style={[styles.previewExample, { color: colors.textTertiary }]}>
                    {previewCard.example}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <BlurView
              blurType={theme === 'dark' ? 'dark' : 'xlight'}
              blurAmount={24}
              style={[
                styles.previewCard,
                { borderColor: colors.border },
              ]}
            >
              <View style={styles.previewFrontSection}>
                <Text
                  style={[styles.previewFrontText, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  allowFontScaling={false}
                >
                  {previewCard?.frontText ?? (previewCard as any)?.front}
                </Text>
              </View>
              <View style={[styles.previewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.previewBackSection}>
                <Text
                  style={[styles.previewBackText, { color: colors.textSecondary }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  allowFontScaling={false}
                >
                  {previewCard?.backText ?? (previewCard as any)?.back}
                </Text>
                {previewCard?.example ? (
                  <Text style={[styles.previewExample, { color: colors.textTertiary }]}>
                    {previewCard.example}
                  </Text>
                ) : null}
              </View>
            </BlurView>
          )}
        </Pressable>
      </Modal>

    </Container>
  );
}

function FilterPill({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }}
      onPress={() => { triggerHaptic('selection'); onPress(); }}
      style={[
        styles.filterPill,
        {
          backgroundColor: active ? colors.primaryFill : 'transparent',
          borderColor: active ? colors.primaryFill : colors.border,
        },
      ]}
    >
      <Text
        variant="bodySmall"
        style={{ color: active ? colors.onPrimary : colors.textSecondary, fontWeight: '700' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ==================== СТИЛИ ====================

function MissingSet({ missing, onMissing, onBack }: { missing: boolean; onMissing: (missing: boolean) => void; onBack: () => void }) {
  useEffect(() => {
    DatabaseService.syncStudentCourses().catch(() => {});
    const timer = setTimeout(() => onMissing(true), 8000);
    return () => clearTimeout(timer);
  }, [onMissing]);
  if (!missing) return <Loading fullScreen message="Загрузка..." />;
  return (
    <Container>
      <EmptyState
        icon={Layers}
        title="Набор не найден"
        description="Возможно, его удалили или скрыли. Попробуй открыть курс ещё раз."
        action={{ label: 'Назад', onPress: onBack }}
      />
    </Container>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.s,
    borderBottomWidth: 1,
  },
  topIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
  },
  warmupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    minHeight: 44,
  },
  warmupTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  warmupAction: {
    fontSize: 14,
    fontWeight: '700',
  },
  officialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: spacing.s,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    maxWidth: '100%',
  },
  officialBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  progressBlock: {
    marginTop: spacing.m,
    marginBottom: spacing.s,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.m,
  },
  filterPill: {
    flex: 1,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: spacing.m,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  sortButton: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.l,
    marginBottom: spacing.s,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  columns: {
    paddingHorizontal: spacing.m,
    gap: spacing.s,
  },
  cardItem: {
    flex: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    marginBottom: spacing.s,
    borderWidth: 1,
    minHeight: 140,
    position: 'relative',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  statusBadge: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: spacing.xs,
  },
  cardFront: {
    marginBottom: spacing.xs,
  },
  cardBack: {
    marginBottom: spacing.m,
  },
  menuButton: {
    position: 'absolute',
    right: spacing.s,
    bottom: spacing.s,
    padding: spacing.xs,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.m,
    paddingBottom: spacing.m + 10,
    flexDirection: 'row',
    gap: spacing.m,
    borderTopWidth: 1,
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    paddingHorizontal: spacing.s,
  },
  primaryAction: {
    flex: 1.2,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    paddingHorizontal: spacing.s,
  },
  sheetWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.s,
  },
  sheetAction: {
    paddingVertical: spacing.m,
    alignItems: 'center',
  },
  wordChip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  startBlock: {
    marginTop: spacing.s,
  },
  startButton: {
    borderRadius: borderRadius.l,
    paddingVertical: spacing.m,
    alignItems: 'center',
  },
  addSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.m,
  },
  addSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s,
  },
  addField: {
    gap: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs / 2,
  },
  addInput: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s + 2,
    fontSize: 16,
  },
  exportButton: {
    height: EXPORT_BUTTON_HEIGHT,
    minWidth: 132,
    paddingHorizontal: spacing.m,
    borderRadius: Math.round(EXPORT_BUTTON_HEIGHT * 0.2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addActions: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.s,
  },
  importOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.m,
    zIndex: 45,
  },
  importCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.l,
    gap: spacing.m,
  },
  importTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  importTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
  },
  importButton: {
    height: 56,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },

  // Card Preview Modal
  previewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  previewCard: {
    width: Math.min(340, Dimensions.get('window').width - 48),
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    // Без тени: карточку отделяет затемнение (брендбук, 10)
    ...Platform.select({
      web: {
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
      },
    }) as any,
  },
  previewFrontSection: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  previewFrontText: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  previewDivider: {
    height: 1,
    marginHorizontal: 24,
  },
  previewBackSection: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    gap: 12,
  },
  previewBackText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewExample: {
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
