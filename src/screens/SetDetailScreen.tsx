/**
 * Set Detail Screen
 * @description Экран детали набора карточек
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { useSetsStore, useCardsStore, useThemeColors, selectSetStats } from '@/store';
import { Container, Text, ProgressBar, Loading, Button } from '@/components/common';
import { spacing, borderRadius } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import type { Card } from '@/types';
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
} from 'lucide-react-native';

type Props = RootStackScreenProps<'SetDetail'>;
type Filter = 'all' | 'mastered' | 'unmastered';

export function SetDetailScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();

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
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showStudySheet, setShowStudySheet] = useState(false);
  const [onlyHard, setOnlyHard] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(true);
  const [wordLimit, setWordLimit] = useState<'10' | '20' | '30' | 'all'>('20');

  // Расчет статистики
  const stats = useMemo(() => {
    if (!set) return { progress: 0, dueCount: 0 };
    const progress = set.cardCount > 0 
      ? Math.round((set.masteredCount / set.cardCount) * 100) 
      : 0;
    const dueCount = set.reviewCount + set.newCount;
    return { progress, dueCount };
  }, [set]);

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

  // Обработчики
  const handleStartStudy = useCallback(() => {
    // "Учить всё" — запускаем тренировку по выбранному количеству карточек
    const limit = wordLimit === 'all' ? undefined : Number(wordLimit);
    navigation.navigate('Study', { setId, mode: 'classic', studyAll: true, cardLimit: limit, onlyHard });
  }, [navigation, setId, wordLimit, onlyHard]);

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
    if (!front || !back) return;
    setIsAdding(true);
    try {
      addCard({ setId, frontText: front, backText: back });
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
    } finally {
      setIsAdding(false);
    }
  }, [addCard, newFront, newBack, setId, updateSetStats]);

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
              style={[styles.searchInput, { color: colors.textPrimary, outlineStyle: 'none' }]}
            />
          </View>
          <Pressable style={[styles.sortButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
    <Container padded={false}>
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
          <Pressable style={styles.sheetBackdrop} onPress={() => setActionCardId(null)} />
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Pressable style={styles.sheetAction} onPress={handleDeleteCard}>
              <Text variant="body" style={{ color: colors.error, fontWeight: '700' }}>
                Удалить
              </Text>
            </Pressable>
            <Pressable style={styles.sheetAction} onPress={() => setActionCardId(null)}>
              <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                Отмена
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {showAddCard && (
        <View style={[styles.sheetWrapper, { zIndex: 30 }]} pointerEvents="box-none">
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowAddCard(false)} />
          <View
            style={[
              styles.addSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text variant="h3" style={{ color: colors.textPrimary, marginBottom: spacing.m }}>
              Новая карточка
            </Text>

            <View style={styles.addField}>
              <Text variant="label" color="primary" style={styles.fieldLabel}>
                Иностранное слово
              </Text>
              <TextInput
                value={newFront}
                onChangeText={setNewFront}
                placeholder="Например: scharf"
                placeholderTextColor={colors.textTertiary}
                style={[styles.addInput, { color: colors.textPrimary, borderColor: colors.border, outlineStyle: 'none' }]}
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
                placeholderTextColor={colors.textTertiary}
                style={[styles.addInput, { color: colors.textPrimary, borderColor: colors.border, outlineStyle: 'none' }]}
              />
            </View>

            <View style={styles.addActions}>
              <Pressable style={[styles.secondaryAction, { borderColor: colors.border }]} onPress={() => setShowAddCard(false)}>
                <Text variant="body" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  Отмена
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryAction,
                  {
                    backgroundColor: newFront.trim() && newBack.trim() && !isAdding
                      ? colors.primary
                      : colors.border,
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
        </View>
      )}

      {showStudySheet && (
        <View style={[styles.sheetWrapper, { zIndex: 35 }]} pointerEvents="box-none">
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowStudySheet(false)} />
          <View
            style={[
              styles.studySheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.studyHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.studyContent}
            >
              <View style={styles.studyHeader}>
                <Text variant="h3" style={{ color: colors.textPrimary }}>
                  Выбор режима
                </Text>
                <Pressable onPress={() => setShowStudySheet(false)} hitSlop={8}>
                  <Text variant="body" style={{ color: colors.textSecondary, fontWeight: '600' }}>
                    Отмена
                  </Text>
                </Pressable>
              </View>
              <Text variant="caption" color="secondary">
                Набор: {set?.title || 'Набор'} • {set?.cardCount || 0} слов
              </Text>

              <View
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
              </View>

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
                  />
                  <GameRow
                    icon={<ClipboardList size={18} color={colors.textPrimary} />}
                    title="Multiple Choice"
                    tag="Лёгко"
                    description="Выбери правильный из 4 вариантов"
                    colors={colors}
                  />
                  <GameRow
                    icon={<Type size={18} color={colors.textPrimary} />}
                    title="Word Builder"
                    tag="Правописание"
                    description="Собери слово из букв"
                    colors={colors}
                  />
                  <GameRow
                    icon={<Headphones size={18} color={colors.textPrimary} />}
                    title="Audio Tap"
                    tag="Аудирование"
                    description="Прослушай и выбери верное"
                    colors={colors}
                  />
                </View>
              </View>

              <View style={styles.section}>
                <Text variant="caption" color="secondary" style={styles.sectionTitle}>
                  Настройки
                </Text>
                <View style={styles.settingRow}>
                  <Text variant="body" style={{ color: colors.textPrimary }}>
                    Только «Не запомнил»
                  </Text>
                  <ToggleSwitch
                    value={onlyHard}
                    onToggle={() => setOnlyHard((v) => !v)}
                    colors={colors}
                  />
                </View>
                <View style={styles.settingRow}>
                  <Text variant="body" style={{ color: colors.textPrimary }}>
                    Показывать мнемонику после ошибки
                  </Text>
                  <ToggleSwitch
                    value={showMnemonic}
                    onToggle={() => setShowMnemonic((v) => !v)}
                    colors={colors}
                  />
                </View>
                <View style={styles.settingRow}>
                  <Text variant="body" style={{ color: colors.textPrimary }}>
                    Количество слов
                  </Text>
                  <View style={styles.wordChips}>
                    {(['10', '20', '30', 'all'] as const).map((val) => (
                      <Pressable
                        key={val}
                        onPress={() => setWordLimit(val)}
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

            <View style={styles.startBlock}>
              <Pressable
                style={[styles.startButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setShowStudySheet(false);
                  handleStartStudy();
                }}
              >
                <Text variant="body" style={{ color: colors.textInverse, fontWeight: '700' }}>
                  Начать
                </Text>
              </Pressable>
              <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: spacing.xs }}>
                Режим: Flashcards • {wordLimit === 'all' ? set?.cardCount || 0 : wordLimit} слов
              </Text>
            </View>
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
}: {
  icon: React.ReactNode;
  title: string;
  tag: string;
  description: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
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
  addActions: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.s,
  },
});
