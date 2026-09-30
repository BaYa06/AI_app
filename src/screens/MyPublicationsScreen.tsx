/**
 * My Publications Screen
 * @description List of user's published sets with stats and management
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors, useLibraryStore } from '@/store';
import { spacing, borderRadius, iconSize, screenPadding, formatCount, formatRelativeTime, alpha } from '@/constants';
import { Badge, Button, CategoryIcon, EmptyState, ScreenHeader, confirmDialog, toast } from '@/components/ui';
import { RefreshCw, EyeOff, BookOpen, Star, Download, Heart, Layers } from 'lucide-react-native';
import { supabase } from '@/services/supabaseClient';
import type { RootStackScreenProps } from '@/types/navigation';
import type { LibrarySet } from '@/types/library';
import { describeError } from '@/utils/userErrors';

type Props = RootStackScreenProps<'MyPublications'>;

export function MyPublicationsScreen({ navigation }: Props) {
  const colors = useThemeColors();

  const { myPublications, fetchMyPublications, unpublishSet, updatePublication } = useLibraryStore();

  const [userId, setUserId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      setUserId(uid);
      if (uid) {
        fetchMyPublications(uid).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleUpdate = useCallback(async (librarySetId: string) => {
    if (!userId) return;
    setUpdatingId(librarySetId);
    try {
      await updatePublication(userId, librarySetId);
      await fetchMyPublications(userId);
      toast.success('Публикация обновлена');
    } catch (err) {
      toast.error(describeError(err, 'Не удалось обновить'));
    } finally {
      setUpdatingId(null);
    }
  }, [userId, updatePublication, fetchMyPublications]);

  const handleUnpublish = useCallback(async (librarySetId: string) => {
    const confirmed = await confirmDialog({
      title: 'Снять с публикации',
      message: 'Набор будет удалён из библиотеки. Продолжить?',
      confirmText: 'Снять',
      destructive: true,
    });
    if (!confirmed || !userId) return;
    try {
      await unpublishSet(userId, librarySetId);
      toast.success('Публикация снята');
    } catch (err) {
      toast.error(describeError(err, 'Не удалось снять'));
    }
  }, [userId, unpublishSet]);

  const renderItem = useCallback(({ item }: { item: LibrarySet }) => {
    const avgRating = item.rating_count > 0
      ? Math.round((item.rating_sum / item.rating_count) * 10) / 10
      : null;
    const isArchived = item.status === 'archived';
    const isUpdating = updatingId === item.id;

    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardHeader}>
          <View style={[s.emojiBox, { backgroundColor: alpha(colors.primary, 10) }]}>
            {/* Иконка категории вместо эмодзи обложки (брендбук, раздел 6) */}
            <CategoryIcon category={item.category} size="m" />
            {item.is_featured && (
              <View
                accessible
                accessibilityLabel="Рекомендуем"
                style={[s.verifiedBadge, { backgroundColor: colors.primaryFill, borderColor: colors.surface }]}
              >
                <Star size={10} color={colors.onPrimary} fill={colors.onPrimary} />
              </View>
            )}
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={s.statusRow}>
              <Badge label={isArchived ? 'Архивный' : 'Опубликован'} tone={isArchived ? 'error' : 'success'} />
              <Text style={[s.dateText, { color: colors.textTertiary }]}>
                {formatRelativeTime(item.published_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Download size={iconSize.xs} color={colors.textTertiary} />
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{formatCount(item.imports_count)}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>импортов</Text>
          </View>
          <View style={s.statItem}>
            <Heart size={iconSize.xs} color={colors.textTertiary} />
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{formatCount(item.likes_count)}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>лайков</Text>
          </View>
          {avgRating !== null && (
            <View style={s.statItem}>
              <Star size={iconSize.xs} color={colors.star} fill={colors.star} />
              <Text style={[s.statValue, { color: colors.textPrimary }]}>{avgRating}</Text>
              <Text style={[s.statLabel, { color: colors.textTertiary }]}>рейтинг</Text>
            </View>
          )}
          <View style={s.statItem}>
            <Layers size={iconSize.xs} color={colors.textTertiary} />
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{item.cards_count}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>карт</Text>
          </View>
        </View>

        {/* Actions */}
        {!isArchived && (
          <View style={s.actionsRow}>
            <Button
              variant="secondary"
              size="s"
              title="Обновить"
              icon={RefreshCw}
              onPress={() => handleUpdate(item.id)}
              loading={isUpdating}
              style={s.actionBtn}
            />
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                s.actionBtn,
                s.dangerBtn,
                { backgroundColor: alpha(colors.error, 10), borderColor: alpha(colors.error, 20) },
                pressed && s.pressed,
              ]}
              onPress={() => handleUnpublish(item.id)}
            >
              <EyeOff size={iconSize.xs} color={colors.errorText} />
              <Text variant="label" style={{ color: colors.errorText }}>Снять</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }, [colors, updatingId, handleUpdate, handleUnpublish]);

  return (
    <Container padded={false}>
      <ScreenHeader title="Мои публикации" onBack={() => navigation.goBack()} bordered />

      {loading ? (
        <View style={s.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : myPublications.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Ты ещё ничего не публиковал"
          description="Поделись своими наборами карточек с другими пользователями"
          action={{
            label: 'Перейти в библиотеку',
            onPress: () => {
              navigation.goBack();
              // Navigate to Library tab
              navigation.navigate('Main' as any, { screen: 'Library' });
            },
          }}
        />
      ) : (
        <FlatList
          data={myPublications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Container>
  );
}

const s = StyleSheet.create({
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m, paddingHorizontal: spacing.xl },
  list: { padding: screenPadding, gap: spacing.s, paddingBottom: spacing.xxl },
  card: { borderRadius: borderRadius.l, borderWidth: 1, padding: spacing.m, gap: spacing.m },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  emojiBox: { width: 48, height: 48, borderRadius: borderRadius.m, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  verifiedBadge: { position: 'absolute', top: -spacing.xxs, right: -spacing.xxs, width: 18, height: 18, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  cardInfo: { flex: 1, gap: spacing.xxs },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  dateText: { fontSize: 12 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  statValue: { fontSize: 14, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  actionsRow: { flexDirection: 'row', gap: spacing.s },
  actionBtn: { flex: 1 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 36, borderRadius: borderRadius.m, borderWidth: 1 },
  pressed: { opacity: 0.85 },
});
