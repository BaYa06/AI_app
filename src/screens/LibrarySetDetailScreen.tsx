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
import { useThemeColors, useSettingsStore, useLibraryStore } from '@/store';
import { spacing, borderRadius, getCategoryLabel, getLanguageDef, formatCount, formatRelativeTime } from '@/constants';
import {
  ArrowLeft,
  MoreHorizontal,
  Download,
  Heart,
  Languages,
  LayoutGrid,
  Layers,
  Calendar,
  ArrowRight,
  ExternalLink,
} from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/services/supabaseClient';
import { DatabaseService } from '@/services/DatabaseService';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'LibrarySetDetail'>;

export function LibrarySetDetailScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = theme === 'dark';

  const { currentSet, isLoading, fetchSetDetail, toggleLike, rateSet, importSet } = useLibraryStore();

  const [userId, setUserId] = useState<string | undefined>();
  const [importing, setImporting] = useState(false);

  const surfaceBg = isDark ? 'rgb(24, 26, 38)' : colors.surface;
  const sectionBorder = isDark ? 'rgba(255,255,255,0.06)' : colors.borderLight;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      setUserId(uid);
      fetchSetDetail(setId, uid);
    });
  }, [setId]);

  const handleLike = useCallback(async () => {
    if (!userId || !currentSet) return;
    try {
      await toggleLike(userId, currentSet.id);
    } catch {
      Alert.alert('Ошибка', 'Не удалось поставить лайк');
    }
  }, [userId, currentSet, toggleLike]);

  const handleRate = useCallback((rating: number) => {
    if (!userId || !currentSet) return;
    rateSet(userId, currentSet.id, rating).catch(() => {
      Alert.alert('Ошибка', 'Не удалось поставить оценку');
    });
  }, [userId, currentSet, rateSet]);

  const handleImport = useCallback(async () => {
    if (!userId || !currentSet) return;
    setImporting(true);
    try {
      const newSetId = await importSet(userId, currentSet.id);
      Alert.alert('Готово!', 'Набор добавлен на главный экран', [
        { text: 'OK' },
      ]);
      // Reload user data so the set appears
      DatabaseService.loadAll().catch(() => {});
    } catch (err) {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось импортировать набор');
    } finally {
      setImporting(false);
    }
  }, [userId, currentSet, importSet]);

  const handleOpenMySet = useCallback(() => {
    // Navigate to Home — user will see the imported set there
    navigation.navigate('Main' as any, { screen: 'Home' });
  }, [navigation]);

  const handleReport = useCallback(() => {
    Alert.alert(
      'Пожаловаться',
      'Выберите причину',
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
      Alert.alert('Спасибо', 'Жалоба отправлена');
    } catch {
      Alert.alert('Ошибка', 'Не удалось отправить жалобу');
    }
  };

  if (isLoading || !currentSet) {
    return (
      <Container padded={false} edges={['top', 'bottom']}>
        <View style={[s.header, { backgroundColor: isDark ? colors.background : '#FFFFFF', borderBottomColor: colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
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
    <Container padded={false} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? colors.background : '#FFFFFF', borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={s.headerRight}>
          <Pressable hitSlop={10} style={s.headerIcon} onPress={handleReport}>
            <MoreHorizontal size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero Section */}
        <View style={[s.heroSection, { backgroundColor: surfaceBg }]}>
          <View style={[s.heroEmoji, { backgroundColor: colors.primary + '15' }]}>
            <Text style={s.heroEmojiText}>{currentSet.cover_emoji || '📚'}</Text>
          </View>
          <Text variant="h1" style={[s.heroTitle, { color: colors.textPrimary }]}>
            {currentSet.title}
          </Text>

          {/* Author Row */}
          <View style={s.authorRow}>
            <View style={[s.authorAvatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={s.authorAvatarText}>
                {(currentSet.author_name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>
              {currentSet.author_name || 'Unknown'}
            </Text>
            <Text variant="bodySmall" style={{ color: colors.textTertiary }}>
              • {formatRelativeTime(currentSet.published_at)}
            </Text>
          </View>

          {/* Metrics Row */}
          <View style={s.metricsRow}>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                {avgRating !== null && <Ionicons name="star" size={16} color="#FACC15" />}
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {avgRating ?? '—'}
                </Text>
              </View>
              <Text style={[s.metricLabel, { color: colors.textTertiary }]}>Рейтинг</Text>
            </View>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Download size={16} color={colors.primary} />
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {formatCount(currentSet.imports_count)}
                </Text>
              </View>
              <Text style={[s.metricLabel, { color: colors.textTertiary }]}>Импорты</Text>
            </View>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Heart size={16} color="#EC4899" />
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {formatCount(currentSet.likes_count)}
                </Text>
              </View>
              <Text style={[s.metricLabel, { color: colors.textTertiary }]}>Лайки</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {currentSet.description && (
          <View style={[s.descSection, { backgroundColor: surfaceBg, borderTopColor: sectionBorder }]}>
            <Text variant="bodySmall" style={{ color: colors.textSecondary, lineHeight: 22 }}>
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
                <Languages size={20} color={colors.primary} />
                <View>
                  <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Язык</Text>
                  <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
                    {langDef.flag} {langDef.label}
                  </Text>
                </View>
              </View>
            )}
            {currentSet.category && (
              <View style={s.detailItem}>
                <LayoutGrid size={20} color={colors.primary} />
                <View>
                  <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Категория</Text>
                  <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
                    {getCategoryLabel(currentSet.category)}
                  </Text>
                </View>
              </View>
            )}
            <View style={s.detailItem}>
              <Layers size={20} color={colors.primary} />
              <View>
                <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Карточки</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
                  {currentSet.cards_count} карточек
                </Text>
              </View>
            </View>
            <View style={s.detailItem}>
              <Calendar size={20} color={colors.primary} />
              <View>
                <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Опубликовано</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
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
                  <Text style={[s.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Rating Stars */}
        <View style={[s.ratingSection, { backgroundColor: surfaceBg, borderTopColor: sectionBorder }]}>
          <Text variant="h3" style={{ color: colors.textPrimary, marginBottom: spacing.m }}>Оцените набор</Text>
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => handleRate(star)} hitSlop={8}>
                <Ionicons
                  name="star"
                  size={36}
                  color={
                    currentSet.user_rating != null && star <= currentSet.user_rating
                      ? '#FACC15'
                      : isDark ? '#374151' : '#E5E7EB'
                  }
                />
              </Pressable>
            ))}
          </View>
          {currentSet.user_rating != null && (
            <Text variant="bodySmall" style={{ color: colors.textTertiary, marginTop: spacing.xs }}>
              Ваша оценка: {currentSet.user_rating}/5
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
                    <Text style={[s.sampleCardLabel, { color: colors.textTertiary }]}>Front</Text>
                    <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{card.front}</Text>
                  </View>
                  <View style={s.sampleCardArrow}>
                    <ArrowRight size={18} color={colors.border} />
                  </View>
                  <View style={[s.sampleCardSide, { paddingLeft: spacing.m }]}>
                    <Text style={[s.sampleCardLabel, { color: colors.textTertiary }]}>Back</Text>
                    <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>{card.back}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View style={[s.bottomBar, { backgroundColor: isDark ? 'rgb(16, 17, 34)' : colors.surface, borderTopColor: colors.border }]}>
        {currentSet.is_imported ? (
          <Pressable style={[s.addButton, { backgroundColor: colors.textTertiary + '20', borderWidth: 1, borderColor: colors.border }]} onPress={handleOpenMySet}>
            <ExternalLink size={20} color={colors.textPrimary} />
            <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>Открыть у себя</Text>
          </Pressable>
        ) : (
          <Pressable style={[s.addButton, { backgroundColor: colors.primary }]} onPress={handleImport} disabled={importing}>
            {importing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Download size={20} color="#FFFFFF" />
                <Text variant="body" style={{ color: '#FFFFFF', fontWeight: '700' }}>Импортировать</Text>
              </>
            )}
          </Pressable>
        )}
        <Pressable onPress={handleLike} style={[s.likeButton, { borderColor: colors.primary + '33' }]}>
          <Heart
            size={22}
            color={currentSet.is_liked ? '#EC4899' : colors.primary}
            fill={currentSet.is_liked ? '#EC4899' : 'transparent'}
          />
        </Pressable>
      </View>
    </Container>
  );
}

// ==================== STYLES ====================

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.s, paddingVertical: spacing.s, borderBottomWidth: 1 },
  headerIcon: { width: 40, height: 40, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroSection: { alignItems: 'center', paddingHorizontal: spacing.l, paddingTop: spacing.xl, paddingBottom: spacing.l },
  heroEmoji: { width: 96, height: 96, borderRadius: borderRadius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.l },
  heroEmojiText: { fontSize: 48 },
  heroTitle: { textAlign: 'center', marginBottom: spacing.s },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginBottom: spacing.l },
  authorAvatar: { width: 24, height: 24, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  authorAvatarText: { fontSize: 10, fontWeight: '700', color: '#6467f2' },
  metricsRow: { flexDirection: 'row', gap: spacing.s, width: '100%' },
  metricCard: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s, borderRadius: borderRadius.l, borderWidth: 1 },
  metricValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  metricLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  descSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.m, borderTopWidth: 1 },
  detailsSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.l, borderTopWidth: 1 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, width: '45%' },
  detailLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.m },
  tag: { paddingHorizontal: spacing.s, paddingVertical: spacing.xxs + 2, borderRadius: borderRadius.full, borderWidth: 1 },
  tagText: { fontSize: 12, fontWeight: '700' },
  ratingSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.l, borderTopWidth: 1, alignItems: 'center' },
  starsRow: { flexDirection: 'row', gap: spacing.s },
  sampleSection: { paddingHorizontal: spacing.l, paddingVertical: spacing.xl },
  sampleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.m },
  sampleList: { gap: spacing.s },
  sampleCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.m, borderRadius: borderRadius.xl, borderWidth: 1 },
  sampleCardSide: { flex: 1 },
  sampleCardLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  sampleCardArrow: { width: 32, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.m, paddingTop: spacing.m, paddingBottom: spacing.xl, borderTopWidth: 1 },
  addButton: { flex: 1, height: 56, borderRadius: borderRadius.l, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, shadowColor: '#6467f2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  likeButton: { width: 56, height: 56, borderRadius: borderRadius.l, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
