/**
 * Library Set Detail Screen
 * @description Detailed view of a public library set with import, like, rate functionality
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors, useSettingsStore, useLibraryStore, useSetsStore, useCardsStore, useCoursesStore } from '@/store';
import { ChooseCourseSheet } from '@/components/library/ChooseCourseSheet';
import { showMessage } from '@/utils/dialogs';
import { spacing, borderRadius, heights, iconSize, getCategoryLabel, getLanguageDef, formatCount, formatRelativeTime, alpha } from '@/constants';
import { Button, CategoryIcon, ScreenHeader, toast, useScreenBottomInset } from '@/components/ui';
import { v4 as uuid } from 'uuid';
import { LibraryService } from '@/services/LibraryService';
import type { CardSet } from '@/types';
import {
  MoreHorizontal,
  Star,
  Download,
  Heart,
  Languages,
  LayoutGrid,
  Layers,
  Calendar,
  ArrowRight,
  ExternalLink,
} from 'lucide-react-native';
import { supabase } from '@/services/supabaseClient';
import { DatabaseService } from '@/services/DatabaseService';
import type { RootStackScreenProps } from '@/types/navigation';
import { describeError } from '@/utils/userErrors';
import { pluralize } from '@/utils';

type Props = RootStackScreenProps<'LibrarySetDetail'>;

export function LibrarySetDetailScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();

  const { currentSet, isLoading, fetchSetDetail, toggleLike, rateSet, importSet } = useLibraryStore();

  const [userId, setUserId] = useState<string | undefined>();
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [importing, setImporting] = useState(false);
  const [chooseCourseVisible, setChooseCourseVisible] = useState(false);
  const isTeacher = useSettingsStore((s) => s.isTeacher) === true;
  const allCourses = useCoursesStore((s) => s.courses);
  const activeCourseId = useCoursesStore((s) => s.activeCourseId);
  // Добавить набор можно только в свой курс (не в курс, где пользователь ученик).
  const ownCourses = React.useMemo(() => allCourses.filter((c) => !c.isStudentCourse), [allCourses]);
  const defaultCourseId = ownCourses.some((c) => c.id === activeCourseId) ? activeCourseId : null;

  const surfaceBg = colors.surface;
  const sectionBorder = colors.border;
  const bottomInset = useScreenBottomInset();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      setUserId(uid);
      setIsAnonymous((data.session?.user as any)?.is_anonymous === true);
      fetchSetDetail(setId, uid);
    });
  }, [setId]);

  const handleLike = useCallback(async () => {
    if (!userId || !currentSet) return;
    try {
      await toggleLike(userId, currentSet.id);
    } catch {
      toast.error('Не удалось поставить лайк');
    }
  }, [userId, currentSet, toggleLike]);

  const handleRate = useCallback((rating: number) => {
    if (!userId || !currentSet) return;
    rateSet(userId, currentSet.id, rating).catch(() => {
      toast.error('Не удалось поставить оценку');
    });
  }, [userId, currentSet, rateSet]);

  // Guest login — сохраняем набор локально, без записи в NeonDB
  const handleImportGuest = useCallback(async (courseId: string | null) => {
    if (!userId || !currentSet) return;
    setImporting(true);
    try {
      const libCards = await LibraryService.getLibraryCards(currentSet.id);
      const now = Date.now();
      const newSetId = uuid();

      const newSet: CardSet = {
        id: newSetId,
        userId,
        courseId,
        title: currentSet.title + ' (из библиотеки)',
        description: currentSet.description || '',
        category: (currentSet as any).category || 'general',
        tags: [],
        icon: undefined,
        color: undefined,
        languageFrom: (currentSet as any).language_from || 'en',
        languageTo: (currentSet as any).language_to || 'ru',
        isPublic: false,
        createdAt: now,
        updatedAt: now,
        lastStudiedAt: undefined,
        cardCount: libCards.length,
        newCount: libCards.length,
        learningCount: 0,
        reviewCount: 0,
        masteredCount: 0,
        isFavorite: false,
        isArchived: false,
      };

      // Пишем в store напрямую, минуя SyncQueue (гость не имеет записи в NeonDB)
      const setsState = useSetsStore.getState();
      useSetsStore.setState({
        sets: { ...setsState.sets, [newSetId]: newSet },
        setsOrder: [newSetId, ...setsState.setsOrder],
      });
      DatabaseService.saveSets();

      const newCards = libCards.map(c => ({
        id: uuid(),
        setId: newSetId,
        front: c.front,
        back: c.back,
        example: c.hint ?? undefined,
        createdAt: now,
        updatedAt: now,
        learningStep: 0,
        nextReviewDate: now,
        lastReviewDate: 0,
        status: 'new' as const,
      }));

      const cardsState = useCardsStore.getState();
      const newCardsMap = { ...cardsState.cards };
      const newCardsBySet = { ...cardsState.cardsBySet, [newSetId]: [] as string[] };
      for (const card of newCards) {
        newCardsMap[card.id] = card;
        newCardsBySet[newSetId].push(card.id);
      }
      useCardsStore.setState({ cards: newCardsMap, cardsBySet: newCardsBySet });
      DatabaseService.saveCards();

      setChooseCourseVisible(false);
      showMessage('Готово!', 'Набор сохранён на устройстве');
    } catch (err) {
      showMessage('Ошибка', describeError(err, 'Не удалось импортировать набор'));
    } finally {
      setImporting(false);
    }
  }, [userId, currentSet]);

  const importInto = useCallback(async (courseId: string | null) => {
    if (!userId || !currentSet) return;
    if (isAnonymous) {
      return handleImportGuest(courseId);
    }
    setImporting(true);
    try {
      await importSet(userId, currentSet.id, courseId);
      setChooseCourseVisible(false);
      const course = courseId ? ownCourses.find((c) => c.id === courseId) : undefined;
      showMessage('Готово!', course ? `Набор добавлен в «${course.title}»` : 'Набор добавлен на главный экран');
      // Reload user data so the set appears
      DatabaseService.loadAll().catch(() => {});
    } catch (err) {
      showMessage('Ошибка', describeError(err, 'Не удалось импортировать набор'));
    } finally {
      setImporting(false);
    }
  }, [userId, currentSet, importSet, isAnonymous, handleImportGuest, ownCourses]);

  // Своих курсов нет — добавляем сразу, как раньше. Есть — спрашиваем, в какой (один).
  const handleImport = useCallback(() => {
    if (ownCourses.length === 0) {
      importInto(null);
      return;
    }
    setChooseCourseVisible(true);
  }, [ownCourses.length, importInto]);

  const handleOpenMySet = useCallback(() => {
    // Navigate to Home — user will see the imported set there
    navigation.navigate('Main' as any, { screen: 'Home' });
  }, [navigation]);

  const handleReport = useCallback(() => {
    Alert.alert(
      'Пожаловаться',
      'Выбери причину',
      [
        { text: 'Спам', onPress: () => reportWithReason('spam') },
        { text: 'Неприемлемый контент', onPress: () => reportWithReason('inappropriate') },
        { text: 'Ошибки в карточках', onPress: () => reportWithReason('errors') },
        { text: 'Отмена', style: 'cancel' },
      ]
    );
  }, [userId, currentSet]);

  const reportWithReason = async (reason: string) => {
    if (!userId || !currentSet) return;
    try {
      const { LibraryService } = await import('@/services/LibraryService');
      await LibraryService.reportSet(userId, currentSet.id, reason);
      toast.success('Спасибо, жалоба отправлена');
    } catch {
      toast.error('Не удалось отправить жалобу');
    }
  };

  if (isLoading || !currentSet) {
    return (
      <Container padded={false}>
        <ScreenHeader onBack={() => navigation.goBack()} bordered />
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Container>
    );
  }

  const avgRating = currentSet.rating_count > 0
    ? Math.round((currentSet.rating_sum / currentSet.rating_count) * 10) / 10
    : null;
  const langDef = currentSet.language_from && currentSet.language_to
    ? getLanguageDef(currentSet.language_from, currentSet.language_to)
    : null;

  return (
    <Container padded={false}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        bordered
        right={<Button variant="icon" icon={MoreHorizontal} accessibilityLabel="Пожаловаться" onPress={handleReport} />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero Section */}
        <View style={[s.heroSection, { backgroundColor: surfaceBg }]}>
          <View style={[s.heroEmoji, { backgroundColor: alpha(colors.primary, 10) }]}>
            {/* Иконка категории вместо эмодзи обложки (брендбук, раздел 6) */}
            <CategoryIcon category={currentSet.category} size="xl" />
            {currentSet.is_featured && (
              <View
                accessible
                accessibilityLabel="Рекомендуем"
                style={[s.verifiedBadge, { backgroundColor: colors.primaryFill, borderColor: surfaceBg }]}
              >
                <Star size={iconSize.xs} color={colors.onPrimary} fill={colors.onPrimary} />
              </View>
            )}
          </View>
          <Text variant="h1" style={[s.heroTitle, { color: colors.textPrimary }]}>
            {currentSet.title}
          </Text>

          {/* Author Row */}
          <View style={s.authorRow}>
            <View style={[s.authorAvatar, { backgroundColor: alpha(colors.primary, 10) }]}>
              <Text variant="caption" style={[s.authorAvatarText, { color: colors.primary }]}>
                {(currentSet.author_name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>
              {currentSet.author_name || 'Автор неизвестен'}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textTertiary }}>
              • {formatRelativeTime(currentSet.published_at)}
            </Text>
          </View>

          {/* Metrics Row */}
          <View style={s.metricsRow}>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                {avgRating !== null && <Star size={iconSize.xs} color={colors.star} fill={colors.star} />}
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {avgRating ?? '—'}
                </Text>
              </View>
              <Text variant="overline" color="secondary" style={s.metricLabel}>Рейтинг</Text>
            </View>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Download size={iconSize.xs} color={colors.primary} />
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {formatCount(currentSet.imports_count)}
                </Text>
              </View>
              <Text variant="overline" color="secondary" style={s.metricLabel}>Импорты</Text>
            </View>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Heart size={iconSize.xs} color={colors.like} />
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {formatCount(currentSet.likes_count)}
                </Text>
              </View>
              <Text variant="overline" color="secondary" style={s.metricLabel}>Лайки</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {currentSet.description && (
          <View style={[s.descSection, { backgroundColor: surfaceBg, borderTopColor: sectionBorder }]}>
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {currentSet.description}
            </Text>
          </View>
        )}

        {/* Details */}
        <View style={[s.detailsSection, { backgroundColor: surfaceBg, borderTopColor: sectionBorder }]}>
          <Text variant="h3" style={{ color: colors.textPrimary, marginBottom: spacing.m }}>Подробнее</Text>
          <View style={s.detailsGrid}>
            {langDef && (
              <View style={s.detailItem}>
                <Languages size={iconSize.s} color={colors.primary} />
                <View>
                  <Text variant="overline" color="secondary">Язык</Text>
                  <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                    {langDef.flag} {langDef.label}
                  </Text>
                </View>
              </View>
            )}
            {currentSet.category && (
              <View style={s.detailItem}>
                <LayoutGrid size={iconSize.s} color={colors.primary} />
                <View>
                  <Text variant="overline" color="secondary">Категория</Text>
                  <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                    {getCategoryLabel(currentSet.category)}
                  </Text>
                </View>
              </View>
            )}
            <View style={s.detailItem}>
              <Layers size={iconSize.s} color={colors.primary} />
              <View>
                <Text variant="overline" color="secondary">Карточки</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  {currentSet.cards_count} {pluralize(currentSet.cards_count, 'карточка', 'карточки', 'карточек')}
                </Text>
              </View>
            </View>
            <View style={s.detailItem}>
              <Calendar size={iconSize.s} color={colors.primary} />
              <View>
                <Text variant="overline" color="secondary">Опубликовано</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  {new Date(currentSet.published_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </View>

          {/* Tags */}
          {currentSet.tags && currentSet.tags.length > 0 && (
            <View style={s.tagsRow}>
              {currentSet.tags.map((tag) => (
                <View key={tag} style={[s.tag, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text variant="caption" style={[s.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Rating Stars */}
        <View style={[s.ratingSection, { backgroundColor: surfaceBg, borderTopColor: sectionBorder }]}>
          <Text variant="h3" style={{ color: colors.textPrimary, marginBottom: spacing.m }}>Оцени набор</Text>
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = currentSet.user_rating != null && star <= currentSet.user_rating;
              return (
                <Pressable
                  key={star}
                  onPress={() => handleRate(star)}
                  style={s.starButton}
                  accessibilityRole="button"
                  accessibilityLabel={`${star} из 5`}
                  accessibilityState={{ selected: filled }}
                >
                  <Star
                    size={iconSize.l}
                    color={filled ? colors.star : colors.textTertiary}
                    fill={filled ? colors.star : 'transparent'}
                  />
                </Pressable>
              );
            })}
          </View>
          {currentSet.user_rating != null && (
            <Text variant="bodySmall" style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
              Твоя оценка: {currentSet.user_rating}/5
            </Text>
          )}
        </View>

        {/* Preview Cards */}
        {currentSet.preview_cards && currentSet.preview_cards.length > 0 && (
          <View style={s.sampleSection}>
            <View style={s.sampleHeader}>
              <Text variant="h3" style={{ color: colors.textPrimary }}>Превью карточек</Text>
              <Text variant="bodySmall" style={{ color: colors.textTertiary }}>
                {Math.min(currentSet.preview_cards.length, 10)} из {currentSet.cards_count}
              </Text>
            </View>
            <View style={s.sampleList}>
              {currentSet.preview_cards.map((card, idx) => (
                <View key={card.id || idx} style={[s.sampleCard, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
                  <View style={s.sampleCardSide}>
                    <Text variant="caption" style={[s.sampleCardLabel, { color: colors.textSecondary }]}>Слово</Text>
                    <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{card.front}</Text>
                  </View>
                  <View style={s.sampleCardArrow}>
                    <ArrowRight size={iconSize.xs} color={colors.textTertiary} />
                  </View>
                  <View style={[s.sampleCardSide, { paddingLeft: spacing.m }]}>
                    <Text variant="caption" style={[s.sampleCardLabel, { color: colors.textSecondary }]}>Перевод</Text>
                    <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{card.back}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View
        style={[
          s.bottomBar,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: spacing.m + bottomInset },
        ]}
      >
        {currentSet.is_imported ? (
          <Button variant="secondary" title="Открыть у себя" icon={ExternalLink} onPress={handleOpenMySet} style={s.flex1} />
        ) : (
          <Button title="Импортировать" icon={Download} onPress={handleImport} loading={importing} style={s.flex1} />
        )}
        <Pressable
          onPress={handleLike}
          accessibilityRole="button"
          accessibilityLabel={currentSet.is_liked ? 'Убрать лайк' : 'Нравится'}
          accessibilityState={{ selected: !!currentSet.is_liked }}
          style={[s.likeButton, { borderColor: currentSet.is_liked ? alpha(colors.like, 40) : alpha(colors.primary, 20) }]}
        >
          <Heart
            size={iconSize.m}
            color={currentSet.is_liked ? colors.like : colors.primary}
            fill={currentSet.is_liked ? colors.like : 'transparent'}
          />
        </Pressable>
      </View>

      <ChooseCourseSheet
        visible={chooseCourseVisible}
        setTitle={currentSet.title}
        courses={ownCourses}
        initialCourseId={defaultCourseId}
        isSubmitting={importing}
        showStudentsHint={isTeacher}
        onClose={() => setChooseCourseVisible(false)}
        onSubmit={importInto}
      />
    </Container>
  );
}

// ==================== STYLES ====================

const s = StyleSheet.create({
  flex1: { flex: 1 },
  starButton: { width: heights.touch, height: heights.touch, alignItems: 'center', justifyContent: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroSection: { alignItems: 'center', paddingHorizontal: spacing.l, paddingTop: spacing.xl, paddingBottom: spacing.l },
  heroEmoji: { width: 96, height: 96, borderRadius: borderRadius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.l, position: 'relative' },
  verifiedBadge: { position: 'absolute', top: -spacing.xxs, right: -spacing.xxs, width: 28, height: 28, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  heroTitle: { textAlign: 'center', marginBottom: spacing.s },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginBottom: spacing.l },
  authorAvatar: { width: 24, height: 24, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  authorAvatarText: { fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: spacing.s, width: '100%' },
  metricCard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s, borderRadius: borderRadius.l, borderWidth: 1 },
  metricValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  metricLabel: { marginTop: spacing.xxs / 2 },
  descSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.m, borderTopWidth: 1 },
  detailsSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.l, borderTopWidth: 1 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, width: '45%' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.m },
  tag: { paddingHorizontal: spacing.s, paddingVertical: spacing.xxs, borderRadius: borderRadius.full, borderWidth: 1 },
  tagText: { fontWeight: '600' },
  ratingSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.l, borderTopWidth: 1, alignItems: 'center' },
  starsRow: { flexDirection: 'row', gap: spacing.xxs },
  sampleSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.xl },
  sampleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.m },
  sampleList: { gap: spacing.s },
  sampleCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.m, borderRadius: borderRadius.l, borderWidth: 1 },
  sampleCardSide: { flex: 1 },
  sampleCardLabel: { fontWeight: '600', marginBottom: spacing.xxs / 2 },
  sampleCardArrow: { width: 32, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.m, paddingTop: spacing.m, borderTopWidth: 1 },
  likeButton: { width: heights.button, height: heights.button, borderRadius: borderRadius.m, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
