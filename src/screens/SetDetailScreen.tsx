/**
 * Set Detail Screen
 * @description Экран детали набора карточек
 */
import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { useSetsStore, useCardsStore, useThemeColors, selectSetStats, useSettingsStore } from '@/store';
import { Container, Text, ProgressBar, Loading, Button } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';
import { DatabaseService } from '@/services';
import { apiService } from '@/services/ApiService';
import {
  ArrowLeft,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Edit3,
  Check,
  Circle,
  ChevronRight,
  Sparkles,
  Puzzle,
  Headphones,
  ClipboardList,
  Type,
  File,
  Upload,
  Lightbulb,
  CheckCircle,
  Info,
} from 'lucide-react-native';

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
  const cards = useCardsStore((s) => s.getCardsBySet(setId));
  const addCard = useCardsStore((s) => s.addCard);
  const deleteCard = useCardsStore((s) => s.deleteCard);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newExample, setNewExample] = useState('');
  const [newMnemonic, setNewMnemonic] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showStudySheet, setShowStudySheet] = useState(false);
  const [onlyHard, setOnlyHard] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(true);
  const [wordLimit, setWordLimit] = useState<'10' | '20' | '30' | 'all'>(() => {
    const limit = userSettings.studyCardLimit;
    if (limit === null) return 'all';
    if (limit === 10 || limit === 30) return String(limit) as '10' | '30';
    return '20';
  });

  // Import states
  const [importLoading, setImportLoading] = useState(false);
  const [importedCards, setImportedCards] = useState<Array<{ front: string; back: string; example?: string }>>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStep, setImportStep] = useState<'select' | 'loading' | 'extracting' | 'preview' | 'generating'>('select');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Расчет статистики
  const stats = useMemo(() => {
    if (!set) return { progress: 0, dueCount: 0 };
    const progress = set.cardCount > 0 
      ? Math.round((set.masteredCount / set.cardCount) * 100) 
      : 0;
    const dueCount = set.reviewCount + set.newCount;
    return { progress, dueCount };
  }, [set]);

  const backdropColor = 'rgba(0,0,0,0.35)';
  const modalSurface = theme === 'dark' ? 'rgb(32, 34, 44)' : colors.surface;
  const modalBorder = theme === 'dark' ? 'rgba(255,255,255,0.08)' : colors.border;
  const modalTextPrimary = theme === 'dark' ? '#F8FAFC' : colors.textPrimary;
  const modalTextSecondary = theme === 'dark' ? '#A8B3C1' : colors.textSecondary;
  const modalPlaceholder = theme === 'dark' ? '#94A3B8' : colors.textTertiary;
  const modalInputBg = theme === 'dark' ? 'rgba(255,255,255,0.04)' : colors.surface;
  const modalHandleColor = theme === 'dark' ? '#4b5563' : '#cbd5e1';

  const filteredCards = useMemo(() => {
    const getFront = (card: Card) => card.frontText ?? (card as any).front ?? '';
    const getBack = (card: Card) => card.backText ?? (card as any).back ?? '';
    const query = search.trim().toLowerCase();
    const now = Date.now();

    return cards
      .filter((card) => {
        // mastered = nextReview > сейчас (выученные)
        if (filter === 'mastered') return card.nextReviewDate > now;
        if (filter === 'unmastered') return card.nextReviewDate <= now;
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

  // Обработчики
  const handleStartStudy = useCallback(() => {
    // "Учить всё" — запускаем тренировку по выбранному количеству карточек
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);
    
    // Создаем новую фазу при каждом запуске
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalCards = onlyHard 
      ? cards.filter(c => c.nextReviewDate <= Date.now()).length
      : cards.length;
    
    navigation.navigate('Study', { 
      setId, 
      mode: 'classic', 
      studyAll: true, 
      cardLimit: limit, 
      onlyHard,
      phaseId,
      totalPhaseCards: totalCards,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, onlyHard, cards]);

  const handleStartMatch = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);
    
    // Создаем новую фазу при каждом запуске
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalCards = onlyHard 
      ? cards.filter(c => c.nextReviewDate <= Date.now()).length
      : cards.length;
    
    navigation.navigate('Match', { 
      setId, 
      cardLimit: limit,
      phaseId,
      totalPhaseCards: totalCards,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, onlyHard, cards]);

  const handleStartMultipleChoice = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);
    
    // Создаем новую фазу при каждом запуске
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalCards = onlyHard 
      ? cards.filter(c => c.nextReviewDate <= Date.now()).length
      : cards.length;
    
    navigation.navigate('MultipleChoice', {
      setId,
      cardLimit: limit,
      questionIndex: 1,
      totalQuestions: limit ?? cards.length,
      phaseId,
      totalPhaseCards: totalCards,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, cards.length, onlyHard, cards]);

  const handleStartWordBuilder = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);

    // Новая фаза
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalCards = onlyHard 
      ? cards.filter(c => c.nextReviewDate <= Date.now()).length
      : cards.length;

    navigation.navigate('WordBuilder', {
      setId,
      cardLimit: limit,
      phaseId,
      totalPhaseCards: totalCards,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, onlyHard, cards]);

  const handleStartAudio = useCallback(() => {
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    setShowStudySheet(false);

    // Новая фаза
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalCards = onlyHard 
      ? cards.filter(c => c.nextReviewDate <= Date.now()).length
      : cards.length;

    navigation.navigate('AudioLearning', {
      setId,
      cardLimit: limit,
      phaseId,
      totalPhaseCards: totalCards,
      studiedInPhase: 0,
      phaseOffset: 0,
    });
  }, [navigation, setId, wordLimit, onlyHard, cards]);

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

  const openImportModal = useCallback(() => {
    setImportStep('select');
    setImportedCards([]);
    setImportError(null);
    setShowImportModal(true);
  }, []);

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportStep('select');
    setImportedCards([]);
    setImportError(null);
  }, []);

  // Parse TSV file content
  const parseTSV = useCallback((content: string): Array<{ front: string; back: string }> => {
    const lines = content.trim().split('\n');
    const cards: Array<{ front: string; back: string }> = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Split by tab
      const parts = trimmedLine.split('\t');
      if (parts.length >= 2) {
        const front = parts[0].trim();
        const back = parts[1].trim();
        if (front && back) {
          cards.push({ front, back });
        }
      }
    }
    
    return cards;
  }, []);

  // Handle file selection (web)
  const handleFileSelect = useCallback(async (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isTsv = fileName.endsWith('.tsv');

    if (!isPdf && !isTsv) {
      setImportError('Поддерживаются только файлы .tsv и .pdf');
      return;
    }

    if (isPdf && file.size > 10 * 1024 * 1024) {
      setImportError('PDF файл слишком большой. Максимум 10 МБ.');
      return;
    }

    setImportLoading(true);
    setImportError(null);

    try {
      if (isTsv) {
        setImportStep('loading');
        const content = await file.text();
        const parsedCards = parseTSV(content);

        if (parsedCards.length === 0) {
          setImportError('Не удалось найти карточки в файле. Проверьте формат TSV (слово[TAB]перевод)');
          setImportStep('select');
        } else {
          setImportedCards(parsedCards);
          setImportStep('preview');
        }
      } else {
        // PDF
        setImportStep('extracting');
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data:application/pdf;base64, prefix
            const base64Data = result.split(',')[1] || result;
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const parsedCards = await apiService.extractPdfCards(base64);

        if (parsedCards.length === 0) {
          setImportError('Не удалось найти карточки в PDF. Убедитесь, что файл содержит список слов в формате "слово – перевод".');
          setImportStep('select');
        } else {
          setImportedCards(parsedCards);
          setImportStep('preview');
        }
      }
    } catch (error) {
      setImportError(isPdf ? 'Ошибка при обработке PDF. Попробуйте ещё раз.' : 'Ошибка при чтении файла');
      setImportStep('select');
    } finally {
      setImportLoading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  }, [parseTSV]);

  // Trigger file input click
  const triggerFileSelect = useCallback(async () => {
    if (Platform.OS === 'web') {
      if (fileInputRef.current) {
        (fileInputRef.current as any).click();
      }
      return;
    }

    // Native (Android / iOS)
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });
      const file = result[0];
      if (!file) return;

      const fileName = (file.name || '').toLowerCase();
      const isPdf = fileName.endsWith('.pdf');
      const isTsv = fileName.endsWith('.tsv');

      if (!isPdf && !isTsv) {
        setImportError('Поддерживаются только файлы .tsv и .pdf');
        return;
      }

      if (isPdf && file.size && file.size > 10 * 1024 * 1024) {
        setImportError('PDF файл слишком большой. Максимум 10 МБ.');
        return;
      }

      setImportLoading(true);
      setImportError(null);

      try {
        const fileUri = (file as any).fileCopyUri || file.uri;

        if (isTsv) {
          setImportStep('loading');
          const response = await fetch(fileUri);
          const content = await response.text();
          const parsedCards = parseTSV(content);

          if (parsedCards.length === 0) {
            setImportError('Не удалось найти карточки в файле. Проверьте формат TSV (слово[TAB]перевод)');
            setImportStep('select');
          } else {
            setImportedCards(parsedCards);
            setImportStep('preview');
          }
        } else {
          // PDF — read as base64 via react-native-fs
          setImportStep('extracting');
          const RNFS = (await import('react-native-fs')).default;
          const base64 = await RNFS.readFile(fileUri, 'base64');

          const parsedCards = await apiService.extractPdfCards(base64);

          if (parsedCards.length === 0) {
            setImportError('Не удалось найти карточки в PDF. Убедитесь, что файл содержит список слов в формате "слово – перевод".');
            setImportStep('select');
          } else {
            setImportedCards(parsedCards);
            setImportStep('preview');
          }
        }
      } catch (error) {
        setImportError(isPdf ? 'Ошибка при обработке PDF. Попробуйте ещё раз.' : 'Ошибка при чтении файла');
        setImportStep('select');
      } finally {
        setImportLoading(false);
      }
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        setImportError('Ошибка при выборе файла');
      }
    }
  }, [parseTSV]);

  // Generate examples via Gemini then import all cards
  const handleImportCards = useCallback(async () => {
    if (importedCards.length === 0) return;

    setImportLoading(true);
    setImportStep('generating');

    try {
      // Генерируем примеры через Gemini
      let cardsWithExamples = importedCards;
      try {
        const result = await apiService.generateExamples(
          importedCards.map(c => ({ front: c.front, back: c.back }))
        );
        if (result.length > 0) {
          cardsWithExamples = importedCards.map((card, i) => ({
            ...card,
            example: result[i]?.example || '',
          }));
        }
      } catch (aiError) {
        console.warn('Gemini examples failed, importing without examples:', aiError);
        // Продолжаем импорт без примеров
      }

      for (const card of cardsWithExamples) {
        addCard({ setId, frontText: card.front, backText: card.back, example: card.example });
      }

      // Update stats
      const statsSnapshot = selectSetStats(setId);
      updateSetStats(setId, {
        cardCount: statsSnapshot.total,
        newCount: statsSnapshot.newCount,
        learningCount: statsSnapshot.learningCount,
        reviewCount: statsSnapshot.reviewCount,
        masteredCount: statsSnapshot.masteredCount,
      });

      // Save to database
      await DatabaseService.saveCards();
      await DatabaseService.saveSets();

      closeImportModal();
    } catch (error) {
      setImportError('Ошибка при создании карточек');
      setImportStep('preview');
    } finally {
      setImportLoading(false);
    }
  }, [importedCards, addCard, setId, updateSetStats, closeImportModal]);

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

  // Рендер карточки в списке
  const renderCard = useCallback(
    ({ item }: { item: Card }) => (
      <View
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
                  // Галочка только если nextReview в будущем (выучено)
                  item.nextReviewDate > Date.now()
                    ? 'rgba(16, 185, 129, 0.15)' 
                    : 'rgba(148, 163, 184, 0.15)',
                borderColor:
                  item.nextReviewDate > Date.now()
                    ? 'rgba(16, 185, 129, 0.3)' 
                    : colors.border,
              },
            ]}
          >
            {/* Галочка показывается только если выучено (nextReview > сейчас) */}
            {item.nextReviewDate > Date.now() ? (
              <Check size={16} color={colors.success} strokeWidth={2.5} />
            ) : (
              <Circle size={14} color={colors.textTertiary} strokeWidth={2} />
            )}
          </View>

          <Pressable
            onPress={() => handleEditCard(item.id)}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Edit3 size={18} color={colors.textSecondary} />
          </Pressable>
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

        <Pressable hitSlop={8} style={styles.menuButton} onPress={() => setActionCardId(item.id)}>
          <MoreHorizontal size={18} color={colors.textTertiary} />
        </Pressable>
      </View>
    ),
    [colors, handleEditCard]
  );

  const keyExtractor = useCallback((item: Card) => item.id, []);

  // Рендер хедера
  const ListHeader = useMemo(
    () => (
      <View style={styles.header}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topIcon}>
            <ArrowLeft size={20} color={colors.textPrimary} />
          </Pressable>
          <Text
            variant="body"
            style={[styles.topTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {set?.title || 'Набор'}
          </Text>
          <Pressable onPress={handleEditSet} hitSlop={10} style={styles.topIcon}>
            <MoreHorizontal size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.progressBlock}>
          <ProgressBar progress={stats.progress} height={8} />
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
          <Pressable
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
          <Pressable onPress={openAddCardSheet} hitSlop={8}>
            <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '700' }}>
              + Добавить
            </Text>
          </Pressable>
        </View>
      </View>
    ),
    [set, stats, colors, filteredCards.length, navigation, openAddCardSheet, handleEditSet, filter, search]
  );

  // Пустой список
  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🃏</Text>
        <Text variant="body" color="secondary" align="center">
          Пока нет карточек
        </Text>
        <Button
          title="Добавить карточку"
          variant="outline"
          onPress={openAddCardSheet}
          style={styles.emptyButton}
        />
      </View>
    ),
    [openAddCardSheet]
  );

  if (!set) {
    return <Loading fullScreen message="Загрузка..." />;
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
            backgroundColor: theme === 'dark' ? 'rgb(16, 17, 34)' : colors.surface,
          },
        ]}
      >
        <Pressable
          onPress={openAddCardSheet}
          style={[styles.secondaryAction, { borderColor: colors.border }]}
        >
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            Добавить карточку
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setShowStudySheet(true)}
          style={[styles.primaryAction, { backgroundColor: colors.primary }]}
        >
          <Text variant="body" style={{ color: colors.textInverse, fontWeight: '700' }}>
            Учить всё
          </Text>
          <Text variant="caption" style={{ color: colors.textInverse, opacity: 0.85 }}>
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
            <Pressable style={styles.sheetAction} onPress={handleDeleteCard}>
              <Text variant="body" style={{ color: colors.error, fontWeight: '700' }}>
                Удалить
              </Text>
            </Pressable>
            <Pressable style={styles.sheetAction} onPress={() => setActionCardId(null)}>
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
              <Pressable
                onPress={openImportModal}
                style={[styles.exportButton, { backgroundColor: colors.primary }]}
              >
                <File size={18} color={colors.textInverse} />
                <Text variant="bodySmall" style={{ color: colors.textInverse, fontWeight: '700' }}>
                  Импорт
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
              <Pressable style={[styles.secondaryAction, { borderColor: modalBorder }]} onPress={() => setShowAddCard(false)}>
                <Text variant="body" style={{ color: modalTextSecondary, fontWeight: '700' }}>
                  Отмена
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryAction,
                  {
                    backgroundColor: newFront.trim() && newBack.trim() && !isAdding
                      ? colors.primary
                      : modalBorder,
                  },
                ]}
                disabled={!newFront.trim() || !newBack.trim() || isAdding}
                onPress={handleCreateCard}
              >
                <Text
                  variant="body"
                  style={{ color: colors.textInverse, fontWeight: '700' }}
                >
                  Сохранить
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {showStudySheet && (
        <View style={[styles.sheetWrapper, { zIndex: 35 }]} pointerEvents="box-none">
          <Pressable
            style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
            onPress={() => setShowStudySheet(false)}
          />
          <View
            style={[
              styles.studySheet,
              {
                backgroundColor: modalSurface,
                borderColor: modalBorder,
              },
            ]}
          >
            <View style={[styles.studyHandle, { backgroundColor: modalHandleColor }]} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.studyContent}
            >
              <View style={styles.studyHeader}>
                <Text variant="h3" style={{ color: modalTextPrimary }}>
                  Выбор режима
                </Text>
                <Pressable onPress={() => setShowStudySheet(false)} hitSlop={8}>
                  <Text variant="body" style={{ color: modalTextSecondary, fontWeight: '600' }}>
                    Отмена
                  </Text>
                </Pressable>
              </View>
              <Text variant="caption" color="secondary">
                Набор: {set?.title || 'Набор'} • {set?.cardCount || 0} слов
              </Text>

                <Pressable
                  onPress={handleStartStudy}
                  style={[
                    styles.recommendCard,
                    { borderColor: colors.primary, backgroundColor: colors.surface },
                  ]}
                >
                  <View style={styles.recommendBadge}>
                    <Text variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
                      Recommended
                    </Text>
                  </View>
                <View style={styles.recommendHeader}>
                  <View style={styles.recommendIcon}>
                    <Sparkles size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                      Flashcards
                    </Text>
                    <Text variant="caption" color="secondary">
                      Переворот 180° • Немецкий → Русский
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.flashPreview,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                >
                  <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    scharf
                  </Text>
                  <Text variant="caption" color="secondary">
                    Нажми, чтобы перевернуть
                  </Text>
                </View>
                <View style={styles.rateRow}>
                  {['Не знаю', 'Сомневаюсь', 'Почти', 'Уверенно'].map((label, idx) => {
                    const colorsMap = ['#EF4444', '#F97316', '#2563EB', '#10B981'];
                    return (
                      <View
                        key={label}
                        style={[
                          styles.ratePill,
                          { borderColor: `${colorsMap[idx]}33`, backgroundColor: `${colorsMap[idx]}1A` },
                        ]}
                      >
                        <Text variant="caption" style={{ color: colorsMap[idx], fontWeight: '700' }}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Pressable>

              <View style={styles.section}>
                <Text variant="caption" color="secondary" style={styles.sectionTitle}>
                  Игры для закрепления
                </Text>
                <View style={styles.gameList}>
                  <GameRow
                    icon={<Puzzle size={18} color={colors.textPrimary} />}
                    title="Match"
                    tag="Быстро"
                    description="Сопоставление слов и переводов"
                    colors={colors}
                    onPress={handleStartMatch}
                  />
                  <GameRow
                    icon={<ClipboardList size={18} color={colors.textPrimary} />}
                    title="Multiple Choice"
                    tag="Лёгко"
                    description="Выбери правильный из 4 вариантов"
                    colors={colors}
                    onPress={handleStartMultipleChoice}
                  />
                <GameRow
                  icon={<Type size={18} color={colors.textPrimary} />}
                  title="Word Builder"
                  tag="Правописание"
                  description="Собери слово из букв"
                  colors={colors}
                  onPress={handleStartWordBuilder}
                />
                  <GameRow
                    icon={<Headphones size={18} color={colors.textPrimary} />}
                    title="Audio Tap"
                    tag="Аудирование"
                    description="Прослушай и выбери верное"
                    colors={colors}
                    onPress={handleStartAudio}
                  />
                </View>
              </View>

              <View style={styles.section}>
                <Text variant="caption" color="secondary" style={styles.sectionTitle}>
                  Настройки
                </Text>
                <View style={styles.settingRow}>
                  <Text variant="body" style={{ color: colors.textPrimary, flexShrink: 1 }}>
                    Только «Не запомнил»
                  </Text>
                  <ToggleSwitch
                    value={onlyHard}
                    onToggle={() => setOnlyHard((v) => !v)}
                    colors={colors}
                  />
                </View>
                <View style={styles.settingRow}>
                  <Text variant="body" style={{ color: colors.textPrimary, flexShrink: 1 }}>
                    Показывать мнемонику после ошибки
                  </Text>
                  <ToggleSwitch
                    value={showMnemonic}
                    onToggle={() => setShowMnemonic((v) => !v)}
                    colors={colors}
                  />
                </View>
                <View style={styles.settingRow}>
                  <Text variant="body" style={{ color: colors.textPrimary, flexShrink: 1 }}>
                    Количество слов
                  </Text>
                  <View style={[styles.wordChips, { flexShrink: 0 }]}>
                    {(['10', '20', '30', 'all'] as const).map((val) => (
                      <Pressable
                        key={val}
                        onPress={() => handleSelectWordLimit(val)}
                        style={[
                          styles.wordChip,
                          {
                            backgroundColor:
                              wordLimit === val ? colors.primary : colors.surface,
                            borderColor: wordLimit === val ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          variant="caption"
                          style={{
                            color: wordLimit === val ? colors.textInverse : colors.textPrimary,
                            fontWeight: '700',
                          }}
                        >
                          {val === 'all' ? 'Все' : val}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {showImportModal && (
        <View style={[styles.importOverlay, { backgroundColor: backdropColor }]} pointerEvents="box-none">
          <Pressable
            style={[styles.sheetBackdrop, { backgroundColor: backdropColor }]}
            onPress={closeImportModal}
          />
          <View
            style={[
              styles.importCard,
              {
                backgroundColor: modalSurface,
                borderColor: modalBorder,
                maxHeight: importStep === 'preview' || importStep === 'generating' || importStep === 'extracting' ? '80%' : undefined,
              },
            ]}
          >
            <View style={styles.importTopBar}>
              <Pressable onPress={closeImportModal} hitSlop={10} style={styles.topIcon}>
                <ArrowLeft size={20} color={modalTextPrimary} />
              </Pressable>
              <Text variant="body" style={[styles.importTitle, { color: modalTextPrimary }]}>
                {importStep === 'preview' ? `Импорт (${importedCards.length} карточек)` : importStep === 'generating' ? 'Генерация примеров...' : importStep === 'extracting' ? 'Обработка PDF...' : 'Импорт из файла'}
              </Text>
              <View style={styles.topIcon} />
            </View>

            {/* Hidden file input for web */}
            {Platform.OS === 'web' && (
              <input
                ref={fileInputRef as any}
                type="file"
                accept=".tsv,.pdf"
                onChange={handleFileSelect as any}
                style={{ display: 'none' }}
              />
            )}

            {/* Loading State */}
            {importStep === 'loading' && (
              <View style={styles.importLoadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text variant="body" color="secondary" style={{ marginTop: spacing.m }}>
                  Загрузка файла...
                </Text>
              </View>
            )}

            {/* Generating Examples State */}
            {importStep === 'generating' && (
              <View style={styles.importLoadingContainer}>
                <View style={[styles.importHeroIcon, { backgroundColor: `${colors.primary}1A` }]}>
                  <Sparkles size={36} color={colors.primary} />
                </View>
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600', marginTop: spacing.m }}>
                  AI генерирует примеры...
                </Text>
                <Text variant="bodySmall" color="secondary" style={{ marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.l }}>
                  Gemini создаёт короткие примеры для {importedCards.length} карточек
                </Text>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.l }} />
              </View>
            )}

            {/* Extracting PDF State */}
            {importStep === 'extracting' && (
              <View style={styles.importLoadingContainer}>
                <View style={[styles.importHeroIcon, { backgroundColor: `${colors.primary}1A` }]}>
                  <File size={36} color={colors.primary} />
                </View>
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600', marginTop: spacing.m }}>
                  Обрабатываем PDF...
                </Text>
                <Text variant="bodySmall" color="secondary" style={{ marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.l }}>
                  AI извлекает слова и переводы из документа
                </Text>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.l }} />
              </View>
            )}

            {/* Select File State */}
            {importStep === 'select' && (
              <>
                <View style={styles.importHero}>
                  <View style={[styles.importHeroIcon, { backgroundColor: `${colors.primary}1A` }]}>
                    <File size={36} color={colors.primary} />
                  </View>
                  <Text variant="h3" align="center" style={{ color: colors.textPrimary }}>
                    Импорт карточек
                  </Text>
                  <Text
                    variant="body"
                    color="secondary"
                    align="center"
                    style={{ paddingHorizontal: spacing.m }}
                  >
                    Загрузите файл со словами и переводами для быстрого создания карточек.
                  </Text>
                </View>

                {importError && (
                  <View style={[styles.importError, { backgroundColor: `${colors.error}15`, borderColor: colors.error }]}>
                    <Info size={18} color={colors.error} />
                    <Text variant="bodySmall" style={{ color: colors.error, flex: 1 }}>
                      {importError}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={triggerFileSelect}
                  style={[styles.importSelectButton, { backgroundColor: colors.primary }]}
                >
                  <Upload size={20} color={colors.textInverse} />
                  <Text variant="body" style={{ color: colors.textInverse, fontWeight: '700' }}>
                    Выбрать файл
                  </Text>
                </Pressable>

                <View
                  style={[
                    styles.importTips,
                    {
                      backgroundColor: 'rgba(100, 103, 242, 0.08)',
                      borderColor: `${colors.primary}1A`,
                    },
                  ]}
                >
                  <View style={styles.importTipsHeader}>
                    <Lightbulb size={18} color={colors.primary} />
                    <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '700' }}>
                      Поддерживаемые форматы
                    </Text>
                  </View>

                  <View style={styles.tipRow}>
                    <CheckCircle size={16} color={colors.primary} style={styles.tipIcon} />
                    <Text variant="caption" color="secondary" style={styles.tipText}>
                      <Text style={{ fontWeight: '700', color: colors.textPrimary }}>.pdf</Text> — словарь из PDF (AI извлечение)
                    </Text>
                  </View>
                  <View style={styles.tipRow}>
                    <CheckCircle size={16} color={colors.primary} style={styles.tipIcon} />
                    <Text variant="caption" color="secondary" style={styles.tipText}>
                      <Text style={{ fontWeight: '700', color: colors.textPrimary }}>.tsv</Text> — табличный формат (слово[TAB]перевод)
                    </Text>
                  </View>
                  <View style={styles.tipRow}>
                    <Info size={16} color={colors.primary} style={styles.tipIcon} />
                    <Text variant="caption" color="secondary" style={styles.tipText}>
                      Максимальный размер PDF: 10 МБ
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Preview State */}
            {importStep === 'preview' && (
              <>
                <ScrollView 
                  style={styles.importPreviewList}
                  showsVerticalScrollIndicator={true}
                >
                  {importedCards.map((card, index) => (
                    <View 
                      key={index} 
                      style={[
                        styles.importPreviewCard, 
                        { 
                          backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          borderColor: colors.border,
                        }
                      ]}
                    >
                      <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                        {card.front}
                      </Text>
                      <Text variant="bodySmall" color="secondary">
                        {card.back}
                      </Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.importPreviewActions}>
                  <Pressable
                    onPress={() => setImportStep('select')}
                    style={[styles.importCancelButton, { borderColor: colors.border }]}
                  >
                    <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                      Отмена
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleImportCards}
                    disabled={importLoading}
                    style={[
                      styles.importConfirmButton, 
                      { backgroundColor: colors.primary, opacity: importLoading ? 0.7 : 1 }
                    ]}
                  >
                    {importLoading ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <>
                        <Check size={18} color={colors.textInverse} />
                        <Text variant="body" style={{ color: colors.textInverse, fontWeight: '700' }}>
                          Импортировать
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      )}
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
    <Pressable
      onPress={onPress}
      style={[
        styles.filterPill,
        {
          backgroundColor: active ? colors.primary : 'transparent',
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        variant="bodySmall"
        style={{ color: active ? colors.textInverse : colors.textSecondary, fontWeight: '700' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GameRow({
  icon,
  title,
  tag,
  description,
  colors,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  tag: string;
  description: string;
  colors: ReturnType<typeof useThemeColors>;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.gameRow,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.gameIcon}>{icon}</View>
      <View style={styles.gameInfo}>
        <View style={styles.gameTitleRow}>
          <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            {title}
          </Text>
          <Text
            variant="caption"
            style={{
              color: colors.textSecondary,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingHorizontal: spacing.xs,
              paddingVertical: 2,
              borderRadius: borderRadius.s,
              borderWidth: 1,
            }}
          >
            {tag}
          </Text>
        </View>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {description}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

function ToggleSwitch({
  value,
  onToggle,
  colors,
}: {
  value: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.toggle,
        {
          backgroundColor: value ? colors.primary : colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.toggleThumb,
          {
            backgroundColor: colors.surface,
            transform: [{ translateX: value ? 18 : 0 }],
          },
        ]}
      />
    </Pressable>
  );
}

// ==================== СТИЛИ ====================

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
    fontSize: 15,
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.m,
  },
  emptyButton: {
    marginTop: spacing.m,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.m,
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
    backgroundColor: 'rgba(0,0,0,0.35)',
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
  studySheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.xl,
    gap: spacing.m,
    maxHeight: '85%',
  },
  studyHandle: {
    width: 48,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
  },
  studyContent: {
    paddingBottom: spacing.l,
    gap: spacing.l,
  },
  studyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recommendCard: {
    borderWidth: 2,
    borderRadius: borderRadius.xl,
    padding: spacing.m,
    position: 'relative',
  },
  recommendBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: '#2d65e6',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs / 2,
    borderBottomLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
  },
  recommendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.s,
  },
  recommendIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.l,
    backgroundColor: 'rgba(45,101,230,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashPreview: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  rateRow: {
    flexDirection: 'row',
    gap: spacing.s,
    flexWrap: 'wrap',
  },
  ratePill: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs / 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  section: {
    gap: spacing.s,
  },
  sectionTitle: {
    letterSpacing: 1,
  },
  gameList: {
    gap: spacing.s,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.s,
  },
  gameIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    backgroundColor: 'rgba(148,163,184,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameInfo: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  gameTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s,
  },
  wordChips: {
    flexDirection: 'row',
    gap: spacing.xs,
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
  toggle: {
    width: 42,
    height: 24,
    borderRadius: borderRadius.full,
    padding: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
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
  importHero: {
    alignItems: 'center',
    gap: spacing.s,
  },
  importHeroIcon: {
    width: 90,
    height: 90,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  importButton: {
    height: 56,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  importSelectButton: {
    height: 56,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  importTips: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.s,
  },
  importTipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  tipRow: {
    flexDirection: 'row',
    gap: spacing.s,
    alignItems: 'flex-start',
  },
  tipIcon: {
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    lineHeight: 18,
  },
  importLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  importError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  importPreviewList: {
    maxHeight: 400,
    marginVertical: spacing.s,
  },
  importPreviewCard: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    marginBottom: spacing.s,
    gap: spacing.xs,
  },
  importPreviewActions: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.s,
  },
  importCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importConfirmButton: {
    flex: 2,
    height: 48,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
