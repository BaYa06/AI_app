/**
 * Shared Set Detail Screen
 * @description Экран детальной информации о публичном наборе из библиотеки
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import {
  ArrowLeft,
  Share2,
  MoreHorizontal,
  Star,
  Download,
  Heart,
  Languages,
  LayoutGrid,
  Layers,
  Calendar,
  ArrowRight,
  ChevronRight,
  Plus,
} from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'SharedSetDetail'>;

// Mock data
const MOCK_SET = {
  emoji: '📘',
  title: 'Essential Spanish Verbs',
  author: '@language_pro',
  authorAvatar: null as string | null,
  rating: 4.7,
  ratingCount: 145,
  downloads: '1.2k',
  likes: 89,
  description:
    'This comprehensive set covers the most important Spanish verbs for beginners. Includes regular and irregular forms with clear example sentences and audio pronunciations for every card. Perfect for A1-A2 learners...',
  language: 'English → Spanish',
  category: 'Languages',
  cardCount: 150,
  published: 'Oct 12, 2023',
  tags: ['A1 Level', 'Verbs', 'Grammar'],
  sampleCards: [
    { front: 'Comer', back: 'To eat' },
    { front: 'Hablar', back: 'To speak' },
    { front: 'Vivir', back: 'To live' },
  ],
  ratingDistribution: [80, 15, 3, 1, 1], // 5,4,3,2,1 stars in %
  reviews: [
    {
      id: '1',
      name: 'Maria S.',
      rating: 5,
      time: '2 дня назад',
      text: 'Incredibly helpful for my first Spanish class. The examples are really clear!',
    },
    {
      id: '2',
      name: 'Alex Chen',
      rating: 4,
      time: '1 неделю назад',
      text: 'Great set, just wish there were a few more irregular verbs included.',
    },
  ],
  similarSets: [
    { id: '1', emoji: '🥘', title: 'Spanish Food', cards: 80, rating: 4.5, bgColor: '#FFF7ED' },
    { id: '2', emoji: '🚗', title: 'Travel Phrases', cards: 120, rating: 4.9, bgColor: '#EFF6FF' },
    { id: '3', emoji: '🏠', title: 'At Home Items', cards: 65, rating: 4.2, bgColor: '#F3E8FF' },
  ],
};

export function SharedSetDetailScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = theme === 'dark';
  const [liked, setLiked] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const surfaceBg = isDark ? 'rgb(24, 26, 38)' : colors.surface;
  const sectionBorder = isDark ? 'rgba(255,255,255,0.06)' : colors.borderLight;

  return (
    <Container padded={false} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? colors.background : '#FFFFFF', borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={s.headerRight}>
          <Pressable hitSlop={10} style={s.headerIcon}>
            <Share2 size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable hitSlop={10} style={s.headerIcon}>
            <MoreHorizontal size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Hero Section */}
        <View style={[s.heroSection, { backgroundColor: surfaceBg }]}>
          <View style={[s.heroEmoji, { backgroundColor: colors.primary + '15' }]}>
            <Text style={s.heroEmojiText}>{MOCK_SET.emoji}</Text>
          </View>
          <Text variant="h1" style={[s.heroTitle, { color: colors.textPrimary }]}>
            {MOCK_SET.title}
          </Text>

          {/* Author Row */}
          <View style={s.authorRow}>
            <View style={[s.authorAvatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={s.authorAvatarText}>LP</Text>
            </View>
            <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>
              {MOCK_SET.author}
            </Text>
            <Pressable style={[s.followBtn, { backgroundColor: colors.primary }]}>
              <Text style={s.followBtnText}>Follow</Text>
            </Pressable>
          </View>

          {/* Metrics Row */}
          <View style={s.metricsRow}>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Ionicons name="star" size={16} color="#FACC15" />
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {MOCK_SET.rating}
                </Text>
              </View>
              <Text style={[s.metricLabel, { color: colors.textTertiary }]}>Rating</Text>
            </View>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Download size={16} color={colors.primary} />
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {MOCK_SET.downloads}
                </Text>
              </View>
              <Text style={[s.metricLabel, { color: colors.textTertiary }]}>Downloads</Text>
            </View>
            <View style={[s.metricCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={s.metricValue}>
                <Heart size={16} color="#EC4899" />
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {MOCK_SET.likes}
                </Text>
              </View>
              <Text style={[s.metricLabel, { color: colors.textTertiary }]}>Likes</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={[s.descSection, { backgroundColor: surfaceBg, borderTopColor: sectionBorder }]}>
          <Text variant="bodySmall" style={{ color: colors.textSecondary, lineHeight: 22 }}>
            {descExpanded ? MOCK_SET.description : MOCK_SET.description}
            <Text
              onPress={() => setDescExpanded(!descExpanded)}
              style={{ color: colors.primary, fontWeight: '700' }}
            >
              {' '}Читать ещё
            </Text>
          </Text>
        </View>

        {/* Details */}
        <View style={[s.detailsSection, { backgroundColor: surfaceBg, borderTopColor: sectionBorder }]}>
          <Text variant="h3" style={{ color: colors.textPrimary, marginBottom: spacing.m }}>
            Подробнее
          </Text>

          <View style={s.detailsGrid}>
            <View style={s.detailItem}>
              <Languages size={20} color={colors.primary} />
              <View>
                <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Язык</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
                  {MOCK_SET.language}
                </Text>
              </View>
            </View>
            <View style={s.detailItem}>
              <LayoutGrid size={20} color={colors.primary} />
              <View>
                <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Категория</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
                  {MOCK_SET.category}
                </Text>
              </View>
            </View>
            <View style={s.detailItem}>
              <Layers size={20} color={colors.primary} />
              <View>
                <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Карточки</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
                  {MOCK_SET.cardCount} карточек
                </Text>
              </View>
            </View>
            <View style={s.detailItem}>
              <Calendar size={20} color={colors.primary} />
              <View>
                <Text style={[s.detailLabel, { color: colors.textTertiary }]}>Опубликовано</Text>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '500' }}>
                  {MOCK_SET.published}
                </Text>
              </View>
            </View>
          </View>

          {/* Tags */}
          <View style={s.tagsRow}>
            {MOCK_SET.tags.map((tag) => (
              <View
                key={tag}
                style={[s.tag, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[s.tagText, { color: colors.textSecondary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sample Cards */}
        <View style={s.sampleSection}>
          <View style={s.sampleHeader}>
            <Text variant="h3" style={{ color: colors.textPrimary }}>
              Примеры карточек
            </Text>
            <Pressable>
              <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '700' }}>
                Все
              </Text>
            </Pressable>
          </View>
          <View style={s.sampleList}>
            {MOCK_SET.sampleCards.map((card, idx) => (
              <View
                key={idx}
                style={[s.sampleCard, { backgroundColor: surfaceBg, borderColor: colors.border }]}
              >
                <View style={s.sampleCardSide}>
                  <Text style={[s.sampleCardLabel, { color: colors.textTertiary }]}>Front</Text>
                  <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    {card.front}
                  </Text>
                </View>
                <View style={s.sampleCardArrow}>
                  <ArrowRight size={18} color={colors.border} />
                </View>
                <View style={[s.sampleCardSide, { paddingLeft: spacing.m }]}>
                  <Text style={[s.sampleCardLabel, { color: colors.textTertiary }]}>Back</Text>
                  <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    {card.back}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Ratings & Reviews */}
        <View style={[s.reviewsSection, { backgroundColor: surfaceBg }]}>
          <Text variant="h3" style={{ color: colors.textPrimary, marginBottom: spacing.l }}>
            Оценки и отзывы
          </Text>

          <View style={s.ratingOverview}>
            {/* Big rating */}
            <View style={s.ratingBig}>
              <Text style={[s.ratingBigNumber, { color: colors.textPrimary }]}>
                {MOCK_SET.rating}
              </Text>
              <View style={s.starsRow}>
                {[1, 2, 3, 4].map((i) => (
                  <Ionicons key={i} name="star" size={16} color="#FACC15" />
                ))}
                <Ionicons name="star-half" size={16} color="#FACC15" />
              </View>
              <Text style={[s.ratingCountText, { color: colors.textTertiary }]}>
                {MOCK_SET.ratingCount} оценок
              </Text>
            </View>

            {/* Distribution bars */}
            <View style={s.ratingBars}>
              {[5, 4, 3, 2, 1].map((star, idx) => (
                <View key={star} style={s.ratingBarRow}>
                  <Text style={[s.ratingBarLabel, { color: colors.textTertiary }]}>{star}</Text>
                  <View style={[s.ratingBarTrack, { backgroundColor: colors.background }]}>
                    <View
                      style={[
                        s.ratingBarFill,
                        {
                          backgroundColor: colors.primary,
                          width: `${MOCK_SET.ratingDistribution[idx]}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Comments */}
          <View style={s.commentsList}>
            {MOCK_SET.reviews.map((review, idx) => (
              <View
                key={review.id}
                style={[
                  s.commentItem,
                  idx < MOCK_SET.reviews.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: sectionBorder,
                    paddingBottom: spacing.l,
                  },
                ]}
              >
                <View style={s.commentHeader}>
                  <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    {review.name}
                  </Text>
                  <Text style={[s.commentTime, { color: colors.textTertiary }]}>{review.time}</Text>
                </View>
                <View style={s.commentStars}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Ionicons
                      key={i}
                      name="star"
                      size={14}
                      color={i < review.rating ? '#FACC15' : isDark ? '#374151' : '#E5E7EB'}
                    />
                  ))}
                </View>
                <Text variant="bodySmall" style={{ color: colors.textSecondary, lineHeight: 20 }}>
                  {review.text}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            style={[s.viewAllReviewsBtn, { borderColor: colors.primary + '33' }]}
          >
            <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '700' }}>
              Все отзывы
            </Text>
          </Pressable>
        </View>

        {/* Similar Sets */}
        <View style={s.similarSection}>
          <Text variant="h3" style={{ color: colors.textPrimary, marginBottom: spacing.m }}>
            Похожие наборы
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.similarScroll}
          >
            {MOCK_SET.similarSets.map((set) => (
              <View
                key={set.id}
                style={[s.similarCard, { backgroundColor: surfaceBg, borderColor: colors.border }]}
              >
                <View style={[s.similarCardIcon, { backgroundColor: isDark ? colors.primary + '15' : set.bgColor }]}>
                  <Text style={s.similarCardEmoji}>{set.emoji}</Text>
                </View>
                <Text
                  variant="bodySmall"
                  style={{ color: colors.textPrimary, fontWeight: '700' }}
                  numberOfLines={1}
                >
                  {set.title}
                </Text>
                <Text style={[s.similarCardCount, { color: colors.textTertiary }]}>
                  {set.cards} карточек
                </Text>
                <View style={s.similarCardRating}>
                  <Ionicons name="star" size={12} color="#FACC15" />
                  <Text style={[s.similarCardRatingText, { color: colors.textPrimary }]}>
                    {set.rating}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Bar */}
      <View
        style={[
          s.bottomBar,
          {
            backgroundColor: isDark ? 'rgb(16, 17, 34)' : colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Pressable style={[s.addButton, { backgroundColor: colors.primary }]}>
          <Plus size={20} color="#FFFFFF" />
          <Text variant="body" style={{ color: '#FFFFFF', fontWeight: '700' }}>
            Добавить в мои наборы
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setLiked(!liked)}
          style={[s.likeButton, { borderColor: colors.primary + '33' }]}
        >
          <Heart
            size={22}
            color={liked ? '#EC4899' : colors.primary}
            fill={liked ? '#EC4899' : 'transparent'}
          />
        </Pressable>
      </View>
    </Container>
  );
}

// ==================== STYLES ====================

const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    paddingTop: spacing.xl,
    paddingBottom: spacing.l,
  },
  heroEmoji: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.l,
  },
  heroEmojiText: {
    fontSize: 48,
  },
  heroTitle: {
    textAlign: 'center',
    marginBottom: spacing.s,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.l,
  },
  authorAvatar: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6467f2',
  },
  followBtn: {
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginLeft: spacing.xs,
  },
  followBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.s,
    width: '100%',
  },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  metricValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },

  // Description
  descSection: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
    borderTopWidth: 1,
  },

  // Details
  detailsSection: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.l,
    borderTopWidth: 1,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.m,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    width: '45%',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.m,
  },
  tag: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Sample Cards
  sampleSection: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xl,
  },
  sampleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.m,
  },
  sampleList: {
    gap: spacing.s,
  },
  sampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  sampleCardSide: {
    flex: 1,
  },
  sampleCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  sampleCardArrow: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Ratings & Reviews
  reviewsSection: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xl,
  },
  ratingOverview: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.xl,
  },
  ratingBig: {
    alignItems: 'center',
  },
  ratingBigNumber: {
    fontSize: 48,
    fontWeight: '700',
  },
  starsRow: {
    flexDirection: 'row',
    marginTop: spacing.xxs,
  },
  ratingCountText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  ratingBars: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  ratingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    width: 10,
    textAlign: 'center',
  },
  ratingBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  commentsList: {
    gap: spacing.l,
    marginBottom: spacing.l,
  },
  commentItem: {},
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xxs,
  },
  commentTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  commentStars: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: spacing.xs,
  },
  viewAllReviewsBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },

  // Similar Sets
  similarSection: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.xl,
  },
  similarScroll: {
    gap: spacing.m,
  },
  similarCard: {
    width: 176,
    padding: spacing.s,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  similarCardIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s,
  },
  similarCardEmoji: {
    fontSize: 20,
  },
  similarCardCount: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  similarCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  similarCardRatingText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
  addButton: {
    flex: 1,
    height: 56,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    shadowColor: '#6467f2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  likeButton: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
